import type { TerminalLevel } from '../types';
import type { ChallengeGenerator } from './types';
import { asChallenge } from './types';
import { LEVEL_BY_ID } from '../index';
import type { Rng } from '../../engine/rng';
import type { Host, LinuxBox, Port } from '../../sim/terminal';
import { usableHosts } from '../../sim/linux';
import { authLog, labServer, officeNetwork, workstation, type OfficePlan } from '../boxes';
import { labNet, natNet, officeNotes, subnetNet } from '../levels/basics';

const guided = (id: string) => LEVEL_BY_ID[id] as TerminalLevel;

/** A different office each time: its private /24, your desk, its public address and name. */
function plan(rng: Rng): OfficePlan {
  const lan = rng.chance(0.5) ? `192.168.${rng.int(1, 250)}` : `10.${rng.int(0, 60)}.${rng.int(1, 250)}`;
  const bits = rng.pick([26, 27, 28] as const);
  const size = 2 ** (32 - bits);
  const blocks = 256 / size;
  const start = size * rng.int(blocks / 2, blocks - 1);
  const pub = rng.chance(0.5) ? `203.0.113.${rng.int(2, 250)}` : `198.51.100.${rng.int(2, 60)}`;
  return {
    lan,
    me: rng.int(10, 60),
    publicIp: pub,
    domain: rng.pick(['watch.example', 'watch-lyon.example', 'thewatch.example']),
    guest: { start, bits },
    printer: 0,
    attacker: `198.51.100.${rng.int(100, 250)}`,
  };
}

// ---- Subnets ------------------------------------------------------------------

const subnet: ChallengeGenerator = (rng) => {
  const p = plan(rng);
  const size = 2 ** (32 - p.guest.bits);
  const inside = rng.chance(0.5);
  p.printer = inside ? p.guest.start + rng.int(1, size - 2) : rng.int(p.me + 5, p.guest.start - 2);
  const guest = `${p.lan}.${p.guest.start}/${p.guest.bits}`;
  const n = usableHosts(p.guest.bits);
  const level = asChallenge(guided('net-subnet'), {
    goal: `Submit how many devices the guest Wi-Fi ${guest} holds, then whether the printer at ${p.lan}.${p.printer} is on it.`,
    instruction: 'Your notes list the office blocks; ipcalc works out the rest.',
    network: subnetNet(p),
    goals: [
      { id: 'notes', facts: ['cat:notes.txt'] },
      { id: 'office', facts: [`ipcalc:${p.lan}.0/24`] },
      { id: 'guest', facts: [`ipcalc:${guest}`] },
      { id: 'count', answers: [String(n)] },
      { id: 'printer', answers: inside ? ['yes', 'y'] : ['no', 'n'] },
    ],
    wrong: [
      { answers: [String(size)], reason: `A /${p.guest.bits} is ${size} addresses, but the network and broadcast addresses cannot go to a device.` },
      { answers: ['254', '256'], reason: 'That is the whole office /24. Submit the guest block\'s Hosts/Net.' },
      { answers: inside ? ['no', 'n'] : ['yes', 'y'], reason: `Compare ${p.lan}.${p.printer} with the guest block's HostMin and HostMax.` },
    ],
    otherwise: 'Not that. Submit the guest block\'s Hosts/Net, or yes or no for the printer.',
  });
  return {
    level,
    signature: `${guest}:${p.printer}`,
    hints: ['ipcalc takes a block like the ones in notes.txt and prints its first and last usable addresses.', `Run \`ipcalc ${guest}\` and read Hosts/Net, HostMin and HostMax.`, `Submit ${n}, then yes if the printer falls between HostMin and HostMax, no if not.`],
    solution: { kind: 'terminal', commands: ['cat notes.txt', `ipcalc ${p.lan}.0/24`, `ipcalc ${guest}`, `submit ${n}`, `submit ${inside ? 'yes' : 'no'}`] },
  };
};

