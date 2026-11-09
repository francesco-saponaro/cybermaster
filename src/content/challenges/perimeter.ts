import type { TerminalLevel } from '../types';
import type { ChallengeGenerator } from './types';
import { asChallenge } from './types';
import { LEVEL_BY_ID } from '../index';
import type { Rng } from '../../engine/rng';
import type { Host, Network, Port, HttpService } from '../../sim/terminal';
import { VULNDB } from '../../sim/terminal';

const guided = (id: string) => LEVEL_BY_ID[id] as TerminalLevel;

const web = (server: string, title: string): HttpService => ({
  status: 200,
  headers: [
    ['Date', 'Mon, 09 Nov 2026 09:14:02 GMT'],
    ['Server', server],
    ['Content-Type', 'text/html; charset=UTF-8'],
  ],
  body: `<!doctype html><title>${title}</title><h1>${title}</h1>`,
});

const SSH: Port = { port: 22, service: 'ssh', product: 'OpenSSH', version: '9.6p1', extra: 'Ubuntu 3ubuntu13.5 (Ubuntu Linux; protocol 2.0)', banner: 'SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5' };
const NGINX: Port = { port: 80, service: 'http', product: 'nginx', version: '1.24.0', extra: '(Ubuntu)', http: web('nginx/1.24.0 (Ubuntu)', 'Internal site') };
const HTTPS: Port = { port: 443, service: 'https', product: 'nginx', version: '1.24.0', http: web('nginx', 'Portal') };
const POSTFIX: Port = { port: 25, service: 'smtp', product: 'Postfix smtpd', banner: '220 mail ESMTP Postfix (Ubuntu)' };
const SAFE_FTP: Port = { port: 21, service: 'ftp', product: 'vsftpd', version: '3.0.5', banner: '220 (vsFTPd 3.0.5)' };

const ROLES = ['gw', 'intranet', 'web-01', 'web-02', 'files', 'db-02', 'print', 'backup', 'mail', 'build', 'cams', 'nas', 'vpn', 'wiki'];

function subnet(rng: Rng): { prefix: string; cidr: string } {
  const prefix = `10.${rng.int(0, 30)}.${rng.int(1, 250)}.`;
  return { prefix, cidr: `${prefix}0/24` };
}

/** `n` distinct addresses in a /24, sorted the way nmap prints them. */
function addresses(rng: Rng, prefix: string, n: number): string[] {
  return rng
    .sample(Array.from({ length: 250 }, (_, i) => i + 2), n)
    .sort((a, b) => a - b)
    .map((x) => prefix + x);
}

const lan = (rng: Rng) => rng.pick(['harbor.lan', 'lantern.lan', 'dock.lan']);

const NOTES = (cidr: string) => `Engagement: Lantern & Co., internal network ${cidr}.\nAuthorised by: Claire Martin (CTO), signed 2026-11-02.`;

// ---- Sweep ------------------------------------------------------------------

const sweep: ChallengeGenerator = (rng) => {
  const { prefix, cidr } = subnet(rng);
  const n = rng.int(3, 9);
  const domain = lan(rng);
  const names = rng.sample(ROLES, n);
  const hosts: Host[] = addresses(rng, prefix, n).map((ip, i) => ({ ip, name: `${names[i]}.${domain}`, ports: [SSH] }));
  const network: Network = { cidr, hosts, dns: {}, whois: {}, files: { 'notes.txt': NOTES(cidr) } };
  const level = asChallenge(guided('perimeter-sweep'), {
    goal: `Count the live hosts on ${cidr} and submit the number.`,
    instruction: 'A new office range, nothing known about it yet.',
    network,
    goals: [
      { id: 'sweep', facts: ['sweep:*'] },
      { id: 'answer', answers: [String(n)] },
    ],
    wrong: [{ answers: ['256', '254'], reason: 'That is how many addresses nmap asked, not how many answered.' }],
    otherwise: 'Not that number. Count the hosts that answered.',
  });
  return {
    level,
    signature: `${cidr}:${n}`,
    hints: ['nmap has a quick mode that only asks which addresses are switched on.', `Run \`nmap -sn ${cidr}\`.`, 'Submit the number just before "hosts up" on the last line.'],
    solution: { kind: 'terminal', commands: [`nmap -sn ${cidr}`, `submit ${n}`] },
  };
};

// ---- Ports ------------------------------------------------------------------

