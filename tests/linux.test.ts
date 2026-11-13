import { describe, expect, it } from 'vitest';
import { execute, type CommandResult, type Network } from '../src/sim/terminal';
import { applyChmod, ipcalc, modeString, parseUfwRule, ufwAllows, usableHosts } from '../src/sim/linux';
import { LEVEL_BY_ID } from '../src/content/index';
import type { TerminalLevel } from '../src/content/types';
import { evaluateTerminal } from '../src/game/evaluate';

/** Run lines in order the way the terminal does, history included, and collect every fact. */
function session(net: Network, lines: string[]): { results: CommandResult[]; facts: string[] } {
  const history: string[] = [];
  const results: CommandResult[] = [];
  for (const l of lines) {
    history.push(l);
    results.push(execute(l, { net, history }));
  }
  return { results, facts: results.flatMap((r) => r.facts) };
}

const net = (id: string) => (LEVEL_BY_ID[id] as TerminalLevel).network;
const text = (r: CommandResult) => r.out.join('\n');

describe('subnets', () => {
  it('ipcalc works out the range like the real tool', () => {
    const r = ipcalc(['192.168.40.201/27']);
    const t = text(r);
    expect(t).toMatch(/Network:\s+192\.168\.40\.192\/27/);
    expect(t).toMatch(/HostMin:\s+192\.168\.40\.193/);
    expect(t).toMatch(/HostMax:\s+192\.168\.40\.222/);
    expect(t).toMatch(/Broadcast:\s+192\.168\.40\.223/);
    expect(t).toMatch(/Hosts\/Net:\s+30\s+Class C, Private Internet/);
    expect(t).toMatch(/255\.255\.255\.224 = 27/);
    expect(r.facts).toContain('ipcalc:192.168.40.192/27');
  });
  it('counts usable hosts for every prefix', () => {
    expect([24, 25, 26, 27, 28, 30, 31, 32].map(usableHosts)).toEqual([254, 126, 62, 30, 14, 2, 2, 1]);
    expect(text(ipcalc(['10.4.0.0/16']))).toMatch(/Hosts\/Net:\s+65534/);
    expect(ipcalc(['300.1.1.1/24']).fail).toBeTruthy();
  });
});

describe('the workstation: addresses, NAT and UDP', () => {
  it('shows the private address, the router and the public address', () => {
    const n = net('net-dns-nat');
    expect(text(execute('ip addr', { net: n, history: [] }))).toMatch(/inet 192\.168\.40\.23\/24 brd 192\.168\.40\.255/);
    expect(text(execute('ip route', { net: n, history: [] }))).toMatch(/^default via 192\.168\.40\.1 dev eth0/);
    expect(execute('curl ifconfig.me', { net: n, history: [] }).out).toEqual(['203.0.113.45']);
    expect(execute('dig watch.example +short', { net: n, history: [] }).out).toEqual(['203.0.113.45']);
  });
  it('a UDP scan needs root, and shows what TCP cannot', () => {
    const n = net('net-tcp-udp');
    const tcp = text(execute('nmap 192.168.40.1', { net: n, history: [] }));
    expect(tcp).toMatch(/53\/tcp\s+open/);
    expect(tcp).not.toMatch(/161/);
    expect(execute('nmap -sU 192.168.40.1', { net: n, history: [] }).fail).toMatch(/sudo/);
    const udp = execute('sudo nmap -sU 192.168.40.1', { net: n, history: [] });
    expect(text(udp)).toMatch(/161\/udp\s+open\s+snmp/);
    expect(text(udp)).toMatch(/123\/udp\s+open\|filtered\s+ntp/);
    expect(text(udp)).toMatch(/closed udp ports \(port-unreach\)/);
    expect(udp.facts).toEqual(expect.arrayContaining(['udp:192.168.40.1:161', 'udp-maybe:192.168.40.1:123', 'uports:192.168.40.1']));
  });
  it('sudo stays refused on the client engagements, where there is no box', () => {
    expect(text(execute('sudo nmap -sU 10.0.8.1', { net: net('perimeter-sweep'), history: [] }))).toMatch(/not in the sudoers file/);
  });
});

