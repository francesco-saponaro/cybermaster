// The Perimeter's terminal: a parser for a shell line, a simulated network,
// and the handful of tools an analyst reaches for first. Output follows the
// real tools' formats closely enough that it reads the same on a real job.

import { boxCommand, replayBox, ipcalc } from './linux';
import { msfLine, msfPrompt, replayMsf, MSF_BANNER, MODULES, PAYLOADS, MODULE_BY_PATH } from './msf';
import { npm, trivy, docker, aws, prowler, sshdT, type AuditSetup } from './audit';
import { expandScripts, isIntrusive, scriptHelp, NSE_BY_NAME, type NseScript } from './nse';

export interface HttpService {
  status: number;
  headers: [string, string][];
  body: string;
}

export interface Port {
  port: number;
  service: string;
  product?: string;
  version?: string;
  extra?: string;
  /** What the service says first when you connect (FTP, SSH, SMTP). */
  banner?: string;
  http?: HttpService;
  /** A UDP service: only nmap -sU sees it. */
  udp?: boolean;
  /** UDP ports that never answer show as open|filtered: nmap cannot tell. */
  state?: 'open|filtered';
  /** What the NSE scripts and Metasploit checks find here: anon-ftp, ms17-010, smbv1. */
  flags?: string[];
}

export interface Host {
  ip: string;
  name?: string;
  ports: Port[];
  /** Hosts out of the engagement's scope: touching them is a mistake. */
  outOfScope?: boolean;
}

export interface Network {
  /** The subnet the level is about, like 10.0.8.0/24. */
  cidr: string;
  hosts: Host[];
  dns: Record<string, { A?: string[]; MX?: string[]; TXT?: string[] }>;
  whois: Record<string, string>;
  files: Record<string, string>;
  /** The machine you are logged in to, for the Linux levels. */
  box?: LinuxBox;
  /** The engagement allows non-destructive checks only: no intrusive scripts, no exploits. */
  roe?: 'check-only';
  /** The project, image, cloud account and server the audit tools look at. */
  audit?: AuditSetup;
}

export interface BoxFile {
  mode: number;
  owner: string;
  group: string;
  size?: number;
  body?: string;
  dir?: boolean;
}

export interface BoxService {
  unit: string;
  description: string;
  /** The process name ps and ss show. */
  process: string;
  user: string;
  pid: number;
  enabled: boolean;
  active: boolean;
  /** Why this one must stay running, said when someone tries to stop it. */
  keep?: string;
  listen: { proto: 'tcp' | 'udp'; addr: string; port: number }[];
}

export interface UfwRule {
  action: 'allow' | 'deny' | 'limit';
  /** Undefined means every port. */
  port?: number;
  proto?: 'tcp' | 'udp';
  /** 'any' or a CIDR or address. */
  from: string;
}

export interface LinuxBox {
  hostname: string;
  user: string;
  uid: number;
  groups: string[];
  home: string;
  cwd: string;
  iface: { name: string; ip: string; prefix: number; mac: string };
  gateway: string;
  publicIp: string;
  /** Where your SSH session comes from, for the lock-yourself-out check. */
  sshFrom?: string;
  /** An address on the internet, to say whether a port is open to the world. */
  internet?: string;
  files: Record<string, BoxFile>;
  services: BoxService[];
  ufw: { active: boolean; defaultIn: 'allow' | 'deny'; rules: UfwRule[] };
  /** What the firewall should end up doing per port, for the fw:as-planned fact. */
  want?: Record<number, 'public' | 'office-only' | 'closed'>;
}

export interface CveEntry {
  id: string;
  score: number;
  title: string;
}

/** A small slice of the public CVE record, keyed by "product version" in lower case. */
export const VULNDB: Record<string, CveEntry[]> = {
  'vsftpd 2.3.4': [{ id: 'CVE-2011-2523', score: 9.8, title: 'vsftpd 2.3.4 downloaded between 30 June and 3 July 2011 contains a backdoor that opens a shell on port 6200' }],
  'apache httpd 2.4.49': [
    { id: 'CVE-2021-41773', score: 7.5, title: 'Path traversal and file disclosure in Apache HTTP Server 2.4.49' },
    { id: 'CVE-2021-42013', score: 9.8, title: 'Path traversal and remote code execution in Apache HTTP Server 2.4.49 and 2.4.50 (incomplete fix of CVE-2021-41773)' },
  ],
  'apache httpd 2.4.50': [{ id: 'CVE-2021-42013', score: 9.8, title: 'Path traversal and remote code execution in Apache HTTP Server 2.4.49 and 2.4.50' }],
  'proftpd 1.3.5': [{ id: 'CVE-2015-3306', score: 9.8, title: 'ProFTPD 1.3.5 mod_copy lets unauthenticated users copy files with SITE CPFR and SITE CPTO' }],
  'exim 4.87': [{ id: 'CVE-2019-10149', score: 9.8, title: 'Exim 4.87 to 4.91: remote command execution through the recipient address' }],
  'samba 3.5.0': [{ id: 'CVE-2017-7494', score: 9.8, title: 'Samba 3.5.0 and later: a malicious client can upload a shared library and make the server load it' }],
  'openssh 7.2p2': [{ id: 'CVE-2016-6210', score: 5.9, title: 'OpenSSH before 7.3: user enumeration through the time taken to reject a password' }],
  'exim 4.89': [{ id: 'CVE-2019-10149', score: 9.8, title: 'Exim 4.87 to 4.91: remote command execution through the recipient address' }],
  'exim 4.91': [{ id: 'CVE-2019-10149', score: 9.8, title: 'Exim 4.87 to 4.91: remote command execution through the recipient address' }],
  'samba 4.5.9': [{ id: 'CVE-2017-7494', score: 9.8, title: 'Samba 3.5.0 to 4.6.3: a malicious client can upload a shared library and make the server load it' }],
  'webmin 1.890': [{ id: 'CVE-2019-15107', score: 9.8, title: 'Webmin 1.882 to 1.921: a backdoor in password_change.cgi runs commands without signing in' }],
  'grafana 8.3.0': [{ id: 'CVE-2021-43798', score: 7.5, title: 'Grafana 8.0.0-beta1 to 8.3.0: path traversal in plugin URLs reads any file on the server' }],
};

export function lookupCves(product: string, version: string): CveEntry[] {
  const p = product.toLowerCase().replace(/^apache$/, 'apache httpd').replace(/^httpd$/, 'apache httpd');
  const v = version.toLowerCase();
  // "exim smtpd 4.89" or "samba smbd 4.5.9" find the same entry as "exim 4.89".
  return VULNDB[`${p} ${v}`] ?? VULNDB[`${p.split(' ')[0]} ${v}`] ?? [];
}