// ---- NAT and DNS --------------------------------------------------------------

const nat: ChallengeGenerator = (rng) => {
  const p = plan(rng);
  const level = asChallenge(guided('net-dns-nat'), {
    goal: 'A client will allow-list the address our tests leave from. Submit it.',
    instruction: 'Your workstation has one address, and the internet sees another.',
    network: natNet(p),
    goals: [
      { id: 'local', facts: ['ip-addr'] },
      { id: 'route', facts: ['ip-route'] },
      { id: 'public', facts: ['public-ip'] },
      { id: 'dns', facts: [`dig:${p.domain}`] },
      { id: 'answer', answers: [p.publicIp] },
    ],
    wrong: [
      { answers: [`${p.lan}.${p.me}`], reason: 'That is your private address; the router replaces it before anything leaves.' },
      { answers: [`${p.lan}.1`], reason: "That is the router's inside address, not the one the internet sees." },
    ],
    otherwise: 'Not that address. Ask a website which address your request came from.',
  });
  return {
    level,
    signature: `${p.lan}.${p.me}:${p.publicIp}:${p.domain}`,
    hints: ['ip addr and ip route show the inside of the network; a website can tell you the outside.', 'Run `curl ifconfig.me`, then check our name with dig.', `Submit the address curl printed, and check \`dig ${p.domain} +short\` gives the same.`],
    solution: { kind: 'terminal', commands: ['ip addr', 'ip route', 'curl ifconfig.me', `dig ${p.domain} +short`, `submit ${p.publicIp}`] },
  };
};

// ---- TCP and UDP --------------------------------------------------------------

const UDP_ONLY: Port[] = [
  { port: 161, service: 'snmp', product: 'SNMPv1 server', extra: 'public', udp: true },
  { port: 69, service: 'tftp', udp: true },
  { port: 500, service: 'isakmp', udp: true },
  { port: 1900, service: 'upnp', product: 'MiniUPnP', udp: true },
];

const udp: ChallengeGenerator = (rng) => {
  const p = plan(rng);
  const target = rng.pick(UDP_ONLY);
  const quiet = rng.pick([123, 5353].filter((x) => x !== target.port));
  const tcpExtra = rng.pick([22, 443, 8080]);
  const router: Host = {
    ip: `${p.lan}.1`,
    name: 'gw',
    ports: [
      { port: 53, service: 'domain', product: 'dnsmasq', version: '2.90' },
      { port: 80, service: 'http', product: 'lighttpd', version: '1.4.76' },
      { port: tcpExtra, service: tcpExtra === 22 ? 'ssh' : tcpExtra === 443 ? 'https' : 'http-proxy' },
      { port: 53, service: 'domain', product: 'dnsmasq', version: '2.90', udp: true },
      { port: quiet, service: quiet === 123 ? 'ntp' : 'zeroconf', udp: true, state: 'open|filtered' },
      target,
    ],
  };
  const network = officeNetwork(p, workstation(p, officeNotes(p)), router);
  const level = asChallenge(guided('net-tcp-udp'), {
    goal: `The router at ${p.lan}.1 runs a service a TCP scan never sees. Submit its port number.`,
    instruction: 'Compare what the router shows over TCP with what it shows over UDP.',
    network,
    goals: [
      { id: 'tcp', facts: [`ports:${p.lan}.1`] },
      { id: 'udp', facts: [`uports:${p.lan}.1`] },
      { id: 'answer', answers: [String(target.port), `${target.port}/udp`, target.service] },
    ],
    wrong: [
      { answers: ['53', '53/udp'], reason: 'DNS answered on TCP 53 as well. Submit the UDP port the TCP scan did not show.' },
      { answers: [String(quiet), `${quiet}/udp`], reason: 'open|filtered means nothing came back, so it is not confirmed. Submit the one marked plainly open.' },
    ],
    otherwise: 'Not that one. Submit the UDP port marked open that TCP did not show.',
  });
  return {
    level,
    signature: `${p.lan}:${target.port}:${quiet}:${tcpExtra}`,
    hints: ['A normal nmap scan only checks TCP.', `UDP needs \`sudo nmap -sU ${p.lan}.1\`.`, 'Submit the UDP port marked open that was not in the TCP list.'],
    solution: { kind: 'terminal', commands: [`nmap ${p.lan}.1`, `sudo nmap -sU ${p.lan}.1`, `submit ${target.port}`] },
  };
};