const DATABASES: { name: string; port: Port }[] = [
  { name: 'PostgreSQL', port: { port: 5432, service: 'postgresql', product: 'PostgreSQL DB', version: '16.4' } },
  { name: 'MySQL', port: { port: 3306, service: 'mysql', product: 'MySQL', version: '8.0.39' } },
  { name: 'Redis', port: { port: 6379, service: 'redis', product: 'Redis key-value store', version: '7.2.5' } },
  { name: 'MongoDB', port: { port: 27017, service: 'mongodb', product: 'MongoDB', version: '7.0.12' } },
  { name: 'Elasticsearch', port: { port: 9200, service: 'http', product: 'Elasticsearch REST API', version: '8.15.0' } },
];
const PLAIN = [[SSH, NGINX], [SSH], [SSH, HTTPS], [POSTFIX, SSH], [SAFE_FTP, SSH]];

const ports: ChallengeGenerator = (rng) => {
  const { prefix, cidr } = subnet(rng);
  const n = rng.int(4, 6);
  const domain = lan(rng);
  const [db, decoy] = rng.sample(DATABASES, 2) as [(typeof DATABASES)[number], (typeof DATABASES)[number]];
  const ips = addresses(rng, prefix, n);
  const names = rng.sample(ROLES, n);
  const target = rng.int(0, n - 1);
  const withDecoy = rng.chance(0.5);
  const decoyAt = withDecoy ? (target + 1) % n : -1;
  const hosts: Host[] = ips.map((ip, i) => ({
    ip,
    name: `${names[i]}.${domain}`,
    ports: i === target ? [SSH, db.port] : i === decoyAt ? [SSH, decoy.port] : rng.pick(PLAIN),
  }));
  const t = hosts[target]!;
  const network: Network = { cidr, hosts, dns: {}, whois: {}, files: { 'notes.txt': NOTES(cidr) } };
  const level = asChallenge(guided('perimeter-ports'), {
    goal: `One host has its ${db.name} database open to the whole office. Submit its address.`,
    instruction: `Somewhere on ${cidr} a database answers anyone on the network.`,
    network,
    goals: [
      { id: 'scan', facts: ['ports:*'] },
      { id: 'answer', answers: [t.ip, t.name!] },
    ],
    wrong: [
      ...(withDecoy ? [{ answers: [hosts[decoyAt]!.ip], reason: `That host runs ${decoy.name}, not ${db.name}.` }] : []),
      { answers: [String(db.port.port)], reason: 'That is the port number. Submit the address of the host that has it open.' },
    ],
    otherwise: `That is not the ${db.name} host.`,
  });
  return {
    level,
    signature: `${cidr}:${db.name}:${t.ip}:${withDecoy}`,
    hints: [`${db.name} listens on port ${db.port.port} by default.`, `Scan the whole range for open ports: \`nmap ${cidr}\`.`, `Find \`${db.port.port}/tcp\` in the output and submit the address on the "Nmap scan report for" line above it.`],
    solution: { kind: 'terminal', commands: [`nmap ${cidr}`, `submit ${t.ip}`] },
  };
};

// ---- Versions ---------------------------------------------------------------

interface Vuln {
  kind: string;
  key: string;
  port: Port;
}

const VULNS: Vuln[] = [
  { kind: 'FTP server', key: 'vsftpd 2.3.4', port: { port: 21, service: 'ftp', product: 'vsftpd', version: '2.3.4', banner: '220 (vsFTPd 2.3.4)' } },
  { kind: 'FTP server', key: 'proftpd 1.3.5', port: { port: 21, service: 'ftp', product: 'ProFTPD', version: '1.3.5', banner: '220 ProFTPD 1.3.5 Server (files) [10.0.0.1]' } },
  { kind: 'mail server', key: 'exim 4.89', port: { port: 25, service: 'smtp', product: 'Exim smtpd', version: '4.89', banner: '220 mail ESMTP Exim 4.89 Mon, 09 Nov 2026 10:14:02 +0100' } },
  { kind: 'file share', key: 'samba 4.5.9', port: { port: 445, service: 'netbios-ssn', product: 'Samba smbd', version: '4.5.9' } },
  { kind: 'admin panel', key: 'webmin 1.890', port: { port: 10000, service: 'http', product: 'Webmin', version: '1.890', extra: '(MiniServ httpd)', http: web('MiniServ/1.890', 'Webmin') } },
  { kind: 'dashboard', key: 'grafana 8.3.0', port: { port: 3000, service: 'http', product: 'Grafana', version: '8.3.0', http: web('Grafana', 'Grafana') } },
];

const cveOf = (key: string) => VULNDB[key]![0]!.id;