// ---- Shell line parsing -----------------------------------------------------

/** Split a command line into words, honouring single and double quotes. */
export function splitArgs(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let had = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      had = true;
    } else if (/\s/.test(ch)) {
      if (cur || had) out.push(cur);
      cur = '';
      had = false;
    } else cur += ch;
  }
  if (cur || had) out.push(cur);
  return out;
}

export interface NmapOptions {
  pingOnly: boolean;
  versions: boolean;
  noPing: boolean;
  udp: boolean;
  ports: number[] | 'all' | null;
  scripts: string | null;
  scriptHelp: string | null;
  targets: string[];
}

export function parseNmap(args: string[]): { ok: true; opts: NmapOptions } | { ok: false; error: string } {
  const opts: NmapOptions = { pingOnly: false, versions: false, noPing: false, udp: false, ports: null, targets: [], scripts: null, scriptHelp: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '-sn') opts.pingOnly = true;
    else if (a === '-sV') opts.versions = true;
    else if (a === '-A') opts.versions = true;
    else if (a === '-Pn') opts.noPing = true;
    else if (a === '-sU') opts.udp = true;
    else if (a === '-sC') opts.scripts = opts.scripts ? `${opts.scripts},default` : 'default';
    else if (a === '--script' || a.startsWith('--script=')) {
      const spec = a === '--script' ? args[++i] : a.slice(9);
      if (!spec) return { ok: false, error: 'nmap: --script needs a script name or category, like --script ftp-anon' };
      opts.scripts = spec;
    } else if (a === '--script-help' || a.startsWith('--script-help=')) {
      const spec = a === '--script-help' ? args[++i] : a.slice(14);
      if (!spec) return { ok: false, error: 'nmap: --script-help needs a script name, like --script-help ftp-anon' };
      opts.scriptHelp = spec;
    }
    else if (a === '-sS' || a === '-sT' || a === '-v' || a === '-n' || /^-T[0-5]$/.test(a) || a === '--open' || a === '-sC') continue;
    else if (a === '-p-') opts.ports = 'all';
    else if (a === '-p' || a.startsWith('-p')) {
      const spec = a === '-p' ? args[++i] : a.slice(2);
      if (!spec) return { ok: false, error: 'nmap: option -p needs a port list, like -p 21,22,80 or -p 1-1000' };
      const ports = parsePorts(spec);
      if (!ports) return { ok: false, error: `nmap: could not read the port list "${spec}". Use numbers and commas, like -p 21,22,80` };
      opts.ports = ports;
    } else if (a.startsWith('-')) return { ok: false, error: `nmap: unrecognized option '${a}'. Copy the command from the step, or type man nmap for the options.` };
    else opts.targets.push(a);
  }
  if (opts.targets.length === 0 && !opts.scriptHelp) return { ok: false, error: 'nmap: no target given. Example: nmap 10.0.8.12' };
  return { ok: true, opts };
}

export function parsePorts(spec: string): number[] | 'all' | null {
  if (spec === '-') return 'all';
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const m = /^(?:[TU]:)?(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b > 65535 || b < a) return null;
    if (b - a > 70000) return null;
    for (let p = a; p <= b; p++) out.push(p);
  }
  return out;
}

export function ipToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

/** Expand a target (IP, CIDR, a last-octet range or a host name) into IPs and how many addresses it covers. */
export function expandTarget(target: string, net: Network): { ips: string[]; count: number } | null {
  const cidr = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(target);
  if (cidr) {
    const base = ipToInt(cidr[1]!);
    const bits = Number(cidr[2]);
    if (base === null || bits < 16 || bits > 32) return null;
    const size = 2 ** (32 - bits);
    const start = base - (base % size);
    const ips = net.hosts.map((h) => h.ip).filter((ip) => {
      const n = ipToInt(ip);
      return n !== null && n >= start && n < start + size;
    });
    return { ips, count: size };
  }
  const range = /^(\d{1,3}\.\d{1,3}\.\d{1,3}\.)(\d{1,3})-(\d{1,3})$/.exec(target);
  if (range) {
    const [, prefix, a, b] = range;
    const lo = Number(a);
    const hi = Number(b);
    if (hi < lo || hi > 255) return null;
    const ips = net.hosts.map((h) => h.ip).filter((ip) => ip.startsWith(prefix!) && Number(ip.slice(prefix!.length)) >= lo && Number(ip.slice(prefix!.length)) <= hi);
    return { ips, count: hi - lo + 1 };
  }
  if (ipToInt(target) !== null) return { ips: net.hosts.some((h) => h.ip === target) ? [target] : [], count: 1 };
  const resolved = resolve(target, net);
  if (resolved) return { ips: net.hosts.some((h) => h.ip === resolved) ? [resolved] : [], count: 1 };
  return null;
}

export function resolve(name: string, net: Network): string | null {
  const n = name.toLowerCase().replace(/\.$/, '');
  const rec = net.dns[n];
  if (rec?.A?.[0]) return rec.A[0];
  const host = net.hosts.find((h) => h.name === n);
  return host ? host.ip : null;
}

function findHost(target: string, net: Network): Host | null {
  const ip = ipToInt(target) !== null ? target : resolve(target, net);
  return ip ? (net.hosts.find((h) => h.ip === ip) ?? null) : null;
}

// ---- Commands ---------------------------------------------------------------

export interface CommandResult {
  out: string[];
  /** Facts the level's checks read: what the player has seen or done. */
  facts: string[];
  /** A one-line mistake to flash in red (and count as a failed attempt). */
  fail?: string;
  /** Lines appear after a short wait, like a scan running. */
  delay?: number;
  clear?: boolean;
  man?: string;
  submit?: string;
}

export const COMMANDS = ['help', 'man', 'ls', 'cat', 'clear', 'history', 'nmap', 'curl', 'nc', 'dig', 'whois', 'vulndb', 'searchsploit', 'submit', 'whoami', 'pwd', 'echo'];

/** Extra commands on a box you are logged in to. */
/** The audit tools, on the levels that have a project and an account to audit. */
export const AUDIT_COMMANDS = ['npm', 'trivy', 'docker', 'aws', 'prowler', 'sshd'];

export const MSF_COMMANDS = ['msfconsole', 'search', 'use', 'info', 'show', 'set', 'check', 'run', 'back'];

export const BOX_COMMANDS = ['sudo', 'ipcalc', 'ip', 'id', 'chmod', 'ps', 'ss', 'systemctl', 'ufw', 'tail', 'grep', 'cd', 'hostname'];