// ---- Permissions ---------------------------------------------------------------

const SECRETS = ['.env', 'credentials.json', '.pgpass', 'stripe.key'];
const SCRIPTS = ['deploy.sh', 'backup.sh', 'renew-certs.sh', 'rotate-logs.sh'];

const perms: ChallengeGenerator = (rng) => {
  const p = plan(rng);
  const secret = rng.pick(SECRETS);
  const script = rng.pick(SCRIPTS);
  const secretMode = rng.pick([0o644, 0o664, 0o604]);
  const scriptMode = rng.pick([0o777, 0o757, 0o766]);
  const box: LinuxBox = labServer(p);
  delete box.files['/srv/shop/.env'];
  delete box.files['/srv/shop/deploy.sh'];
  box.files[`/srv/shop/${secret}`] = { mode: secretMode, owner: 'deploy', group: 'deploy', body: 'secret values (redacted)' };
  box.files[`/srv/shop/${script}`] = { mode: scriptMode, owner: 'deploy', group: 'deploy', size: 380 };
  const level = asChallenge(guided('linux-perms'), {
    goal: `On lab-01, make ${secret} readable by its owner only and stop others changing ${script}.`,
    instruction: 'Two files in /srv/shop have permissions that are too open.',
    network: labNet(p, box),
    goals: [
      { id: 'look', facts: [`ls:${secret}`] },
      { id: 'env', facts: [`chmod-private:${secret}`] },
      { id: 'script', facts: [`chmod-nowrite:${script}`] },
      { id: 'verify', facts: [`private:${secret}`] },
    ],
  });
  return {
    level,
    signature: `${secret}:${secretMode}:${script}:${scriptMode}`,
    hints: ['ls with -l shows permissions and -a shows hidden files.', `\`chmod 600 ${secret}\` leaves only the owner; \`chmod 755 ${script}\` takes write away from others.`, 'Run `ls -la` again to check.'],
    solution: { kind: 'terminal', commands: ['ls -la', `chmod 600 ${secret}`, `chmod 755 ${script}`, 'ls -la'] },
  };
};

// ---- Services --------------------------------------------------------------------

const EXPOSED = [
  { unit: 'redis-server', process: '/usr/bin/redis-server', user: 'redis', port: 6379, description: 'Advanced key-value store' },
  { unit: 'memcached', process: '/usr/bin/memcached', user: 'memcache', port: 11211, description: 'memcached daemon' },
  { unit: 'mongod', process: '/usr/bin/mongod', user: 'mongodb', port: 27017, description: 'MongoDB Database Server' },
  { unit: 'elasticsearch', process: '/usr/share/elasticsearch/jdk/bin/java', user: 'elasticsearch', port: 9200, description: 'Elasticsearch' },
];