const versions: ChallengeGenerator = (rng) => {
  const { prefix, cidr } = subnet(rng);
  const v = rng.pick(VULNS);
  const ips = addresses(rng, prefix, 4);
  const domain = lan(rng);
  const at = rng.int(0, 3);
  const ip = ips[at]!;
  // Half the time the same host also runs an old SSH with a CVE of its own, as a decoy.
  const oldSsh = rng.chance(0.5);
  const ssh: Port = oldSsh ? { port: 22, service: 'ssh', product: 'OpenSSH', version: '7.2p2', extra: 'Ubuntu 4ubuntu2.10 (Ubuntu Linux; protocol 2.0)', banner: 'SSH-2.0-OpenSSH_7.2p2 Ubuntu-4ubuntu2.10' } : SSH;
  const hosts: Host[] = ips.map((x, i) => (i === at ? { ip: x, name: `files.${domain}`, ports: [v.port, ssh].sort((a, b) => a.port - b.port) } : { ip: x, name: `${rng.pick(ROLES)}-${i}.${domain}`, ports: rng.pick(PLAIN) }));
  const network: Network = { cidr, hosts, dns: {}, whois: {}, files: { 'notes.txt': NOTES(cidr) + `\nTodo: ${ip} has not been patched since it was installed.` } };
  const cve = cveOf(v.key);
  const [product, version] = [v.key.split(' ')[0]!, v.key.split(' ')[1]!];
  const level = asChallenge(guided('perimeter-versions'), {
    goal: `Find the version of the ${v.kind} on ${ip} and submit its CVE.`,
    instruction: `${ip} has not been patched since it was installed, and old software has public flaws.`,
    network,
    goals: [
      { id: 'version', facts: [`version:${ip}:${v.port.port}`, `banner:${ip}:${v.port.port}`] },
      { id: 'lookup', facts: [`vulndb:${v.key}`] },
      { id: 'answer', answers: [cve] },
    ],
    wrong: oldSsh ? [{ answers: ['CVE-2016-6210'], reason: `That one is real, but it is for the SSH server. Submit the ${v.kind}'s CVE.` }] : [],
    otherwise: `That is not the ${v.kind}'s CVE.`,
  });
  return {
    level,
    signature: `${ip}:${v.key}:${oldSsh}`,
    hints: ['`nmap -sV` asks each open port which software and version it runs.', `Run \`nmap -sV ${ip}\` and find the ${v.kind}.`, `Look it up with \`vulndb ${product} ${version}\` and submit the id it prints.`],
    solution: { kind: 'terminal', commands: [`nmap -sV ${ip}`, `vulndb ${v.key}`, `submit ${cve}`] },
  };
};

// ---- False positive ---------------------------------------------------------

const falsePositive: ChallengeGenerator = (rng) => {
  const { prefix, cidr } = subnet(rng);
  const ips = addresses(rng, prefix, 4);
  const at = rng.int(0, 3);
  const ip = ips[at]!;
  const claimed = rng.pick(['2.4.49', '2.4.50']);
  const real = rng.chance(0.5);
  const live = real ? claimed : rng.pick(['2.4.58', '2.4.62']);
  const date = `${String(rng.int(1, 12)).padStart(2, '0')}${String(rng.int(10, 28))}`;
  const file = `reports/scan-${date}.txt`;
  const cve = claimed === '2.4.49' ? 'CVE-2021-41773' : 'CVE-2021-42013';
  const hosts: Host[] = ips.map((x, i) => (i === at ? { ip: x, name: `web-01.${lan(rng)}`, ports: [SSH, { port: 80, service: 'http', product: 'Apache httpd', version: live, extra: '((Ubuntu))', http: web(`Apache/${live} (Ubuntu)`, 'Booking') }] } : { ip: x, ports: rng.pick(PLAIN) }));
  const network: Network = {
    cidr,
    hosts,
    dns: {},
    whois: {},
    files: {
      'notes.txt': NOTES(cidr),
      [file]: [`Automated scan, imported from ${real ? 'this week' : "last quarter's results"}`, '', `HIGH   ${ip}:80   Apache httpd ${claimed} detected`, `       ${cve}  Path traversal (CVSS ${claimed === '2.4.49' ? '7.5' : '9.8'})`, `LOW    ${ips[(at + 1) % 4]}:80   Missing Strict-Transport-Security header`].join('\n'),
    },
  };
  const answer = real ? ['confirmed', 'true-positive', 'true positive'] : ['false-positive', 'false positive', 'fp'];
  const other = real ? ['false-positive', 'false positive', 'fp'] : ['confirmed', 'true-positive', 'true positive', cve];
  const level = asChallenge(guided('perimeter-false-positive'), {
    goal: `Decide whether the scanner's HIGH on ${ip} is real: submit confirmed or false-positive.`,
    instruction: `A scanner report in reports/ flags ${ip}, and scanners are sometimes wrong or out of date.`,
    network,
    goals: [
      { id: 'report', facts: [`cat:${file}`] },
      { id: 'banner', facts: [`banner:${ip}:80`, `version:${ip}:80`] },
      { id: 'answer', answers: answer },
    ],
    wrong: [{ answers: other, reason: real ? `The live Server header still says Apache ${live}: the report is right.` : `The live Server header says Apache ${live}, which already has the fix.` }],
    otherwise: 'Answer with submit confirmed or submit false-positive.',
  });
  return {
    level,
    signature: `${ip}:${claimed}:${live}`,
    hints: ['A report is a claim. Ask the server what it runs today.', `Read it with \`cat ${file}\`, then run \`curl -I http://${ip}\`.`, 'If the Server header shows the same version as the report, it is real. A newer one has the fix.'],
    solution: { kind: 'terminal', commands: [`cat ${file}`, `curl -I http://${ip}`, `submit ${answer[0]}`] },
  };
};