export const MAN: Record<string, { synopsis: string; lines: string[] }> = {
  nmap: {
    synopsis: 'nmap [options] <target>',
    lines: [
      'Finds hosts on a network and the services listening on them.',
      '<target>  an address (10.0.8.12), a range (10.0.8.1-40), a subnet (10.0.8.0/24) or a name.',
      '-sn       host discovery only: which addresses answer. No port scan.',
      '-p <list> ports to scan: -p 22,80 or -p 1-1024. -p- scans all 65535.',
      '-sV       ask each open port what it is and which version it runs.',
      '-Pn       skip host discovery and scan anyway (for hosts that ignore pings).',
      '--script <name or category>  run NSE scripts: --script ftp-anon, --script "vuln and safe". -sC runs the default set.',
      '--script-help <name>         what a script does and its categories (safe, intrusive, exploit, vuln ...).',
      '-sU       scan UDP instead of TCP. Needs root (sudo) and is slow: UDP has no handshake, so nmap waits for answers.',
      'Without -p, nmap scans the 1,000 most common TCP ports.',
    ],
  },
  curl: {
    synopsis: 'curl [options] <url>',
    lines: ['Sends one HTTP request and prints the answer.', '-I   show only the response headers (a HEAD request).', '-i   show the headers, then the body.', '-v   also show the request that was sent.', 'Example: curl -I http://10.0.8.15'],
  },
  nc: {
    synopsis: 'nc [-v] <host> <port>',
    lines: ['Opens a raw TCP connection. Services like FTP, SSH and SMTP greet you with a banner naming their software and version.', 'HTTP servers wait for you to speak first: use curl for those.', 'Example: nc -v 10.0.8.21 21'],
  },
  dig: {
    synopsis: 'dig <name> [A|MX|TXT] [+short]',
    lines: ['Asks DNS what a name points to. A records are addresses, MX records are mail servers.', '+short prints only the answer.', 'Example: dig shop.harbor.example +short'],
  },
  whois: {
    synopsis: 'whois <domain or address>',
    lines: ['Looks up who registered a domain, or which organisation holds an address block.', 'Example: whois 203.0.113.10'],
  },
  vulndb: {
    synopsis: 'vulndb <product> <version>',
    lines: ['Searches a local copy of the CVE list for a product and version.', 'Use the product and version nmap -sV or a banner reported.', 'Example: vulndb vsftpd 2.3.4', 'searchsploit is an alias.'],
  },
  submit: {
    synopsis: 'submit <answer>',
    lines: ['Hands your answer to the lead. The goal in the corner says what kind of answer it wants: a number, an address, a CVE id or a verdict.'],
  },
  ls: {
    synopsis: 'ls [-l] [-a] [folder or file]',
    lines: [
      'Lists files. -l shows the long form: permissions, owner, group, size and date. -a also shows hidden files, whose names start with a dot.',
      'The permissions column reads like -rw-r--r--: the type (- file, d folder), then three letters for the owner, three for the group and three for everyone else.',
      'r is read, w is write, x is execute (for a folder: enter it). A dash means no.',
    ],
  },
  cat: { synopsis: 'cat <file>', lines: ['Prints a file.'] },
  ipcalc: {
    synopsis: 'ipcalc <address>/<bits>',
    lines: [
      'Works out a subnet from an address and a prefix length (the /24 part, called CIDR notation).',
      'Network is the first address and Broadcast the last; neither can be given to a machine. HostMin to HostMax are the usable ones, and Hosts/Net counts them.',
      'Example: ipcalc 192.168.40.0/24',
    ],
  },
  ip: { synopsis: 'ip addr | ip route', lines: ['ip addr shows this machine\'s network cards and their addresses.', 'ip route shows where packets go; the "default via" line is the router that takes everything else to the internet.'] },
  id: { synopsis: 'id', lines: ['Shows who you are: your user, your user id, and the groups you belong to. Group membership decides the middle three permission letters.'] },
  chmod: {
    synopsis: 'chmod <mode> <file>',
    lines: [
      'Changes who may read, write or run a file. Only the owner or root can.',
      'In numbers, each of owner, group and others gets a digit: read 4 + write 2 + execute 1. So 600 is owner read and write, nobody else anything; 644 is owner read and write, everyone else read.',
      'In letters: o-r takes read away from others, go-rwx takes everything away from group and others.',
      'Example: chmod 600 .env',
    ],
  },
  ps: { synopsis: 'ps aux', lines: ['Lists every process running on the machine, with the user it runs as and its process id (PID).'] },
  ss: {
    synopsis: 'ss -tlnp',
    lines: [
      'Shows sockets. -t TCP, -u UDP, -l only the ones listening for connections, -n numbers instead of names, -p the process behind each (sudo shows them all).',
      'The Local Address column says who can connect: 127.0.0.1 is this machine only, 0.0.0.0 (or *) is every network the machine is on.',
      'Example: sudo ss -tlnp',
    ],
  },
  systemctl: {
    synopsis: 'systemctl <status|stop|start|disable|enable> <service>',
    lines: [
      'Controls services through systemd, the program that starts everything on a Linux machine.',
      'stop ends it now; disable stops it starting at the next boot. You usually want both: sudo systemctl disable --now <service>.',
      'status shows whether it is running (Active) and whether it starts at boot (enabled or disabled, on the Loaded line).',
    ],
  },
  ufw: {
    synopsis: 'ufw <command>',
    lines: [
      'Uncomplicated Firewall, the usual firewall front end on Ubuntu. Every ufw command needs sudo.',
      'sudo ufw status verbose shows whether it is on, the default policy and the rules.',
      'sudo ufw default deny incoming blocks every new connection that no rule allows.',
      'sudo ufw allow 443/tcp opens a port to everyone; sudo ufw allow from 192.168.40.0/24 to any port 22 proto tcp opens it to one network only.',
      'sudo ufw enable turns it on. Add the rule for your own SSH first, or you lock yourself out.',
      'sudo ufw status numbered then sudo ufw delete 2 removes rule number 2.',
    ],
  },
  npm: {
    synopsis: 'npm audit | npm audit fix | npm audit --omit=dev | npm ls <package>',
    lines: [
      'npm audit compares every installed package, direct or pulled in by another, with the GitHub advisory database and prints each vulnerable one with its severity and the advisory link.',
      'npm audit fix upgrades within the versions package.json allows. npm audit fix --force also installs breaking major versions: agree that with the developers first.',
      '--omit=dev leaves out development tools (test runners, build watchers) that never run in production.',
      'npm ls <package> shows which of your dependencies pulls a package in.',
    ],
  },
  trivy: {
    synopsis: 'trivy image [--severity CRITICAL,HIGH] <image> | trivy config <folder>',
    lines: [
      'Trivy, by Aqua Security, scans container images for known vulnerabilities in the operating system packages and the app\'s libraries, and Dockerfiles and other configuration for risky settings.',
      '--severity keeps only the levels you list. A warning that the OS is no longer supported means its flaws will never be patched in place: rebuild on a current base.',
      'trivy config . checks the Dockerfile in this folder: DS002 means the image runs as root.',
    ],
  },
  docker: { synopsis: 'docker ps | docker inspect <container>', lines: ['docker ps lists running containers and their published ports; 0.0.0.0:3000->3000 means every network can reach port 3000.', 'docker inspect shows how a container runs: the user (empty means root), whether it is Privileged, and its port bindings.'] },
  aws: {
    synopsis: 'aws cloudtrail lookup-events --lookup-attributes AttributeName=<name>,AttributeValue=<value>',
    lines: [
      'lookup-events searches the last 90 days of management events: who called which API, when, from which address, with which access key.',
      'Attribute names: EventName (CreateAccessKey, PutBucketPolicy ...), Username, AccessKeyId, ResourceName.',
      'aws cloudtrail describe-trails shows whether the trail covers every region; get-event-selectors --trail-name <name> shows whether data events, such as S3 object reads, are recorded at all.',
      'aws sts get-caller-identity shows which account and identity you are using.',
    ],
  },
  prowler: {
    synopsis: 'prowler aws [--severity critical high] [--service s3] [--check <id>]',
    lines: [
      'Prowler runs hundreds of security checks against an AWS account (and Azure, GCP, Kubernetes), based on CIS, AWS best practice and other frameworks.',
      'Each result is PASS or FAIL with a severity, a check id such as s3_bucket_level_public_access_block, and the resource.',
      'Filter with --severity, --service or --check to focus. The full results go to CSV, JSON and HTML files for the report.',
    ],
  },
  sshd: { synopsis: 'sudo sshd -T', lines: ['Prints the configuration the SSH server is really using, after every config file and default, one setting per line in lower case.', 'Pipe it into grep to pick settings: sudo sshd -T | grep -i permitrootlogin.'] },
  msfconsole: {
    synopsis: 'msfconsole',
    lines: [
      'Opens the Metasploit Framework console. The prompt becomes msf6 >.',
      'search <words> finds modules (search proftpd, search type:auxiliary smb, search cve:2017-0143); use <name or number> selects one; info shows its rank, whether it supports check, its options and references.',
      'show options lists what the module needs; set RHOSTS 10.0.9.9 fills one in. Auxiliary modules (scanners) gather information with run.',
      'check asks the target whether it looks vulnerable, without exploiting it. "Appears to be vulnerable" is a strong hint, not proof of impact.',
      'An exploit is the code that abuses the flaw; a payload is what runs on the target afterwards. In this game exploits are never fired: the engagements allow checks only.',
      'back leaves a module, exit leaves msfconsole. Anything else is passed to the shell.',
    ],
  },
  sudo: { synopsis: 'sudo <command>', lines: ['Runs one command as root, the administrator. Changing services, the firewall or files you do not own needs it. Use it only for the commands that need it.'] },
  tail: { synopsis: 'tail [-n N] <file>', lines: ['Prints the last lines of a file, 10 unless you say -n. Logs grow at the bottom, so this is where the latest events are.'] },
  grep: { synopsis: 'grep [-c] [-i] <text> <file>', lines: ['Prints the lines of a file that contain the text. -c prints how many instead, -i ignores upper and lower case.', 'Example: grep "Failed password" /var/log/auth.log'] },
};

