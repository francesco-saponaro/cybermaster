// The machines behind The Basics: the Watch's office network, your
// workstation on it, and lab-01, the practice server. Addresses are private
// ranges or the documentation blocks (203.0.113.0/24, 198.51.100.0/24).

import type { BoxService, Host, LinuxBox, Network } from '../sim/terminal';

export interface OfficePlan {
  /** First three octets of the office /24, like 192.168.40 */
  lan: string;
  /** Last octet of your workstation. */
  me: number;
  publicIp: string;
  domain: string;
  /** The guest Wi-Fi block, a /27 or /28 cut from the top of the office /24. */
  guest: { start: number; bits: number };
  printer: number;
  attacker: string;
}

export const OFFICE: OfficePlan = {
  lan: '192.168.40',
  me: 23,
  publicIp: '203.0.113.45',
  domain: 'watch.example',
  guest: { start: 192, bits: 27 },
  printer: 201,
  attacker: '198.51.100.66',
};

const svc = (unit: string, description: string, process: string, user: string, pid: number, listen: BoxService['listen'], keep?: string): BoxService => ({ unit, description, process, user, pid, enabled: true, active: true, listen, ...(keep ? { keep } : {}) });

export const SSHD = (keep = 'it is the SSH service your own session runs on.') => svc('ssh', 'OpenBSD Secure Shell server', 'sshd', 'root', 655, [{ proto: 'tcp', addr: '0.0.0.0', port: 22 }], keep);

/** Your workstation on the office network, for the networking levels. */
export function workstation(p: OfficePlan, notes: string): LinuxBox {
  return {
    hostname: 'watch',
    user: 'analyst',
    uid: 1000,
    groups: ['analyst', 'sudo'],
    home: '/home/analyst',
    cwd: '/home/analyst',
    iface: { name: 'eth0', ip: `${p.lan}.${p.me}`, prefix: 24, mac: '52:54:00:3a:1c:7e' },
    gateway: `${p.lan}.1`,
    publicIp: p.publicIp,
    files: { '/home/analyst/notes.txt': { mode: 0o644, owner: 'analyst', group: 'analyst', body: notes } },
    services: [SSHD()],
    ufw: { active: false, defaultIn: 'allow', rules: [] },
  };
}

/** The office network: the router, a few desks and the printer, and DNS for our own domain. */
export function officeNetwork(p: OfficePlan, box: LinuxBox, router: Host): Network {
  return {
    cidr: `${p.lan}.0/24`,
    hosts: [router, { ip: `${p.lan}.${p.me}`, name: 'watch', ports: [{ port: 22, service: 'ssh', product: 'OpenSSH', version: '9.6p1' }] }, { ip: `${p.lan}.${p.printer}`, name: 'printer', ports: [{ port: 631, service: 'ipp', product: 'CUPS', version: '2.4' }] }],
    dns: {
      [p.domain]: { A: [p.publicIp], MX: [`10 mail.${p.domain}.`] },
      [`www.${p.domain}`]: { A: [p.publicIp] },
    },
    whois: {},
    files: {},
    box,
  };
}

/** The office router: DNS and an admin page on TCP, and on UDP DNS, time and SNMP. */
export function officeRouter(p: OfficePlan, snmp = 161): Host {
  return {
    ip: `${p.lan}.1`,
    name: 'gw',
    ports: [
      { port: 53, service: 'domain', product: 'dnsmasq', version: '2.90' },
      { port: 80, service: 'http', product: 'lighttpd', version: '1.4.76' },
      { port: 53, service: 'domain', product: 'dnsmasq', version: '2.90', udp: true },
      { port: 123, service: 'ntp', udp: true, state: 'open|filtered' },
      { port: snmp, service: 'snmp', product: 'SNMPv1 server', extra: 'public', udp: true },
    ],
  };
}

export const SHOP_ENV = 'NODE_ENV=production\nDATABASE_URL=postgres://shop:(redacted)@127.0.0.1:5432/shop\nSESSION_SECRET=(redacted)\nSTRIPE_KEY=(redacted)';

/** lab-01, the Watch's practice server: the shop's code in /srv/shop and the services it runs. */
export function labServer(p: OfficePlan, over: Partial<LinuxBox> = {}): LinuxBox {
  return {
    hostname: 'lab-01',
    user: 'deploy',
    uid: 1001,
    groups: ['deploy', 'sudo'],
    home: '/home/deploy',
    cwd: '/srv/shop',
    iface: { name: 'eth0', ip: `${p.lan}.50`, prefix: 24, mac: '52:54:00:9b:41:02' },
    gateway: `${p.lan}.1`,
    publicIp: p.publicIp,
    sshFrom: `${p.lan}.${p.me}`,
    internet: p.attacker,
    files: {
      '/home/deploy/notes.txt': { mode: 0o644, owner: 'deploy', group: 'deploy', body: 'lab-01: practice copy of the shop.\nCode in /srv/shop. Logs in /var/log.' },
      '/srv/shop/.env': { mode: 0o644, owner: 'deploy', group: 'deploy', body: SHOP_ENV },
      '/srv/shop/server.js': { mode: 0o644, owner: 'deploy', group: 'deploy', size: 2817 },
      '/srv/shop/package.json': { mode: 0o644, owner: 'deploy', group: 'deploy', size: 611 },
      '/srv/shop/deploy.sh': { mode: 0o755, owner: 'deploy', group: 'deploy', size: 433, body: '#!/bin/sh\ngit pull && npm ci && systemctl restart shop' },
      '/srv/shop/public': { mode: 0o755, owner: 'deploy', group: 'deploy', dir: true },
      '/srv/shop/public/index.html': { mode: 0o644, owner: 'deploy', group: 'deploy', size: 1204 },
      '/var/log/auth.log': { mode: 0o640, owner: 'syslog', group: 'adm', body: '' },
    },
    services: [
      SSHD(),
      svc('nginx', 'A high performance web server and a reverse proxy server', 'nginx: master process /usr/sbin/nginx', 'root', 701, [{ proto: 'tcp', addr: '0.0.0.0', port: 80 }, { proto: 'tcp', addr: '0.0.0.0', port: 443 }], 'nginx serves the shop.'),
      svc('postgresql', 'PostgreSQL RDBMS', 'postgres', 'postgres', 744, [{ proto: 'tcp', addr: '127.0.0.1', port: 5432 }], 'the shop keeps its orders in PostgreSQL.'),
    ],
    ufw: { active: false, defaultIn: 'allow', rules: [] },
    ...over,
  };
}

/** auth.log during a brute-force run: password guesses from one address, and your own key login. */
export function authLog(p: OfficePlan, users = ['root', 'admin', 'ubuntu', 'test', 'oracle', 'deploy', 'git', 'postgres']): string {
  const lines = [`Nov 13 07:12:40 lab-01 sshd[3911]: Accepted publickey for deploy from ${p.lan}.${p.me} port 50122 ssh2: ED25519 SHA256:(your key)`];
  let sec = 3;
  users.forEach((u, i) => {
    const inv = u === 'root' || u === 'deploy' || u === 'postgres' ? '' : 'invalid user ';
    lines.push(`Nov 13 07:21:${String(sec).padStart(2, '0')} lab-01 sshd[${4120 + i * 2}]: Failed password for ${inv}${u} from ${p.attacker} port ${51430 + i * 17} ssh2`);
    sec += 1;
  });
  lines.push(`Nov 13 07:21:${String(sec).padStart(2, '0')} lab-01 sshd[4141]: error: maximum authentication attempts exceeded for root from ${p.attacker} port 51611 ssh2 [preauth]`);
  return lines.join('\n');
}