// ---- Scope ------------------------------------------------------------------

const scope: ChallengeGenerator = (rng) => {
  const name = `${rng.pick(['staging', 'beta', 'old', 'shop2', 'test', 'preview'])}.harbor.example`;
  const inside = rng.chance(0.5);
  const ip = inside ? `203.0.113.${rng.int(30, 250)}` : rng.pick([`198.51.100.${rng.int(2, 250)}`, `192.0.2.${rng.int(2, 250)}`]);
  const thirdParty = ip.startsWith('198.51.100.') ? { cidr: '198.51.100.0/24', org: 'Skyforge Cloud Ltd', net: 'SKYFORGE-HOSTING-EU' } : { cidr: '192.0.2.0/24', org: 'Northwind Hosting BV', net: 'NORTHWIND-SHARED' };
  const network: Network = {
    cidr: '203.0.113.0/24',
    hosts: [
      { ip: '203.0.113.10', name: 'www.harbor.example', ports: [HTTPS] },
      { ip, name, outOfScope: !inside, ports: [{ port: 80, service: 'http', product: 'nginx', http: web('nginx', inside ? 'Harbor staging' : 'Shared hosting') }] },
    ],
    dns: { 'harbor.example': { A: ['203.0.113.10'] }, 'www.harbor.example': { A: ['203.0.113.10'] }, [name]: { A: [ip] } },
    whois: {
      '203.0.113.0/24': 'NetRange: 203.0.113.0 - 203.0.113.255\nNetName: HARBOR-FR\nOrgName: Harbor Freight Booking SAS (Lantern & Co.)\nCountry: FR',
      [thirdParty.cidr]: `NetRange: ${thirdParty.cidr.replace('.0/24', '.0')} - ${thirdParty.cidr.replace('.0/24', '.255')}\nNetName: ${thirdParty.net}\nOrgName: ${thirdParty.org}\nComment: Shared hosting.\nCountry: IE`,
    },
    files: {
      'scope.txt': 'Scope for the Harbor external test (signed 2026-11-02):\n  IN   harbor.example and its subdomains, when they resolve inside 203.0.113.0/24\n  OUT  anything hosted by a third party',
      'todo.txt': `Client asked: can you also have a look at ${name}?`,
    },
  };
  const answer = inside ? ['in-scope', 'in scope', 'in'] : ['out-of-scope', 'out of scope', 'out'];
  const level = asChallenge(guided('perimeter-scope'), {
    goal: `The client wants ${name} tested too. Submit in-scope or out-of-scope.`,
    instruction: 'You may only test what the signed scope covers, and a name can point anywhere.',
    network,
    goals: [
      { id: 'dig', facts: [`dig:${name}`] },
      { id: 'whois', facts: [`whois:${ip}`, inside ? 'whois:203.0.113.0/24' : `whois:${thirdParty.cidr}`] },
      { id: 'answer', answers: answer },
    ],
    wrong: [{ answers: inside ? ['out-of-scope', 'out of scope', 'out'] : ['in-scope', 'in scope', 'in'], reason: inside ? `It resolves to ${ip}, inside 203.0.113.0/24 and held by the client.` : `It resolves to ${ip}, held by ${thirdParty.org}, outside 203.0.113.0/24.` }],
    otherwise: 'Answer with submit in-scope or submit out-of-scope.',
  });
  return {
    level,
    signature: `${name}:${ip}`,
    hints: ['Scope covers addresses, not names. Find the address behind the name.', `Run \`dig ${name} +short\`, then \`whois\` on the address it prints.`, 'Compare the address with the range in scope.txt and who holds it.'],
    solution: { kind: 'terminal', commands: ['cat scope.txt', `dig ${name} +short`, `whois ${ip}`, `submit ${answer[0]}`] },
  };
};