function pad(s: string, n: number): string {
  return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length);
}

function versionString(p: Port): string {
  return [p.product, p.version, p.extra].filter(Boolean).join(' ');
}

const TOP_PORTS = new Set([67, 69, 123, 137, 161, 500, 514, 1900, 5353, 21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 993, 995, 1723, 3000, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 2121, 8081, 9200, 10000, 27017]);

/** --script accepts names and categories separated by commas, and "a and b" for both. */
function selectScripts(spec: string): { scripts: NseScript[]; unknown: string[] } {
  const parts = spec.split(',').map((x) => x.trim()).filter(Boolean);
  const out = new Set<NseScript>();
  const unknown: string[] = [];
  for (const part of parts) {
    const words = part.split(/\s+and\s+/i);
    let set: NseScript[] | null = null;
    for (const w of words) {
      const not = /^not\s+/i.test(w);
      const ex = expandScripts(w.replace(/^not\s+/i, ''));
      unknown.push(...ex.unknown);
      if (not) set = (set ?? Object.values(NSE_BY_NAME)).filter((s) => !ex.scripts.includes(s));
      else set = set ? set.filter((s) => ex.scripts.includes(s)) : ex.scripts;
    }
    for (const s of set ?? []) out.add(s);
  }
  return { scripts: [...out], unknown };
}