const services: ChallengeGenerator = (rng) => {
  const p = plan(rng);
  const s = rng.pick(EXPOSED);
  const pid = rng.int(780, 990);
  const box = labServer(p);
  box.services.push({ unit: s.unit, description: s.description, process: s.process, user: s.user, pid, enabled: true, active: true, listen: [{ proto: 'tcp', addr: '0.0.0.0', port: s.port }] });
  const level = asChallenge(guided('linux-services'), {
    goal: `Something on lab-01 listens on port ${s.port} for the whole network, and nothing uses it. Switch it off for good and prove the port is closed.`,
    instruction: 'Find the service behind the port, then stop it now and at boot.',
    network: labNet(p, box),
    goals: [
      { id: 'procs', facts: [`proc:${s.unit}`] },
      { id: 'sockets', facts: [`exposed:${s.port}`] },
      { id: 'off', facts: [`off:${s.unit}`] },
      { id: 'closed', facts: [`closed:${s.port}`] },
    ],
  });
  return {
    level,
    signature: `${s.unit}:${pid}:${p.lan}`,
    hints: ['`ps aux` lists processes and `sudo ss -tlnp` shows which one owns each port.', `\`sudo systemctl disable --now ${s.unit}\` stops it now and at boot.`, `Check with \`systemctl status ${s.unit}\` and \`sudo ss -tlnp\`.`],
    solution: { kind: 'terminal', commands: ['ps aux', 'sudo ss -tlnp', `sudo systemctl disable --now ${s.unit}`, `systemctl status ${s.unit}`, 'sudo ss -tlnp'] },
  };
};

// ---- Firewall ---------------------------------------------------------------------

const firewall: ChallengeGenerator = (rng) => {
  const p = plan(rng);
  const office = `${p.lan}.0/24`;
  const app = rng.pick([3000, 8080, 9000]);
  const box = labServer(p);
  box.services.push({ unit: 'shop-api', description: 'Shop API (Node.js)', process: 'node /srv/shop/server.js', user: 'deploy', pid: rng.int(800, 990), enabled: true, active: true, listen: [{ proto: 'tcp', addr: '0.0.0.0', port: app }] });
  box.files['/var/log/auth.log']!.body = authLog(p, rng.sample(['root', 'admin', 'ubuntu', 'test', 'oracle', 'git', 'pi', 'user', 'support', 'deploy'], 7));
  box.want = { 22: 'office-only', 443: 'public', 80: 'closed', 5432: 'closed', [app]: 'closed' };
  const limit = rng.chance(0.5);
  const level = asChallenge(guided('linux-firewall'), {
    goal: `lab-01 is under a password-guessing run from ${p.attacker}. SSH from ${office} only, HTTPS for everyone, nothing else.`,
    instruction: 'You are connected over SSH from the office, so the order matters.',
    network: labNet(p, box),
    goals: [
      { id: 'log', facts: ['read:/var/log/auth.log'] },
      { id: 'deny', facts: ['set:default-deny', 'fw:default-deny'] },
      { id: 'ssh', facts: [`ufw-rule:allow:22:${office}`, `ufw-rule:limit:22:${office}`] },
      { id: 'https', facts: ['ufw-rule:allow:443:any'] },
      { id: 'enable', facts: ['ufw-on'] },
      { id: 'verify', facts: ['fw:as-planned'] },
    ],
  });
  return {
    level,
    signature: `${office}:${p.attacker}:${app}:${limit}`,
    hints: ['Read /var/log/auth.log with sudo tail, then plan: deny by default, allow what is needed, enable, check.', `Allow SSH with \`sudo ufw ${limit ? 'limit' : 'allow'} from ${office} to any port 22 proto tcp\` before you enable anything.`, 'Then `sudo ufw allow 443/tcp`, `sudo ufw enable` and `sudo ufw status verbose`.'],
    solution: {
      kind: 'terminal',
      commands: ['sudo tail /var/log/auth.log', 'sudo ufw default deny incoming', `sudo ufw ${limit ? 'limit' : 'allow'} from ${office} to any port 22 proto tcp`, 'sudo ufw allow 443/tcp', 'sudo ufw enable', 'sudo ufw status verbose'],
    },
  };
};

export const BASICS_CHALLENGES: Record<string, ChallengeGenerator> = {
  'net-subnet': subnet,
  'net-dns-nat': nat,
  'net-tcp-udp': udp,
  'linux-perms': perms,
  'linux-services': services,
  'linux-firewall': firewall,
};