// ---- Boss -------------------------------------------------------------------

const boss: ChallengeGenerator = (rng) => {
  const { prefix, cidr } = subnet(rng);
  const v = rng.pick(VULNS.filter((x) => x.port.banner));
  const ips = addresses(rng, prefix, 5);
  const domain = lan(rng);
  const slots = rng.shuffle([0, 1, 2, 3, 4]);
  const [realAt, portalAt, nasAt, mailAt, proxyAt] = slots as [number, number, number, number, number];
  const hosts: Host[] = [];
  hosts[realAt] = { ip: ips[realAt]!, name: `${v.kind === 'mail server' ? 'relay' : 'ftp'}.${domain}`, ports: [v.port, SSH].sort((a, b) => a.port - b.port) };
  hosts[portalAt] = { ip: ips[portalAt]!, name: `portal.${domain}`, ports: [{ port: 80, service: 'http', product: 'Apache httpd', version: '2.4.58', extra: '((Ubuntu))', http: web('Apache/2.4.58 (Ubuntu)', 'Customer portal') }] };
  hosts[nasAt] = { ip: ips[nasAt]!, name: `nas.${domain}`, ports: [{ port: 445, service: 'netbios-ssn', product: 'Samba smbd', version: '4.19.5-Ubuntu' }] };
  hosts[mailAt] = { ip: ips[mailAt]!, name: `mail.${domain}`, ports: [{ port: 25, service: 'smtp', product: 'Exim smtpd', version: '4.97', banner: `220 mail.${domain} ESMTP Exim 4.97 Mon, 09 Nov 2026 10:14:02 +0100` }] };
  hosts[proxyAt] = { ip: ips[proxyAt]!, name: `proxy.${domain}`, ports: [SSH, HTTPS] };
  const real = hosts[realAt]!;
  const cve = cveOf(v.key);
  const network: Network = {
    cidr,
    hosts,
    dns: {},
    whois: {},
    files: {
      'notes.txt': `Engagement: Lantern & Co. warehouse network ${cidr}. Authorised, signed 2026-11-05.\nThe lead wants one thing today: the critical, verified CVE on this network.`,
      'reports/scan.txt': `Automated scan, 2026-11-05\n\nHIGH   ${hosts[portalAt]!.ip}:80  Apache httpd 2.4.49 detected\n       CVE-2021-41773  Path traversal (CVSS 7.5)\nMEDIUM ${hosts[mailAt]!.ip}:25  Exim smtpd detected, version unknown`,
    },
  };
  const level = asChallenge(guided('perimeter-boss'), {
    goal: `Find the verified critical CVE on ${cidr} and submit it.`,
    instruction: 'Five hosts, a stale scanner report and one real critical flaw.',
    network,
    goals: [
      { id: 'survey', facts: ['sweep:*', 'ports:*'] },
      { id: 'verify', facts: [`banner:${real.ip}:${v.port.port}`] },
      { id: 'answer', answers: [cve] },
    ],
    wrong: [
      { answers: ['CVE-2021-41773', 'CVE-2021-42013'], reason: `That came from the scanner report, but the live banner on ${hosts[portalAt]!.ip} says Apache 2.4.58, which is fixed.` },
      ...(v.key.startsWith('exim') ? [] : [{ answers: ['CVE-2019-10149'], reason: 'Exim 4.97 is not affected: that CVE only covers 4.87 to 4.91.' }]),
    ],
    otherwise: 'Not that one. Survey the versions, confirm the old one by its banner, then look it up.',
  });
  const [product, version] = [v.key.split(' ')[0]!, v.key.split(' ')[1]!];
  return {
    level,
    signature: `${cidr}:${v.key}:${real.ip}`,
    hints: ['Survey every version first, and trust no report you have not checked.', `${product} ${version} on ${real.ip} looks old. Confirm it from its banner with \`nc -v ${real.ip} ${v.port.port}\`.`, `Look it up with \`vulndb ${product} ${version}\` and submit the CVE.`],
    solution: { kind: 'terminal', commands: [`nmap -sV ${cidr}`, `nc -v ${real.ip} ${v.port.port}`, `vulndb ${v.key}`, `submit ${cve}`] },
  };
};

export const PERIMETER_CHALLENGES: Record<string, ChallengeGenerator> = {
  'perimeter-sweep': sweep,
  'perimeter-ports': ports,
  'perimeter-versions': versions,
  'perimeter-false-positive': falsePositive,
  'perimeter-scope': scope,
  'perimeter-boss': boss,
};