function nmap(args: string[], net: Network, root = false): CommandResult {
  const parsed = parseNmap(args);
  if (!parsed.ok) return { out: [parsed.error], facts: [], fail: parsed.error };
  const { opts } = parsed;
  if (opts.udp && !root) {
    return {
      out: ['You requested a scan type which requires root privileges.', 'QUITTING!'],
      facts: [],
      fail: net.box ? 'A UDP scan needs root: put sudo in front, like sudo nmap -sU 192.168.40.1.' : 'A UDP scan needs root, and this account cannot use sudo here.',
    };
  }
  const proto = opts.udp ? 'udp' : 'tcp';
  if (opts.scriptHelp) {
    const help = scriptHelp(opts.scriptHelp);
    if (!help) return { out: [`NSE: No script named "${opts.scriptHelp}".`], facts: [] };
    return { out: ['Starting Nmap 7.95 ( https://nmap.org ) at 2026-11-09 10:14 CET', ...help], facts: [`nse-help:${opts.scriptHelp}`] };
  }
  let scripts: NseScript[] = [];
  if (opts.scripts) {
    const ex = selectScripts(opts.scripts);
    if (ex.unknown.length) return { out: [`NSE: failed to initialize the script engine:`, `'${ex.unknown[0]}' did not match a category, filename, or directory`], facts: [], fail: `There is no NSE script or category called ${ex.unknown[0]}. nmap --script-help <name> shows one.` };
    scripts = ex.scripts;
    const bad = scripts.filter(isIntrusive);
    if (net.roe === 'check-only' && bad.length) {
      return {
        out: [`Stopped: ${bad.map((b) => b.name).join(', ')} ${bad.length === 1 ? 'is' : 'are'} in the ${[...new Set(bad.flatMap((b) => b.categories.filter((c) => ['intrusive', 'exploit', 'dos'].includes(c))))].join('/')} category.`, 'This engagement allows non-destructive checks only.'],
        facts: ['nse-refused'],
        fail: 'Intrusive and exploit scripts can change or crash the target, and this engagement allows checks only. Pick safe scripts, or a category like "vuln and safe".',
      };
    }
  }
  const out: string[] = ['Starting Nmap 7.95 ( https://nmap.org ) at 2026-11-09 10:14 CET'];
  const facts: string[] = ['nmap'];
  let addresses = 0;
  let up = 0;
  for (const target of opts.targets) {
    const exp = expandTarget(target, net);
    if (!exp) {
      out.push(`Failed to resolve "${target}".`);
      continue;
    }
    addresses += exp.count;
    const hosts = exp.ips.map((ip) => net.hosts.find((h) => h.ip === ip)!).filter(Boolean);
    const blocked = hosts.find((h) => h.outOfScope);
    if (blocked) {
      return {
        out: [`Stopped: ${blocked.ip} is not in the scope you were given. Scanning it is not a test, it is an attack on someone else's server.`],
        facts: ['out-of-scope-scan'],
        fail: `${blocked.ip} is out of scope: nothing gets scanned without permission. Run cat scope.txt and only scan what it lists.`,
      };
    }
    if (opts.pingOnly) facts.push(`sweep:${target}`);
    for (const h of hosts) {
      up++;
      const label = h.name ? `${h.name} (${h.ip})` : h.ip;
      out.push(`Nmap scan report for ${label}`);
      out.push(`Host is up (0.00${(ipToInt(h.ip)! % 9) + 1}1s latency).`);
      if (opts.pingOnly) continue;
      const wanted = opts.ports === 'all' ? null : opts.ports;
      const mine = h.ports.filter((p) => !!p.udp === opts.udp);
      const open = mine.filter((p) => (wanted ? wanted.includes(p.port) : opts.ports === 'all' || TOP_PORTS.has(p.port)));
      const closed = wanted ? wanted.filter((n) => !mine.some((p) => p.port === n)) : [];
      const scanned = opts.ports === 'all' ? 65535 : wanted ? wanted.length : 1000;
      const notShown = scanned - open.length - (closed.length <= 5 ? closed.length : 0);
      if (notShown > 0) out.push(`Not shown: ${notShown} closed ${proto} ports (${opts.udp ? 'port-unreach' : 'reset'})`);
      const rows: string[][] = open.map((p) => [`${p.port}/${proto}`, p.state ?? 'open', p.service, opts.versions ? versionString(p) : '']);
      const scriptOut = new Map<number, string[]>();
      for (const p of open) {
        const lines: string[] = [];
        for (const sc of scripts) {
          const o = sc.port?.(h, p);
          if (!o?.length) continue;
          facts.push(`nse:${sc.name}:${h.ip}`);
          for (const m of o.join(' ').matchAll(/CVE-\d{4}-\d+/g)) facts.push(`nse-vuln:${h.ip}:${m[0]}`);
          if (o.length === 1) lines.push(`|_${sc.name}: ${o[0]}`);
          else lines.push(`| ${sc.name}: ${o[0]}`, ...o.slice(1, -1).map((l) => `| ${l}`), `|_${o[o.length - 1]}`);
        }
        if (lines.length) scriptOut.set(p.port, lines);
      }
      if (closed.length <= 5) for (const c of closed) rows.push([`${c}/${proto}`, 'closed', SERVICE_NAMES[c] ?? 'unknown', '']);
      rows.sort((a, b) => parseInt(a[0]!) - parseInt(b[0]!));
      if (rows.length === 0) {
        out.push(`All ${scanned} scanned ports on ${label} are in ignored states.`);
      } else {
        const w0 = Math.max(4, ...rows.map((r) => r[0]!.length));
        const w1 = Math.max(5, ...rows.map((r) => r[1]!.length));
        const w2 = Math.max(7, ...rows.map((r) => r[2]!.length));
        out.push(pad('PORT', w0) + pad('STATE', w1) + (opts.versions ? pad('SERVICE', w2) + 'VERSION' : 'SERVICE'));
        for (const r of rows) {
          out.push(pad(r[0]!, w0) + pad(r[1]!, w1) + (opts.versions ? pad(r[2]!, w2) + r[3] : r[2]));
          out.push(...(scriptOut.get(parseInt(r[0]!)) ?? []));
        }
      }
      const hostLines: string[] = [];
      for (const sc of scripts) {
        const o = sc.host?.(h);
        if (!o?.length) continue;
        facts.push(`nse:${sc.name}:${h.ip}`);
        for (const m of o.join(' ').matchAll(/CVE-\d{4}-\d+/g)) facts.push(`nse-vuln:${h.ip}:${m[0]}`);
        hostLines.push(`| ${sc.name}: `, ...o.slice(0, -1).map((l) => `|${l}`), `|_${o[o.length - 1]}`);
      }
      if (hostLines.length) out.push('', 'Host script results:', ...hostLines);
      for (const sc of scripts) facts.push(`nse-ran:${sc.name}`);
      for (const p of open) {
        if (opts.udp) facts.push(p.state ? `udp-maybe:${h.ip}:${p.port}` : `udp:${h.ip}:${p.port}`);
        else facts.push(`port:${h.ip}:${p.port}`);
        if (opts.versions) facts.push(`version:${h.ip}:${p.port}`);
      }
      facts.push(opts.udp ? `uports:${h.ip}` : `ports:${h.ip}`);
      out.push('');
    }
    if (hosts.length === 0 && exp.count === 1) {
      out.push('Note: Host seems down. If it is really up, but blocking our ping probes, try -Pn');
    }
  }
  const secs = opts.pingOnly ? (1.4 + addresses / 300).toFixed(2) : (2.1 + up * (opts.udp ? 41.3 : 1.7) + (opts.versions ? 6 : 0)).toFixed(2);
  out.push(`Nmap done: ${addresses} IP address${addresses === 1 ? '' : 'es'} (${up} host${up === 1 ? '' : 's'} up) scanned in ${secs} seconds`);
  return { out, facts, delay: opts.versions || opts.udp ? 900 : 600 };
}

const SERVICE_NAMES: Record<number, string> = { 123: 'ntp', 161: 'snmp', 67: 'dhcps', 69: 'tftp', 500: 'isakmp', 1900: 'upnp', 5353: 'zeroconf', 3000: 'ppp', 10000: 'snet-sensor-mgmt', 9200: 'wap-wsp', 27017: 'mongod', 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'domain', 80: 'http', 110: 'pop3', 139: 'netbios-ssn', 143: 'imap', 443: 'https', 445: 'microsoft-ds', 3306: 'mysql', 3389: 'ms-wbt-server', 5432: 'postgresql', 6379: 'redis', 8080: 'http-proxy' };

const PUBLIC_IP_SITES = ['ifconfig.me', 'icanhazip.com', 'api.ipify.org'];

