// The Perimeter's terminal: a parser for a shell line, a simulated network,
// and the handful of tools an analyst reaches for first. Output follows the
// real tools' formats closely enough that it reads the same on a real job.

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
};

export function lookupCves(product: string, version: string): CveEntry[] {
  const p = product.toLowerCase().replace(/^apache$/, 'apache httpd').replace(/^httpd$/, 'apache httpd');
  return VULNDB[`${p} ${version.toLowerCase()}`] ?? [];
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
  ports: number[] | 'all' | null;
  targets: string[];
}

export function parseNmap(args: string[]): { ok: true; opts: NmapOptions } | { ok: false; error: string } {
  const opts: NmapOptions = { pingOnly: false, versions: false, noPing: false, ports: null, targets: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '-sn') opts.pingOnly = true;
    else if (a === '-sV') opts.versions = true;
    else if (a === '-A') opts.versions = true;
    else if (a === '-Pn') opts.noPing = true;
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
  if (opts.targets.length === 0) return { ok: false, error: 'nmap: no target given. Example: nmap 10.0.8.12' };
  return { ok: true, opts };
}

export function parsePorts(spec: string): number[] | 'all' | null {
  if (spec === '-') return 'all';
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b > 65535 || b < a) return null;
    if (b - a > 70000) return null;
    for (let p = a; p <= b; p++) out.push(p);
  }
  return out;
}

function ipToInt(ip: string): number | null {
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
  ls: { synopsis: 'ls [folder]', lines: ['Lists the files in your working folder.'] },
  cat: { synopsis: 'cat <file>', lines: ['Prints a file.'] },
};

function pad(s: string, n: number): string {
  return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length);
}

function versionString(p: Port): string {
  return [p.product, p.version, p.extra].filter(Boolean).join(' ');
}

const TOP_PORTS = new Set([21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 993, 995, 1723, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 2121, 8081, 9200, 27017]);

function nmap(args: string[], net: Network): CommandResult {
  const parsed = parseNmap(args);
  if (!parsed.ok) return { out: [parsed.error], facts: [], fail: parsed.error };
  const { opts } = parsed;
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
      const open = h.ports.filter((p) => (wanted ? wanted.includes(p.port) : opts.ports === 'all' || TOP_PORTS.has(p.port)));
      const closed = wanted ? wanted.filter((n) => !h.ports.some((p) => p.port === n)) : [];
      const scanned = opts.ports === 'all' ? 65535 : wanted ? wanted.length : 1000;
      const notShown = scanned - open.length - (closed.length <= 5 ? closed.length : 0);
      if (notShown > 0) out.push(`Not shown: ${notShown} closed tcp ports (reset)`);
      const rows: string[][] = open.map((p) => [`${p.port}/tcp`, 'open', p.service, opts.versions ? versionString(p) : '']);
      if (closed.length <= 5) for (const c of closed) rows.push([`${c}/tcp`, 'closed', SERVICE_NAMES[c] ?? 'unknown', '']);
      rows.sort((a, b) => parseInt(a[0]!) - parseInt(b[0]!));
      if (rows.length === 0) {
        out.push(`All ${scanned} scanned ports on ${label} are in ignored states.`);
      } else {
        const w0 = Math.max(4, ...rows.map((r) => r[0]!.length));
        const w1 = Math.max(5, ...rows.map((r) => r[1]!.length));
        const w2 = Math.max(7, ...rows.map((r) => r[2]!.length));
        out.push(pad('PORT', w0) + pad('STATE', w1) + (opts.versions ? pad('SERVICE', w2) + 'VERSION' : 'SERVICE'));
        for (const r of rows) out.push(pad(r[0]!, w0) + pad(r[1]!, w1) + (opts.versions ? pad(r[2]!, w2) + r[3] : r[2]));
      }
      for (const p of open) {
        facts.push(`port:${h.ip}:${p.port}`);
        if (opts.versions) facts.push(`version:${h.ip}:${p.port}`);
      }
      facts.push(`ports:${h.ip}`);
      out.push('');
    }
    if (hosts.length === 0 && exp.count === 1) {
      out.push('Note: Host seems down. If it is really up, but blocking our ping probes, try -Pn');
    }
  }
  const secs = opts.pingOnly ? (1.4 + addresses / 300).toFixed(2) : (2.1 + up * 1.7 + (opts.versions ? 6 : 0)).toFixed(2);
  out.push(`Nmap done: ${addresses} IP address${addresses === 1 ? '' : 'es'} (${up} host${up === 1 ? '' : 's'} up) scanned in ${secs} seconds`);
  return { out, facts, delay: opts.versions ? 900 : 600 };
}