describe('permissions', () => {
  it('reads and writes modes in numbers and letters', () => {
    expect(modeString(0o644)).toBe('-rw-r--r--');
    expect(modeString(0o755, true)).toBe('drwxr-xr-x');
    expect(applyChmod(0o644, '600')).toBe(0o600);
    expect(applyChmod(0o644, 'o-r')).toBe(0o640);
    expect(applyChmod(0o777, 'go-w')).toBe(0o755);
    expect(applyChmod(0o644, 'u=rw,go=')).toBe(0o600);
    expect(applyChmod(0o644, 'banana')).toBeNull();
  });
  it('hides dotfiles without -a, and remembers a chmod for the next ls', () => {
    const n = net('linux-perms');
    expect(text(execute('ls -l', { net: n, history: [] }))).not.toMatch(/\.env/);
    const { results, facts } = session(n, ['ls -la', 'chmod 600 .env', 'ls -l .env']);
    expect(text(results[0]!)).toMatch(/-rw-r--r-- 1 deploy\s+deploy .* \.env/);
    expect(text(results[0]!)).toMatch(/-rwxrwxrwx .* deploy\.sh/);
    expect(text(results[2]!)).toMatch(/^-rw------- 1 deploy/);
    expect(facts).toEqual(expect.arrayContaining(['world-readable:.env', 'chmod-private:.env', 'private:.env']));
  });
  it('refuses a mode that makes things worse, and files you do not own', () => {
    const n = net('linux-perms');
    expect(execute('chmod 666 .env', { net: n, history: ['chmod 666 .env'] }).fail).toMatch(/worse/);
    expect(execute('chmod 600 /var/log/auth.log', { net: n, history: ['x'] }).fail).toMatch(/owner or root/);
    expect(execute('cat /var/log/auth.log', { net: n, history: ['x'] }).fail).toMatch(/sudo/);
  });
});

describe('services', () => {
  it('ss tells local from exposed, and a stopped service frees its port', () => {
    const n = net('linux-services');
    const { results, facts } = session(n, ['sudo ss -tlnp', 'sudo systemctl disable --now redis-server', 'systemctl status redis-server', 'sudo ss -tlnp']);
    expect(text(results[0]!)).toMatch(/0\.0\.0\.0:6379 .*redis-server/);
    expect(text(results[0]!)).toMatch(/127\.0\.0\.1:5432/);
    expect(text(results[2]!)).toMatch(/disabled;.*\n.*inactive \(dead\)/);
    expect(text(results[3]!)).not.toMatch(/6379/);
    expect(facts).toEqual(expect.arrayContaining(['exposed:6379', 'local:5432', 'off:redis-server', 'closed:6379']));
  });
  it('changing a service needs sudo, and the shop and your own SSH stay up', () => {
    const n = net('linux-services');
    expect(execute('systemctl stop redis-server', { net: n, history: ['x'] }).fail).toMatch(/sudo/);
    expect(execute('sudo systemctl stop nginx', { net: n, history: ['x'] }).fail).toMatch(/serves the shop/);
    expect(execute('sudo systemctl disable ssh', { net: n, history: ['x'] }).fail).toBeTruthy();
  });
  it('stop without disable comes back at boot: status still says enabled', () => {
    const { results } = session(net('linux-services'), ['sudo systemctl stop redis-server', 'systemctl status redis-server']);
    expect(text(results[1]!)).toMatch(/enabled;/);
    expect(results[1]!.facts).not.toContain('off:redis-server');
  });
});