function curl(args: string[], net: Network): CommandResult {
  let head = false;
  let include = false;
  let verbose = false;
  let url = '';
  for (const a of args) {
    if (a === '-I' || a === '--head') head = true;
    else if (a === '-i') include = true;
    else if (a === '-v') verbose = true;
    else if (a === '-s' || a === '-k' || a === '-L') continue;
    else if (a.startsWith('-')) return { out: [`curl: option ${a}: is unknown. See: man curl`], facts: [], fail: `curl does not know ${a}. Use curl -I followed by the address, like curl -I http://10.0.8.15.` };
    else url = a;
  }
  if (!url) return { out: ['curl: no URL specified. Example: curl -I http://10.0.8.15'], facts: [] };
  if (!/^https?:\/\//.test(url)) url = 'http://' + url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { out: [`curl: (3) URL rejected: Malformed input to a URL function`], facts: [] };
  }
  if (net.box && PUBLIC_IP_SITES.includes(u.hostname)) return { out: [net.box.publicIp], facts: ['public-ip', `public-ip:${net.box.publicIp}`] };
  const host = findHost(u.hostname, net);
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (host?.outOfScope) return { out: [`Stopped: ${host.ip} is not in scope.`], facts: ['out-of-scope-scan'], fail: `${host.ip} is out of scope: nothing gets touched without permission. Run cat scope.txt and only touch what it lists.` };
  const svc = host?.ports.find((p) => p.port === port && !p.udp);
  if (!host) return { out: [`curl: (6) Could not resolve host: ${u.hostname}`], facts: [] };
  if (!svc) return { out: [`curl: (7) Failed to connect to ${u.hostname} port ${port} after 2 ms: Couldn't connect to server`], facts: [] };
  if (!svc.http) return { out: [`curl: (1) Received HTTP/0.9 when not allowed`], facts: [] };
  const traversal = /(\.\.|%2e)/i.test(u.pathname + u.search) || /\.%2e/i.test(url);
  const http = traversal ? { status: 400, headers: svc.http.headers.filter(([k]) => /server|date/i.test(k)).concat([['Content-Type', 'text/html; charset=iso-8859-1']] as [string, string][]), body: '<h1>Bad Request</h1>\n<p>Your browser sent a request that this server could not understand.</p>' } : svc.http;
  const out: string[] = [];
  if (verbose) {
    out.push(`*   Trying ${host.ip}:${port}...`, `* Connected to ${u.hostname} (${host.ip}) port ${port}`, `> ${head ? 'HEAD' : 'GET'} ${u.pathname}${u.search} HTTP/1.1`, `> Host: ${u.host}`, '> User-Agent: curl/8.5.0', '>');
  }
  const statusText = http.status === 200 ? 'OK' : http.status === 400 ? 'Bad Request' : http.status === 404 ? 'Not Found' : http.status === 403 ? 'Forbidden' : '';
  const headLines = [`HTTP/1.1 ${http.status} ${statusText}`, ...http.headers.map(([k, v]) => `${k}: ${v}`)];
  if (head || include || verbose) out.push(...headLines.map((l) => (verbose ? '< ' + l : l)));
  if (!head) {
    if (include || verbose) out.push('');
    out.push(...http.body.split('\n'));
  }
  const facts = [`http:${host.ip}:${port}`];
  if (head || include || verbose) facts.push(`banner:${host.ip}:${port}`);
  if (traversal) facts.push(`traversal:${host.ip}`);
  return { out, facts };
}

function nc(args: string[], net: Network): CommandResult {
  const rest = args.filter((a) => !a.startsWith('-') && !/^\d+$/.test(a));
  const nums = args.filter((a) => /^\d+$/.test(a));
  const verbose = args.includes('-v') || args.includes('-nv') || args.includes('-vn');
  const target = rest[0];
  const portArg = nums[nums.length - 1];
  if (!target || !portArg) return { out: ['usage: nc [-v] <host> <port>'], facts: [] };
  const host = findHost(target, net);
  const port = Number(portArg);
  if (host?.outOfScope) return { out: [`Stopped: ${host.ip} is not in scope.`], facts: ['out-of-scope-scan'], fail: `${host.ip} is out of scope: nothing gets touched without permission. Run cat scope.txt and only touch what it lists.` };
  const svc = host?.ports.find((p) => p.port === port && !p.udp);
  if (!host || !svc) return { out: [`nc: connect to ${target} port ${port} (tcp) failed: Connection refused`], facts: [] };
  const out: string[] = [];
  if (verbose) out.push(`Connection to ${target} ${port} port [tcp/${svc.service}] succeeded!`);
  if (svc.banner) out.push(...svc.banner.split('\n'));
  else if (svc.http) out.push('(connected, and the server is waiting for you to speak first: that is HTTP. Try curl -I.)');
  else out.push('(connected, no greeting)');
  return { out, facts: svc.banner ? [`banner:${host.ip}:${port}`] : [] };
}

function dig(args: string[], net: Network): CommandResult {
  const short = args.includes('+short');
  const words = args.filter((a) => !a.startsWith('+') && !a.startsWith('@'));
  const name = (words[0] ?? '').toLowerCase().replace(/\.$/, '');
  const type = (words[1] ?? 'A').toUpperCase() as 'A' | 'MX' | 'TXT';
  if (!name) return { out: ['usage: dig <name> [A|MX|TXT] [+short]'], facts: [] };
  const rec = net.dns[name];
  const answers = rec?.[type] ?? [];
  const facts = [`dig:${name}`];
  if (short) return { out: answers.length ? answers : [''], facts };
  const out = [`; <<>> DiG 9.18.28 <<>> ${name} ${type}`, `;; ->>HEADER<<- opcode: QUERY, status: ${rec ? 'NOERROR' : 'NXDOMAIN'}`, '', ';; ANSWER SECTION:'];
  for (const a of answers) out.push(`${name}.\t\t300\tIN\t${type}\t${a}`);
  if (!answers.length) out.push('(no answer)');
  return { out, facts };
}

function whois(args: string[], net: Network): CommandResult {
  const q = (args[0] ?? '').toLowerCase();
  if (!q) return { out: ['usage: whois <domain or address>'], facts: [] };
  const key = Object.keys(net.whois).find((k) => {
    if (k === q) return true;
    const c = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(k);
    const n = ipToInt(q);
    if (c && n !== null) {
      const size = 2 ** (32 - Number(c[2]));
      const base = ipToInt(c[1]!)!;
      return n >= base && n < base + size;
    }
    return false;
  });
  if (!key) return { out: [`No match for "${q}".`], facts: [`whois:${q}`] };
  return { out: net.whois[key]!.split('\n'), facts: [`whois:${q}`] };
}