const SERVICE_NAMES: Record<number, string> = { 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'domain', 80: 'http', 110: 'pop3', 139: 'netbios-ssn', 143: 'imap', 443: 'https', 445: 'microsoft-ds', 3306: 'mysql', 3389: 'ms-wbt-server', 5432: 'postgresql', 6379: 'redis', 8080: 'http-proxy' };

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
  const host = findHost(u.hostname, net);
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (host?.outOfScope) return { out: [`Stopped: ${host.ip} is not in scope.`], facts: ['out-of-scope-scan'], fail: `${host.ip} is out of scope: nothing gets touched without permission. Run cat scope.txt and only touch what it lists.` };
  const svc = host?.ports.find((p) => p.port === port);
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
  const svc = host?.ports.find((p) => p.port === port);
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
  const facts = [`vulndb:${product.toLowerCase()} ${version.toLowerCase()}`];
  if (!hits.length) return { out: [`No known CVEs for ${product} ${version} in the local database.`], facts };
  const out = [pad('CVE', 16) + pad('CVSS', 6) + 'Summary', '-'.repeat(64)];
  for (const h of hits) out.push(pad(h.id, 16) + pad(h.score.toFixed(1), 6) + h.title);
  return { out, facts };
}

export interface TermContext {
  net: Network;
  history: string[];
}

export function execute(line: string, ctx: TermContext): CommandResult {
  const args = splitArgs(line.trim());
  const [cmd = '', ...rest] = args;
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
      return nmap(rest, ctx.net);
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
      return { out: ['analyst is not in the sudoers file. This incident will be reported.'], facts: [] };
    default:
      return { out: [`${cmd}: command not found. Type help for the list.`], facts: [] };
  }
}

// ---- Tab completion ---------------------------------------------------------

const NMAP_FLAGS = ['-sn', '-sV', '-p', '-p-', '-Pn'];

/** Complete the last word of a line. Returns the new line and, when ambiguous, the options. */
export function complete(line: string, ctx: TermContext): { line: string; options: string[] } {
  const endsWithSpace = /\s$/.test(line);
  const words = line.trim() === '' ? [] : line.trim().split(/\s+/);
  const current = endsWithSpace ? '' : (words[words.length - 1] ?? '');
  const index = endsWithSpace ? words.length : Math.max(0, words.length - 1);
  const cmd = words[0] ?? '';
  let pool: string[];
  if (index === 0) pool = COMMANDS;
  else if (cmd === 'man') pool = Object.keys(MAN);
  else if (cmd === 'cat' || cmd === 'ls') pool = Object.keys(ctx.net.files);
  else if (['nmap', 'curl', 'nc', 'whois', 'dig'].includes(cmd)) {
    const hosts = ctx.net.hosts.flatMap((h) => [h.ip, ...(h.name ? [h.name] : [])]);
    const names = Object.keys(ctx.net.dns);
    pool = [...(cmd === 'nmap' ? [...NMAP_FLAGS, ctx.net.cidr] : []), ...(cmd === 'curl' ? hosts.map((h) => `http://${h}`) : []), ...hosts, ...names];
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
