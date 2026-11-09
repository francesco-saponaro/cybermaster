import { describe, it, expect } from 'vitest';
import { splitArgs, parseNmap, parsePorts, execute, complete, expandTarget, lookupCves, type TermContext } from '../src/sim/terminal';
import { NET_SWEEP, NET_FALSE_POSITIVE, NET_SCOPE, NET_BOSS } from '../src/content/networks';

const ctx = (net = NET_SWEEP): TermContext => ({ net, history: [] });

describe('parsing a command line', () => {
  it('splits words and keeps quoted text together', () => {
    expect(splitArgs('vulndb "apache httpd" 2.4.49')).toEqual(['vulndb', 'apache httpd', '2.4.49']);
    expect(splitArgs("  nmap   -sV  -p 21,22   10.0.8.21 ")).toEqual(['nmap', '-sV', '-p', '21,22', '10.0.8.21']);
  });
  it('reads nmap flags and port lists', () => {
    const p = parseNmap(['-sV', '-p', '21,80-82', '10.0.8.21']);
    expect(p.ok && p.opts).toMatchObject({ versions: true, ports: [21, 80, 81, 82], targets: ['10.0.8.21'] });
    expect(parseNmap(['-p-', 'x']).ok && (parseNmap(['-p-', 'x']) as { opts: { ports: unknown } }).opts.ports).toBe('all');
    expect(parseNmap(['-p80', '10.0.8.1']).ok).toBe(true);
    expect(parseNmap(['--frobnicate', 'x'])).toEqual({ ok: false, error: expect.stringMatching(/unrecognized option/) });
    expect(parseNmap(['-sV']).ok).toBe(false);
    expect(parsePorts('70000')).toBeNull();
    expect(parsePorts('22,abc')).toBeNull();
  });
  it('expands a subnet, a range and a name', () => {
    expect(expandTarget('10.0.8.0/24', NET_SWEEP)).toEqual({ ips: ['10.0.8.1', '10.0.8.12', '10.0.8.15', '10.0.8.21', '10.0.8.40'], count: 256 });
    expect(expandTarget('10.0.8.10-20', NET_SWEEP)?.ips).toEqual(['10.0.8.12', '10.0.8.15']);
    expect(expandTarget('files.harbor.lan', NET_SWEEP)?.ips).toEqual(['10.0.8.21']);
    expect(expandTarget('10.0.8.99', NET_SWEEP)).toEqual({ ips: [], count: 1 });
  });
});

describe('the simulated nmap', () => {
  it('a ping sweep lists the five live hosts', () => {
    const r = execute('nmap -sn 10.0.8.0/24', ctx());
    expect(r.out.filter((l) => l.startsWith('Nmap scan report')).length).toBe(5);
    expect(r.out.at(-1)).toMatch(/256 IP addresses \(5 hosts up\)/);
    expect(r.facts).toContain('sweep:10.0.8.0/24');
    expect(r.out.join('\n')).not.toMatch(/PORT/);
  });
  it('a port scan shows open ports; -sV adds the version column', () => {
    const plain = execute('nmap 10.0.8.40', ctx()).out.join('\n');
    expect(plain).toMatch(/5432\/tcp open\s+postgresql/);
    expect(plain).not.toMatch(/VERSION/);
    const v = execute('nmap -sV -p 21 10.0.8.21', ctx());
    expect(v.out.join('\n')).toMatch(/21\/tcp open\s+ftp\s+vsftpd 2\.3\.4/);
    expect(v.facts).toContain('version:10.0.8.21:21');
  });
  it('lists closed ports that were asked for by number', () => {
    expect(execute('nmap -p 21,3389 10.0.8.21', ctx()).out.join('\n')).toMatch(/3389\/tcp closed ms-wbt-server/);
  });
  it('says a missing host seems down', () => {
    expect(execute('nmap 10.0.8.99', ctx()).out.join('\n')).toMatch(/Host seems down/);
  });
  it('refuses to scan an out-of-scope host and counts it as a mistake', () => {
    const r = execute('nmap 198.51.100.7', ctx(NET_SCOPE));
    expect(r.fail).toMatch(/out of scope/);
    expect(execute('curl -I http://staging.harbor.example', ctx(NET_SCOPE)).fail).toBeTruthy();
  });
});

describe('banners, DNS and the CVE lookup', () => {
  it('curl -I shows the real Server header', () => {
    const r = execute('curl -I http://10.0.8.15', ctx(NET_FALSE_POSITIVE));
    expect(r.out).toContain('Server: Apache/2.4.58 (Ubuntu)');
    expect(r.facts).toContain('banner:10.0.8.15:80');
  });
  it('the traversal path from the CVE gets a 400 on the patched server', () => {
    const r = execute('curl -i http://10.0.8.15/cgi-bin/.%2e/.%2e/etc/passwd', ctx(NET_FALSE_POSITIVE));
    expect(r.out[0]).toBe('HTTP/1.1 400 Bad Request');
  });
  it('nc reads an FTP banner; refused ports say so', () => {
    expect(execute('nc -v 10.0.8.21 21', ctx()).out.join('\n')).toMatch(/220 \(vsFTPd 2\.3\.4\)/);
    expect(execute('nc 10.0.8.21 25', ctx()).out[0]).toMatch(/Connection refused/);
  });
  it('dig and whois answer from the network data', () => {
    expect(execute('dig staging.harbor.example +short', ctx(NET_SCOPE)).out).toEqual(['198.51.100.7']);
    expect(execute('whois 198.51.100.7', ctx(NET_SCOPE)).out.join('\n')).toMatch(/Skyforge/);
  });
  it('vulndb finds the real CVEs for a product and version', () => {
    expect(lookupCves('vsftpd', '2.3.4').map((c) => c.id)).toEqual(['CVE-2011-2523']);
    expect(lookupCves('Apache', '2.4.49').map((c) => c.id)).toContain('CVE-2021-41773');
    expect(lookupCves('Apache httpd', '2.4.58')).toEqual([]);
    expect(execute('vulndb proftpd 1.3.5', ctx(NET_BOSS)).out.join('\n')).toMatch(/CVE-2015-3306/);
  });
  it('cat, ls, man, submit and unknown commands', () => {
    expect(execute('ls', ctx(NET_FALSE_POSITIVE)).out[0]).toBe('notes.txt  reports/');
    expect(execute('cat reports/scan-0311.txt', ctx(NET_FALSE_POSITIVE)).out.join('\n')).toMatch(/2\.4\.49/);
    expect(execute('cat nope', ctx()).out[0]).toMatch(/No such file/);
    expect(execute('man nmap', ctx()).man).toBe('nmap');
    expect(execute('submit CVE-2011-2523', ctx()).submit).toBe('CVE-2011-2523');
    expect(execute('hack the planet', ctx()).out[0]).toMatch(/command not found/);
  });
});

describe('tab completion', () => {
  it('completes commands, files and hosts', () => {
    expect(complete('nm', ctx()).line).toBe('nmap ');
    expect(complete('cat rep', ctx(NET_FALSE_POSITIVE)).line).toBe('cat reports/scan-0311.txt ');
    expect(complete('nc files', ctx()).line).toBe('nc files.harbor.lan ');
    const amb = complete('nmap 10.0.8.1', ctx());
    expect(amb.line).toBe('nmap 10.0.8.1');
    expect(amb.options).toEqual(expect.arrayContaining(['10.0.8.1', '10.0.8.12', '10.0.8.15']));
    expect(complete('man cu', ctx()).line).toBe('man curl ');
  });
});