function vulndb(args: string[]): CommandResult {
  if (args.length < 2) return { out: ['usage: vulndb <product> <version>   e.g. vulndb vsftpd 2.3.4'], facts: [] };
  const version = args[args.length - 1]!;
  const product = args.slice(0, -1).join(' ');
  const hits = lookupCves(product, version);
  const facts = [`vulndb:${product.toLowerCase()} ${version.toLowerCase()}`, `vulndb:${product.toLowerCase().split(' ')[0]} ${version.toLowerCase()}`];
  if (!hits.length) return { out: [`No known CVEs for ${product} ${version} in the local database.`], facts };
  const out = [pad('CVE', 16) + pad('CVSS', 6) + 'Summary', '-'.repeat(64)];
  for (const h of hits) out.push(pad(h.id, 16) + pad(h.score.toFixed(1), 6) + h.title);
  return { out, facts };
}

export interface TermContext {
  net: Network;
  history: string[];
}

/** The box as the player has left it: the level's box with the earlier commands replayed. */
export function boxNow(ctx: TermContext): LinuxBox | undefined {
  return ctx.net.box ? replayBox(ctx.net.box, ctx.history.slice(0, -1), splitArgs) : undefined;
}

/** `command | grep [-i] [-v] [-c] [-E] text`: the one pipe an audit needs. */
function pipeGrep(r: CommandResult, grepArgs: string[]): CommandResult {
  const flags = grepArgs.filter((a) => /^-[ivcE]+$/.test(a)).join('');
  const pattern = grepArgs.find((a) => !/^-[ivcE]+$/.test(a)) ?? '';
  let test: (l: string) => boolean;
  if (flags.includes('E')) {
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags.includes('i') ? 'i' : '');
    } catch {
      return { out: ['grep: Unmatched ( or \\('], facts: [] };
    }
    test = (l) => re.test(l);
  } else test = (l) => (flags.includes('i') ? l.toLowerCase().includes(pattern.toLowerCase()) : l.includes(pattern));
  const kept = r.out.filter((l) => (flags.includes('v') ? !test(l) : test(l)));
  const facts = r.facts.filter((f) => !f.startsWith('sshd:') || kept.some((l) => l === f.slice(5).replace(/:/, ' ')));
  return { ...r, out: flags.includes('c') ? [String(kept.length)] : kept, facts: [...facts, 'grep'] };
}