describe('the firewall', () => {
  it('reads rules the way ufw does', () => {
    expect(parseUfwRule(['allow', '443/tcp'])).toEqual({ action: 'allow', from: 'any', port: 443, proto: 'tcp' });
    expect(parseUfwRule(['allow', 'ssh'])).toEqual({ action: 'allow', from: 'any', port: 22, proto: 'tcp' });
    expect(parseUfwRule(['limit', 'from', '10.0.0.0/8', 'to', 'any', 'port', '22', 'proto', 'tcp'])).toEqual({ action: 'limit', from: '10.0.0.0/8', port: 22, proto: 'tcp' });
    expect(typeof parseUfwRule(['allow', 'from', 'nowhere'])).toBe('string');
  });
  it('enabling deny-by-default before allowing your own SSH locks you out, and is rolled back', () => {
    const n = net('linux-firewall');
    const { results } = session(n, ['sudo ufw default deny incoming', 'sudo ufw enable', 'sudo ufw status']);
    expect(results[1]!.fail).toMatch(/locked yourself out/);
    expect(text(results[1]!)).toMatch(/closed by remote host/);
    expect(results[2]!.out).toEqual(['Status: inactive']);
  });
  it('the right order ends with SSH for the office only and HTTPS for everyone', () => {
    const n = net('linux-firewall');
    const lines = ['sudo tail /var/log/auth.log', 'sudo ufw default deny incoming', 'sudo ufw allow from 192.168.40.0/24 to any port 22 proto tcp', 'sudo ufw allow 443/tcp', 'sudo ufw enable', 'sudo ufw status verbose'];
    const { results, facts } = session(n, lines);
    expect(text(results[0]!)).toMatch(/Failed password for root from 198\.51\.100\.66/);
    const status = text(results[5]!);
    expect(status).toMatch(/Default: deny \(incoming\)/);
    expect(status).toMatch(/22\/tcp\s+ALLOW IN\s+192\.168\.40\.0\/24/);
    expect(status).toMatch(/443\/tcp \(v6\)\s+ALLOW IN\s+Anywhere \(v6\)/);
    expect(facts).toEqual(expect.arrayContaining(['fw:22:office-only', 'fw:443:public', 'fw:80:closed', 'fw:as-planned']));
    const level = LEVEL_BY_ID['linux-firewall'] as TerminalLevel;
    expect(Object.values(evaluateTerminal(level, facts, [])).every(Boolean)).toBe(true);
  });
  it('one broad allow undoes the plan, and the first matching rule wins', () => {
    const n = net('linux-firewall');
    const { facts } = session(n, ['sudo ufw default deny incoming', 'sudo ufw allow 22', 'sudo ufw allow 443/tcp', 'sudo ufw enable', 'sudo ufw status verbose']);
    expect(facts).toContain('fw:22:public');
    expect(facts).not.toContain('fw:as-planned');
    const box = { ...n.box!, ufw: { active: true, defaultIn: 'deny' as const, rules: [{ action: 'deny' as const, port: 22, from: '198.51.100.66' }, { action: 'allow' as const, port: 22, from: 'any' }] } };
    expect(ufwAllows(box, 22, 'tcp', '198.51.100.66')).toBe(false);
    expect(ufwAllows(box, 22, 'tcp', '198.51.100.7')).toBe(true);
    const flipped = { ...box, ufw: { ...box.ufw, rules: [...box.ufw.rules].reverse() } };
    expect(ufwAllows(flipped, 22, 'tcp', '198.51.100.66')).toBe(true);
  });
  it('ufw needs root, and deleting a rule by number works', () => {
    const n = net('linux-firewall');
    expect(execute('ufw status', { net: n, history: ['x'] }).fail).toMatch(/sudo/);
    const { results } = session(n, ['sudo ufw allow 22', 'sudo ufw allow 443/tcp', 'sudo ufw delete 1', 'sudo ufw default deny incoming', 'sudo ufw allow from 192.168.40.0/24 to any port 22 proto tcp', 'sudo ufw enable', 'sudo ufw status numbered']);
    const t = text(results[6]!);
    expect(t).not.toMatch(/22\s+ALLOW IN\s+Anywhere/);
    expect(t).toMatch(/\[ 1\] 443\/tcp/);
  });
});

describe('the shell on a box', () => {
  it('knows who you are, with and without sudo', () => {
    const n = net('linux-perms');
    expect(execute('whoami', { net: n, history: [] }).out).toEqual(['deploy']);
    expect(execute('sudo whoami', { net: n, history: [] }).out).toEqual(['root']);
    expect(text(execute('id', { net: n, history: [] }))).toMatch(/uid=1001\(deploy\).*27\(sudo\)/);
    expect(execute('pwd', { net: n, history: [] }).out).toEqual(['/srv/shop']);
  });
  it('cd moves and stays moved', () => {
    const { results } = session(net('linux-perms'), ['cd /home/deploy', 'pwd', 'cat notes.txt']);
    expect(results[1]!.out).toEqual(['/home/deploy']);
    expect(text(results[2]!)).toMatch(/practice copy/);
  });
  it('grep counts the failed logins', () => {
    const r = execute('sudo grep -c "Failed password" /var/log/auth.log', { net: net('linux-firewall'), history: ['x'] });
    expect(Number(r.out[0])).toBeGreaterThanOrEqual(5);
  });
});