export function execute(line: string, ctx: TermContext): CommandResult {
  const pipe = /^(.*?)\s*\|\s*(grep\b.*)$/.exec(line.trim());
  if (pipe && !/['"][^'"]*\|/.test(pipe[1]!)) {
    const left = execute(pipe[1]!, ctx);
    if (left.fail || left.clear) return left;
    return pipeGrep(left, splitArgs(pipe[2]!).slice(1));
  }
  const box = boxNow(ctx);
  const net = box ? { ...ctx.net, box } : ctx.net;
  const msf = replayMsf(ctx.history.slice(0, -1), ctx.net);
  if (msf.active) {
    const r = msfLine(msf, line, ctx.net);
    if (r) return r;
    // msfconsole hands anything it does not know to the shell.
    const shell = run(splitArgs(line.trim()), { ...ctx, net }, false);
    return { ...shell, out: [`[*] exec: ${line.trim()}`, '', ...shell.out] };
  }
  return run(splitArgs(line.trim()), { ...ctx, net }, false);
}

/** The prompt to show now: msfconsole's, the box's, or the analyst's. */
export function promptNow(ctx: TermContext): string | null {
  const msf = replayMsf(ctx.history, ctx.net);
  return msf.active ? msfPrompt(msf) : null;
}

function run(args: string[], ctx: TermContext, root: boolean): CommandResult {
  const [cmd = '', ...rest] = args;
  const box = ctx.net.box;
  if (box && cmd !== 'sudo') {
    const r = boxCommand(box, cmd, rest, root);
    if (r) return r;
  }
  switch (cmd) {
    case '':
      return { out: [], facts: [] };
    case 'help':
      return {
        out: [
          'Commands:',
          '  nmap      find hosts and open ports          curl    send an HTTP request',
          '  nc        connect to a port, read its banner  dig     look up a DNS name',
          '  whois     who owns a domain or address        vulndb  search known CVEs',
          '  ls, cat   read your notes                     submit  hand in your answer',
          ...(box
            ? [
                '  ipcalc    work out a subnet                   ip      this machine\'s addresses and routes',
                '  ls -l     files and their permissions         chmod   change who may read a file',
                '  ps aux    running processes                   ss      ports this machine listens on',
                '  systemctl start, stop and disable services     ufw     the firewall',
                '  tail      last lines of a log                 grep    lines that contain some text',
                '  sudo <command> runs one command as root.',
              ]
            : []),
          '  man <command> opens its manual on the side. Tab completes, arrow keys recall.',
        ],
        facts: [],
      };
    case 'man': {
      const page = rest[0];
      if (!page || !MAN[page]) return { out: [page ? `No manual entry for ${page}` : 'What manual page do you want? Example: man nmap'], facts: [] };
      return { out: [`Opened the manual for ${page}.`], facts: [`man:${page}`], man: page };
    }
    case 'clear':
      return { out: [], facts: [], clear: true };
    case 'history':
      return { out: ctx.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`), facts: [] };
    case 'whoami':
      return { out: ['analyst'], facts: [] };
    case 'pwd':
      return { out: ['/home/analyst'], facts: [] };
    case 'echo':
      return { out: [rest.join(' ')], facts: [] };
    case 'ls': {
      const dir = (rest[0] ?? '').replace(/\/$/, '');
      const names = Object.keys(ctx.net.files)
        .filter((f) => (dir ? f.startsWith(dir + '/') : true))
        .map((f) => (dir ? f.slice(dir.length + 1) : f))
        .map((f) => (f.includes('/') ? f.split('/')[0] + '/' : f));
      const uniq = [...new Set(names)];
      if (dir && uniq.length === 0) return { out: [`ls: cannot access '${dir}': No such file or directory`], facts: [] };
      return { out: [uniq.join('  ')], facts: [] };
    }
    case 'cat': {
      const f = rest[0];
      if (!f) return { out: ['usage: cat <file>'], facts: [] };
      const body = ctx.net.files[f.replace(/^\.\//, '')];
      if (body === undefined) return { out: [`cat: ${f}: No such file or directory`], facts: [] };
      return { out: body.split('\n'), facts: [`cat:${f.replace(/^\.\//, '')}`] };
    }
    case 'nmap':
      return nmap(rest, ctx.net, root);
    case 'ipcalc':
      return ipcalc(rest);
    case 'npm':
      if (!ctx.net.audit) break;
      return npm(ctx.net.audit, rest, ctx.history.slice(0, -1).some((h) => /^npm audit fix\s*$/.test(h.trim())));
    case 'trivy':
      if (!ctx.net.audit) break;
      return trivy(ctx.net.audit, rest);
    case 'docker':
      if (!ctx.net.audit) break;
      return docker(ctx.net.audit, rest);
    case 'aws':
      if (!ctx.net.audit) break;
      return aws(ctx.net.audit, rest);
    case 'prowler':
      if (!ctx.net.audit) break;
      return prowler(ctx.net.audit, rest);
    case 'sshd':
      if (!ctx.net.audit) break;
      return sshdT(ctx.net.audit, rest, root);
    case 'msfconsole':
      if (!ctx.net.roe) return { out: ['msfconsole: command not found. Type help for the list.'], facts: [] };
      return { out: MSF_BANNER, facts: ['msf-start'], delay: 500 };
    case 'curl':
      return curl(rest, ctx.net);
    case 'nc':
    case 'netcat':
      return nc(rest, ctx.net);
    case 'dig':
      return dig(rest, ctx.net);
    case 'whois':
      return whois(rest, ctx.net);
    case 'vulndb':
    case 'searchsploit':
      return vulndb(rest);
    case 'submit': {
      const answer = rest.join(' ').trim();
      if (!answer) return { out: ['usage: submit <answer>'], facts: [] };
      return { out: [`Submitted: ${answer}`], facts: [], submit: answer };
    }
    case 'sudo':
      if (!box) return { out: ['analyst is not in the sudoers file. This incident will be reported.'], facts: [] };
      if (!rest.length) return { out: ['usage: sudo <command>'], facts: [] };
      if (rest[0] === 'sudo' || rest[0] === 'su' || rest[0] === '-i' || rest[0] === '-s') return { out: ['Run one command at a time with sudo in front of it.'], facts: [] };
      return run(rest, ctx, true);
    default:
      break;
  }
  return { out: [`${cmd}: command not found. Type help for the list.`], facts: [] };
}

// ---- Tab completion ---------------------------------------------------------

const NMAP_FLAGS = ['-sn', '-sV', '-sU', '-p', '-p-', '-Pn'];

/** Complete the last word of a line. Returns the new line and, when ambiguous, the options. */
export function complete(line: string, ctx: TermContext): { line: string; options: string[] } {
  const endsWithSpace = /\s$/.test(line);
  const words = line.trim() === '' ? [] : line.trim().split(/\s+/);
  const current = endsWithSpace ? '' : (words[words.length - 1] ?? '');
  const index = endsWithSpace ? words.length : Math.max(0, words.length - 1);
  const cmd = words[0] ?? '';
  let pool: string[];
  const msf = replayMsf(ctx.history, ctx.net);
  if (msf.active) {
    const mod = msf.module ? MODULE_BY_PATH[msf.module] : undefined;
    if (index === 0) pool = [...MSF_COMMANDS.filter((c) => c !== 'msfconsole'), 'exit', 'sessions', 'help'];
    else if (cmd === 'use' || cmd === 'info') pool = MODULES.map((m) => m.path);
    else if (cmd === 'show') pool = ['options', 'payloads'];
    else if (cmd === 'set' && index === 1) pool = [...(mod?.options.map((o) => o.name) ?? []), ...(mod?.payloads ? ['PAYLOAD', 'LHOST', 'LPORT'] : [])];
    else if (cmd === 'set' && (words[1] ?? '').toUpperCase() === 'PAYLOAD' && mod?.payloads) pool = PAYLOADS[mod.payloads].map((p) => p.name);
    else if (cmd === 'set') pool = [ctx.net.cidr, ...ctx.net.hosts.map((h) => h.ip)];
    else pool = [];
    const matches = [...new Set(pool.filter((p) => p.startsWith(current)))].sort();
    if (matches.length === 0) return { line, options: [] };
    const prefix = commonPrefix(matches);
    const head = endsWithSpace ? line : line.slice(0, line.length - current.length);
    if (matches.length === 1) return { line: head + matches[0] + ' ', options: [] };
    return { line: head + prefix, options: prefix === current ? matches : [] };
  }
  const box = boxNow({ ...ctx, history: [...ctx.history, ''] });
  const sub = cmd === 'sudo' ? (words[1] ?? '') : cmd;
  const subIndex = cmd === 'sudo' ? index - 1 : index;
  const boxFiles = box ? Object.keys(box.files).filter((f) => f.startsWith(box.cwd + '/')).map((f) => f.slice(box.cwd.length + 1)).filter((f) => !f.includes('/')) : [];
  if (index === 0 || (cmd === 'sudo' && subIndex === 0)) pool = [...(box ? [...COMMANDS, ...BOX_COMMANDS] : COMMANDS), ...(ctx.net.roe ? ['msfconsole'] : [])];
  else if (cmd === 'man') pool = Object.keys(MAN);
  else if (box && ['cat', 'ls', 'chmod', 'tail', 'grep'].includes(sub)) pool = [...boxFiles, ...Object.keys(box.files)];
  else if (box && sub === 'systemctl') pool = subIndex === 1 ? ['status', 'stop', 'start', 'disable', 'enable', 'is-enabled', 'list-units'] : box.services.map((s) => s.unit);
  else if (box && sub === 'ufw') pool = subIndex === 1 ? ['status', 'enable', 'disable', 'default', 'allow', 'deny', 'limit', 'delete'] : ['verbose', 'numbered', 'deny', 'incoming', 'from', 'to', 'any', 'port', 'proto', 'tcp'];
  else if (cmd === 'cat' || cmd === 'ls') pool = Object.keys(ctx.net.files);
  else if (['nmap', 'curl', 'nc', 'whois', 'dig'].includes(sub)) {
    const hosts = ctx.net.hosts.flatMap((h) => [h.ip, ...(h.name ? [h.name] : [])]);
    const names = Object.keys(ctx.net.dns);
    pool = [...(sub === 'nmap' ? [...NMAP_FLAGS, ctx.net.cidr] : []), ...(sub === 'curl' ? [...hosts.map((h) => `http://${h}`), ...(box ? ['ifconfig.me'] : [])] : []), ...hosts, ...names];
  } else pool = [];
  const matches = [...new Set(pool.filter((p) => p.startsWith(current)))].sort();
  if (matches.length === 0) return { line, options: [] };
  const prefix = commonPrefix(matches);
  const head = endsWithSpace ? line : line.slice(0, line.length - current.length);
  if (matches.length === 1) return { line: head + matches[0] + (matches[0]!.endsWith('/') ? '' : ' '), options: [] };
  return { line: head + prefix, options: prefix === current ? matches : [] };
}

function commonPrefix(items: string[]): string {
  let p = items[0] ?? '';
  for (const s of items) while (!s.startsWith(p)) p = p.slice(0, -1);
  return p;
}
