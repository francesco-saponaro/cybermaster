// msfconsole inside the terminal: the module catalogue, search, use, info,
// options, payload choice, auxiliary scanners and check. Exploits are never
// fired: every engagement in the game allows non-destructive checks only, so
// run on an exploit module is refused with the reason, which is the habit the
// job needs. The console's state (module, options, last search) is replayed
// from the shell history, like the Linux box.

import type { CommandResult, Host, Network } from './terminal';
import { expandTarget, splitArgs } from './terminal';

export type Rank = 'excellent' | 'great' | 'good' | 'normal' | 'average' | 'low' | 'manual';

export interface MsfOption {
  name: string;
  value: string;
  required: boolean;
  desc: string;
}

export interface MsfModule {
  path: string;
  name: string;
  rank: Rank;
  disclosed: string;
  check: boolean;
  description: string;
  refs: string[];
  options: MsfOption[];
  /** For exploits: whether the module takes a Unix command payload or a Windows one. */
  payloads?: 'cmd-unix' | 'windows';
  /** What the check (or scanner) looks at: the port, and what makes a host vulnerable. */
  port: number;
  vulnerable?: (h: Host) => boolean | null;
  scanner?: 'ftp_version' | 'smb_version' | 'ssh_version' | 'smb_ms17_010';
}

const opt = (name: string, value: string, required: boolean, desc: string): MsfOption => ({ name, value, required, desc });
const RH = opt('RHOSTS', '', true, 'The target host(s), see https://docs.metasploit.com/docs/using-metasploit/basics/using-metasploit.html');
const port = (h: Host, n: number) => h.ports.find((p) => p.port === n && !p.udp);
const flag = (h: Host, n: number, f: string) => !!port(h, n)?.flags?.includes(f);

export const MODULES: MsfModule[] = [
  {
    path: 'exploit/unix/ftp/proftpd_modcopy_exec',
    name: 'ProFTPD 1.3.5 Mod_Copy Command Execution',
    rank: 'excellent',
    disclosed: '2015-04-22',
    check: true,
    description: 'This module exploits the SITE CPFR/CPTO commands in ProFTPD version 1.3.5. Any unauthenticated client can leverage these commands to copy files from any part of the filesystem to a chosen destination. The check sends one SITE CPFR command and copies nothing.',
    refs: ['CVE-2015-3306', 'EDB-36742'],
    options: [RH, opt('RPORT', '80', true, 'HTTP port (TCP)'), opt('RPORT_FTP', '21', true, 'FTP port'), opt('SITEPATH', '/var/www', true, 'Absolute writable website path'), opt('TARGETURI', '/', true, 'Base path to the website'), opt('TMPPATH', '/tmp', true, 'Absolute writable path')],
    payloads: 'cmd-unix',
    port: 21,
    vulnerable: (h) => {
      const p = port(h, 21);
      if (!p) return null;
      return /proftpd/i.test(p.product ?? '') && p.version === '1.3.5';
    },
  },
  {
    path: 'exploit/unix/ftp/proftpd_133c_backdoor',
    name: 'ProFTPD-1.3.3c Backdoor Command Execution',
    rank: 'excellent',
    disclosed: '2010-12-02',
    check: false,
    description: 'This module exploits a malicious backdoor that was added to the ProFTPD download archive. This backdoor was present in the proftpd-1.3.3c.tar.[bz2|gz] archive between November 28th 2010 and 2nd of December 2010.',
    refs: ['OSVDB-69562'],
    options: [RH, opt('RPORT', '21', true, 'The target port (TCP)')],
    payloads: 'cmd-unix',
    port: 21,
  },
  {
    path: 'exploit/unix/ftp/vsftpd_234_backdoor',
    name: 'VSFTPD v2.3.4 Backdoor Command Execution',
    rank: 'excellent',
    disclosed: '2011-07-03',
    check: false,
    description: 'This module exploits a malicious backdoor that was added to the VSFTPD download archive. This backdoor was introduced into the vsftpd-2.3.4.tar.gz archive between June 30th 2011 and July 1st 2011.',
    refs: ['CVE-2011-2523', 'OSVDB-73573'],
    options: [RH, opt('RPORT', '21', true, 'The target port (TCP)')],
    payloads: 'cmd-unix',
    port: 21,
  },
  {
    path: 'exploit/multi/http/apache_normalize_path_rce',
    name: 'Apache 2.4.49/2.4.50 Traversal RCE',
    rank: 'excellent',
    disclosed: '2021-05-10',
    check: true,
    description: 'This module exploits an unauthenticated RCE vulnerability which exists in Apache version 2.4.49 (CVE-2021-41773). If files outside of the document root are not protected and CGI has been explicitly enabled, it can be used to execute arbitrary commands. Version 2.4.50 is affected by an incomplete fix (CVE-2021-42013).',
    refs: ['CVE-2021-41773', 'CVE-2021-42013'],
    options: [RH, opt('RPORT', '443', true, 'The target port (TCP)'), opt('SSL', 'true', false, 'Negotiate SSL/TLS for outgoing connections'), opt('TARGETURI', '/cgi-bin', true, 'Base path')],
    payloads: 'cmd-unix',
    port: 80,
    vulnerable: (h) => {
      const p = h.ports.find((x) => /apache/i.test(x.product ?? ''));
      if (!p) return null;
      return p.version === '2.4.49' || p.version === '2.4.50';
    },
  },
  {
    path: 'exploit/windows/smb/ms17_010_eternalblue',
    name: 'MS17-010 EternalBlue SMB Remote Windows Kernel Pool Corruption',
    rank: 'average',
    disclosed: '2017-03-14',
    check: true,
    description: 'This module is a port of the Equation Group ETERNALBLUE exploit, part of the FuzzBunch toolkit released by Shadow Brokers. There is a buffer overflow memmove operation in Srv!SrvOs2FeaToNt. Exploitation can crash the target: never fire it outside an agreed window. The check only asks the SMBv1 server a question.',
    refs: ['CVE-2017-0143', 'CVE-2017-0144', 'CVE-2017-0145', 'CVE-2017-0146', 'CVE-2017-0147', 'CVE-2017-0148', 'MSB-MS17-010'],
    options: [RH, opt('RPORT', '445', true, 'The target port (TCP)'), opt('SMBDomain', '', false, '(Optional) The Windows domain to use for authentication')],
    payloads: 'windows',
    port: 445,
    vulnerable: (h) => (port(h, 445) ? flag(h, 445, 'ms17-010') : null),
  },
  {
    path: 'exploit/linux/samba/is_known_pipename',
    name: 'Samba is_known_pipename() Arbitrary Module Load',
    rank: 'excellent',
    disclosed: '2017-03-24',
    check: true,
    description: 'This module triggers an arbitrary shared library load vulnerability in Samba versions 3.5.0 to 4.4.14, 4.5.10, and 4.6.4. This module requires valid credentials, a writeable folder in an accessible share, and knowledge of the server-side path of the writeable folder.',
    refs: ['CVE-2017-7494'],
    options: [RH, opt('RPORT', '445', true, 'The SMB service port (TCP)')],
    payloads: 'cmd-unix',
    port: 445,
    vulnerable: (h) => {
      const p = port(h, 445);
      if (!p || !/samba/i.test(p.product ?? '')) return null;
      const m = /^(\d+)\.(\d+)\.(\d+)/.exec(p.version ?? '');
      if (!m) return false;
      const [a, b, c] = [+m[1]!, +m[2]!, +m[3]!];
      return (a === 3 && b >= 5) || (a === 4 && (b < 4 || (b === 4 && c < 14) || (b === 5 && c < 10) || (b === 6 && c < 4)));
    },
  },
  {
    path: 'auxiliary/scanner/ftp/ftp_version',
    name: 'FTP Version Scanner',
    rank: 'normal',
    disclosed: '',
    check: false,
    description: 'Detect FTP Version.',
    refs: [],
    options: [RH, opt('RPORT', '21', true, 'The target port (TCP)'), opt('THREADS', '1', true, 'The number of concurrent threads (max one per host)')],
    port: 21,
    scanner: 'ftp_version',
  },
  {
    path: 'auxiliary/scanner/ssh/ssh_version',
    name: 'SSH Version Scanner',
    rank: 'normal',
    disclosed: '',
    check: false,
    description: 'Detect SSH Version.',
    refs: [],
    options: [RH, opt('RPORT', '22', true, 'The target port (TCP)'), opt('THREADS', '1', true, 'The number of concurrent threads (max one per host)')],
    port: 22,
    scanner: 'ssh_version',
  },
  {
    path: 'auxiliary/scanner/smb/smb_version',
    name: 'SMB Version Detection',
    rank: 'normal',
    disclosed: '',
    check: false,
    description: 'Fingerprint and display version information about SMB servers. Protocol information and host operating system (if available) will be reported.',
    refs: [],
    options: [RH, opt('THREADS', '1', true, 'The number of concurrent threads (max one per host)')],
    port: 445,
    scanner: 'smb_version',
  },
  {
    path: 'auxiliary/scanner/smb/smb_ms17_010',
    name: 'MS17-010 SMB RCE Detection',
    rank: 'normal',
    disclosed: '',
    check: false,
    description: 'Uses information disclosure to determine if MS17-010 has been patched or not. Specifically, it connects to the IPC$ tree and attempts a transaction on FID 0. If the status returned is "STATUS_INSUFF_SERVER_RESOURCES", the machine does not have the MS17-010 patch.',
    refs: ['CVE-2017-0143', 'CVE-2017-0144', 'MSB-MS17-010'],
    options: [RH, opt('RPORT', '445', true, 'The SMB service port (TCP)'), opt('THREADS', '1', true, 'The number of concurrent threads (max one per host)')],
    port: 445,
    scanner: 'smb_ms17_010',
  },
];

export const MODULE_BY_PATH = Object.fromEntries(MODULES.map((m) => [m.path, m])) as Record<string, MsfModule>;

export const PAYLOADS: Record<'cmd-unix' | 'windows', { name: string; desc: string; reverse: boolean }[]> = {
  'cmd-unix': [
    { name: 'cmd/unix/bind_netcat', desc: 'Unix Command Shell, Bind TCP (via netcat)', reverse: false },
    { name: 'cmd/unix/bind_perl', desc: 'Unix Command Shell, Bind TCP (via Perl)', reverse: false },
    { name: 'cmd/unix/generic', desc: 'Unix Command, Generic Command Execution', reverse: false },
    { name: 'cmd/unix/reverse_netcat', desc: 'Unix Command Shell, Reverse TCP (via netcat)', reverse: true },
    { name: 'cmd/unix/reverse_perl', desc: 'Unix Command Shell, Reverse TCP (via Perl)', reverse: true },
    { name: 'cmd/unix/reverse_python', desc: 'Unix Command Shell, Reverse TCP (via Python)', reverse: true },
  ],
  windows: [
    { name: 'windows/x64/meterpreter/bind_tcp', desc: 'Windows Meterpreter (Reflective Injection x64), Bind TCP Stager', reverse: false },
    { name: 'windows/x64/meterpreter/reverse_tcp', desc: 'Windows Meterpreter (Reflective Injection x64), Windows x64 Reverse TCP Stager', reverse: true },
    { name: 'windows/x64/shell/reverse_tcp', desc: 'Windows x64 Command Shell, Windows x64 Reverse TCP Stager', reverse: true },
  ],
};

// ---- State --------------------------------------------------------------------------

export interface MsfState {
  active: boolean;
  module: string | null;
  opts: Record<string, string>;
  globals: Record<string, string>;
  lastSearch: string[];
}

const fresh = (): MsfState => ({ active: false, module: null, opts: {}, globals: {}, lastSearch: [] });

export function msfPrompt(s: MsfState): string {
  if (!s.module) return 'msf6 >';
  const [type, ...rest] = s.module.split('/');
  return `msf6 ${type}(${rest.join('/')}) >`;
}

function value(s: MsfState, m: MsfModule, name: string): string {
  const key = Object.keys(s.opts).find((k) => k.toUpperCase() === name.toUpperCase());
  if (key) return s.opts[key]!;
  const g = Object.keys(s.globals).find((k) => k.toUpperCase() === name.toUpperCase());
  if (g) return s.globals[g]!;
  return m.options.find((o) => o.name.toUpperCase() === name.toUpperCase())?.value ?? '';
}

function search(terms: string[]): MsfModule[] {
  const words = terms.map((t) => t.toLowerCase());
  return MODULES.filter((m) =>
    words.every((w) => {
      const [k, v] = w.includes(':') ? (w.split(':', 2) as [string, string]) : ['', w];
      if (k === 'type') return m.path.startsWith(v);
      if (k === 'cve') return m.refs.some((r) => r.toLowerCase() === `cve-${v}`);
      if (k === 'name') return m.name.toLowerCase().includes(v);
      const hay = `${m.path} ${m.name} ${m.description} ${m.refs.join(' ')}`.toLowerCase();
      return hay.includes(w);
    }),
  );
}

function table(rows: string[][], indent = '   '): string[] {
  const w = rows[0]!.map((_, i) => Math.max(...rows.map((r) => r[i]!.length)));
  return rows.map((r) => (indent + r.map((c, i) => c.padEnd(w[i]!)).join('  ')).trimEnd());
}

function optionsTable(s: MsfState, m: MsfModule): string[] {
  const rows = [['Name', 'Current Setting', 'Required', 'Description'], ['----', '---------------', '--------', '-----------']];
  for (const o of m.options) rows.push([o.name, value(s, m, o.name), o.required ? 'yes' : 'no', o.desc]);
  const out = ['', `Module options (${m.path}):`, '', ...table(rows), ''];
  const payload = value(s, m, 'PAYLOAD');
  if (m.payloads && payload) {
    const p = PAYLOADS[m.payloads].find((x) => x.name === payload);
    const prow = [['Name', 'Current Setting', 'Required', 'Description'], ['----', '---------------', '--------', '-----------']];
    if (p?.reverse) prow.push(['LHOST', value(s, m, 'LHOST'), 'yes', 'The listen address (an interface may be specified)'], ['LPORT', value(s, m, 'LPORT') || '4444', 'yes', 'The listen port']);
    else prow.push(['LPORT', value(s, m, 'LPORT') || '4444', 'yes', 'The listen port'], ['RHOST', value(s, m, 'RHOSTS'), 'no', 'The target address']);
    out.push(`Payload options (${payload}):`, '', ...table(prow), '');
  }
  if (m.path.startsWith('exploit/')) out.push('Exploit target:', '', ...table([['Id', 'Name'], ['--', '----'], ['0', 'Automatic']]), '');
  return out;
}

function info(m: MsfModule): string[] {
  return [
    `       Name: ${m.name}`,
    `     Module: ${m.path}`,
    `       Rank: ${m.rank[0]!.toUpperCase()}${m.rank.slice(1)}`,
    ...(m.disclosed ? [`  Disclosed: ${m.disclosed}`] : []),
    '',
    `Check supported:`,
    `  ${m.check ? 'Yes' : 'No'}`,
    '',
    'Basic options:',
    ...table([['Name', 'Current Setting', 'Required', 'Description'], ['----', '---------------', '--------', '-----------'], ...m.options.map((o) => [o.name, o.value, o.required ? 'yes' : 'no', o.desc])], '  '),
    '',
    'Description:',
    ...wrap(m.description, 76).map((l) => '  ' + l),
    '',
    ...(m.refs.length ? ['References:', ...m.refs.map((r) => `  ${r.startsWith('CVE-') ? `https://nvd.nist.gov/vuln/detail/${r}` : r}`)] : []),
  ];
}

function wrap(text: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(' ')) {
    if ((line + ' ' + w).trim().length > n) {
      out.push(line.trim());
      line = w;
    } else line += ' ' + w;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

function targets(net: Network, spec: string): Host[] | string {
  const all: Host[] = [];
  for (const t of spec.split(/[\s,]+/).filter(Boolean)) {
    const e = expandTarget(t, net);
    if (!e) return `Msf::OptionValidateError The following options failed to validate: RHOSTS.`;
    for (const ip of e.ips) {
      const h = net.hosts.find((x) => x.ip === ip);
      if (h) all.push(h);
    }
    if (e.count === 1 && !e.ips.length) all.push({ ip: t, ports: [] });
  }
  return all;
}

// ---- One line in the console ------------------------------------------------------------

/** Run one line in msfconsole. Mutates `s`; returns null when the line is not a console command (msfconsole hands it to the shell). */
export function msfLine(s: MsfState, line: string, net: Network): CommandResult | null {
  const args = splitArgs(line.trim());
  const [cmd = '', ...rest] = args;
  const m = s.module ? MODULE_BY_PATH[s.module] : undefined;
  switch (cmd) {
    case '':
      return { out: [], facts: [] };
    case 'exit':
    case 'quit':
      Object.assign(s, fresh());
      return { out: [], facts: ['msf-exit'] };
    case 'help':
    case '?':
      return {
        out: [
          'Core Commands',
          '=============',
          '    search <terms>     Find modules: search proftpd, search type:auxiliary smb, search cve:2017-0143',
          '    use <module|#>     Select a module by name, or by its number in the last search',
          '    info [module]      Everything about a module: rank, whether it supports check, options, references',
          '    show options       The options of the selected module and their current values',
          '    show payloads      Payloads this exploit can carry',
          '    set <name> <value> Set an option, like set RHOSTS 10.0.9.9',
          '    check              Ask the target whether it looks vulnerable, without exploiting it',
          '    run                Run a module (auxiliary scanners). Exploits stay off in this engagement.',
          '    back               Leave the current module',
          '    exit               Leave msfconsole',
          'Any other command is passed to the shell, like nmap.',
        ],
        facts: [],
      };
    case 'search': {
      if (!rest.length) return { out: ['Usage: search [<options>] [<keywords>:<value>]'], facts: [] };
      const hits = search(rest);
      s.lastSearch = hits.map((h) => h.path);
      if (!hits.length) return { out: ['[-] No results from search'], facts: [`msf-search:${rest.join(' ').toLowerCase()}`] };
      const rows = [['#', 'Name', 'Disclosure Date', 'Rank', 'Check', 'Description'], ['-', '----', '---------------', '----', '-----', '-----------']];
      hits.forEach((h, i) => rows.push([String(i), h.path, h.disclosed, h.rank, h.check ? 'Yes' : 'No', h.name]));
      return {
        out: ['', 'Matching Modules', '================', '', ...table(rows), '', '', `Interact with a module by name or index. For example info ${hits.length - 1}, use ${hits.length - 1} or use ${hits[hits.length - 1]!.path}`],
        facts: [`msf-search:${rest.join(' ').toLowerCase()}`, 'msf-search'],
      };
    }
    case 'use': {
      const t = rest[0];
      if (!t) return { out: ['Usage: use <name|index>'], facts: [] };
      const path = /^\d+$/.test(t) ? s.lastSearch[Number(t)] : t.replace(/^\//, '');
      const mod = path ? (MODULE_BY_PATH[path] ?? MODULES.find((x) => x.path.endsWith('/' + path))) : undefined;
      if (!mod) return { out: [`[-] No results from search`, `[-] Failed to load module: ${t}`], facts: [], fail: 'No module by that name. Use search to find it, then use its full name or its number.' };
      s.module = mod.path;
      s.opts = {};
      const out = mod.payloads ? [`[*] No payload configured, defaulting to ${mod.payloads === 'windows' ? 'windows/x64/meterpreter/reverse_tcp' : 'cmd/unix/reverse_netcat'}`] : [];
      if (mod.payloads) s.opts.PAYLOAD = mod.payloads === 'windows' ? 'windows/x64/meterpreter/reverse_tcp' : 'cmd/unix/reverse_netcat';
      return { out, facts: [`msf-use:${mod.path}`] };
    }
    case 'back':
      s.module = null;
      s.opts = {};
      return { out: [], facts: [] };
    case 'info': {
      const t = rest[0];
      const target = t ? (/^\d+$/.test(t) ? MODULE_BY_PATH[s.lastSearch[Number(t)] ?? ''] : MODULE_BY_PATH[t]) : m;
      if (!target) return { out: [t ? `[-] Invalid module: ${t}` : 'Usage: info <module name>'], facts: [] };
      return { out: info(target), facts: [`msf-info:${target.path}`] };
    }
    case 'show':
    case 'options': {
      const what = cmd === 'options' ? 'options' : rest[0];
      if (!m) return { out: [`[-] No module selected. Pick one with use.`], facts: [] };
      if (what === 'options') return { out: optionsTable(s, m), facts: ['msf-options', `msf-options:${m.path}`] };
      if (what === 'payloads') {
        if (!m.payloads) return { out: ['[-] This is not an exploit module: auxiliary modules carry no payload.'], facts: [] };
        const rows = [['#', 'Name', 'Disclosure Date', 'Rank', 'Check', 'Description'], ['-', '----', '---------------', '----', '-----', '-----------']];
        PAYLOADS[m.payloads].forEach((p, i) => rows.push([String(i), `payload/${p.name}`, '', 'normal', 'No', p.desc]));
        return { out: ['', 'Compatible Payloads', '===================', '', ...table(rows)], facts: ['msf-payloads'] };
      }
      return { out: ['Usage: show options | show payloads'], facts: [] };
    }
    case 'set':
    case 'setg': {
      const [name, ...v] = rest;
      if (!name || !v.length) return { out: ['Usage: set <option> <value>'], facts: [] };
      const val = v.join(' ');
      const up = name.toUpperCase();
      if (up === 'PAYLOAD') {
        if (!m?.payloads) return { out: ['[-] This module does not take a payload.'], facts: [] };
        const p = PAYLOADS[m.payloads].find((x) => x.name === val.replace(/^payload\//, ''));
        if (!p) return { out: [`[-] The value specified for PAYLOAD is not valid.`], facts: [], fail: 'That payload does not fit this exploit. Pick one from show payloads.' };
        s.opts.PAYLOAD = p.name;
        return { out: [`PAYLOAD => ${p.name}`], facts: [`msf-opt:PAYLOAD=${p.name}`, `msf-payload:${p.reverse ? 'reverse' : 'bind'}`] };
      }
      if (cmd === 'setg') s.globals[up] = val;
      else s.opts[up] = val;
      return { out: [`${up} => ${val}`], facts: [`msf-opt:${up}=${val}`] };
    }
    case 'unset':
      if (rest[0]) delete s.opts[rest[0].toUpperCase()];
      return { out: [`Unsetting ${rest[0] ?? ''}...`], facts: [] };
    case 'sessions':
      return { out: ['', 'Active sessions', '===============', '', 'No active sessions.'], facts: [] };
    case 'check': {
      if (!m) return { out: ['[-] No module selected. Pick one with use.'], facts: [] };
      const rh = value(s, m, 'RHOSTS');
      if (!rh) return { out: ['[-] Msf::OptionValidateError One or more options failed to validate: RHOSTS.'], facts: [], fail: 'Set the target first: set RHOSTS followed by its address.' };
      const hs = targets(net, rh);
      if (typeof hs === 'string') return { out: [`[-] ${hs}`], facts: [] };
      const out: string[] = [];
      const facts = ['msf-check-run'];
      for (const h of hs) {
        if (h.outOfScope) return { out: [`[-] ${h.ip} is not in the signed scope.`], facts: ['out-of-scope-scan'], fail: `${h.ip} is out of scope: not even a check without permission.` };
        const rp = m.port === 21 ? '21' : value(s, m, 'RPORT') || String(m.port);
        if (!m.check) {
          out.push(`[*] ${h.ip}:${rp} - This module does not support check.`);
          facts.push(`msf-nocheck:${m.path}`);
          continue;
        }
        const v = m.vulnerable?.(h);
        if (v === null || v === undefined) {
          out.push(`[*] ${h.ip}:${rp} - Cannot reliably check exploitability. The service did not answer on port ${m.port}.`);
          facts.push(`msf-check:${h.ip}:unknown`);
        } else if (v) {
          const why = m.path.includes('proftpd_modcopy') ? ' Unauthenticated SITE CPFR command was successful' : m.path.includes('ms17_010') ? ' The target is vulnerable.' : '';
          out.push(m.path.includes('ms17_010') ? `[+] ${h.ip}:${rp} - The target is vulnerable.` : `[+] ${h.ip}:${rp} - The target appears to be vulnerable.${why}`);
          facts.push(`msf-check:${h.ip}:${m.path.includes('ms17_010') ? 'vulnerable' : 'appears'}`);
        } else {
          out.push(`[*] ${h.ip}:${rp} - The target is not exploitable.`);
          facts.push(`msf-check:${h.ip}:safe`);
        }
      }
      return { out, facts, delay: 700 };
    }
    case 'run':
    case 'exploit': {
      if (!m) return { out: ['[-] No module selected. Pick one with use.'], facts: [] };
      if (m.path.startsWith('exploit/')) {
        return {
          out: ['[-] Not run. The signed rules of engagement for this job allow non-destructive verification only.', '[*] Use check to ask the target, and write the finding from that.'],
          facts: ['msf-refused-run'],
        };
      }
      const rh = value(s, m, 'RHOSTS');
      if (!rh) return { out: ['[-] Msf::OptionValidateError One or more options failed to validate: RHOSTS.'], facts: [], fail: 'Set the targets first: set RHOSTS followed by an address or a range like 10.0.9.0/24.' };
      const hs = targets(net, rh);
      if (typeof hs === 'string') return { out: [`[-] ${hs}`], facts: [] };
      const blocked = hs.find((h) => h.outOfScope);
      if (blocked) return { out: [`[-] ${blocked.ip} is not in the signed scope.`], facts: ['out-of-scope-scan'], fail: `${blocked.ip} is out of scope. Narrow RHOSTS to the signed range.` };
      const out: string[] = [];
      const facts = [`msf-run:${m.path}`, `msf-run:${m.path}:${rh}`];
      for (const h of hs) {
        const p = port(h, m.port);
        if (!p) continue;
        facts.push(`msf-scan:${m.scanner}:${h.ip}`);
        if (m.scanner === 'ftp_version') out.push(`[+] ${h.ip}:21              - FTP Banner: '${p.banner ?? `220 ${p.product} ${p.version ?? ''}`}\\x0d\\x0a'`);
        if (m.scanner === 'ssh_version') out.push(`[+] ${h.ip}:22              - SSH server version: ${p.banner ?? `SSH-2.0-${p.product}_${p.version}`}`);
        if (m.scanner === 'smb_version') {
          const win = /windows/i.test(p.product ?? '');
          out.push(`[*] ${h.ip}:445             - SMB Detected (versions:${flag(h, 445, 'smbv1') ? '1, 2' : '2, 3'}) (preferred dialect:SMB ${flag(h, 445, 'smbv1') ? '2.1' : '3.1.1'})`);
          out.push(`[+] ${h.ip}:445             - Host is running ${win ? (h.name?.includes('scan') ? 'Windows 7 Professional SP1 (build:7601)' : p.product) : `${p.product} ${p.version ?? ''}`.replace('smbd', '').replace(/\s+/g, ' ').trim()}`);
        }
        if (m.scanner === 'smb_ms17_010') {
          if (flag(h, 445, 'ms17-010')) out.push(`[+] ${h.ip}:445             - Host is likely VULNERABLE to MS17-010! - Windows 7 Professional 7601 Service Pack 1 x64 (64-bit)`);
          else out.push(`[-] ${h.ip}:445             - Host does NOT appear vulnerable.`);
          if (flag(h, 445, 'ms17-010')) facts.push(`msf-ms17:${h.ip}`);
        }
      }
      const n = Math.max(1, hs.length);
      out.push(`[*] ${rh.includes('/') ? `Scanned ${n} of ${n} hosts (100% complete)` : `${hs[0]?.ip ?? rh}: Scanned 1 of 1 hosts (100% complete)`}`, '[*] Auxiliary module execution completed');
      return { out, facts, delay: 900 };
    }
    default:
      return null;
  }
}

/** The console as the player left it: replay every earlier line. */
export function replayMsf(history: string[], net: Network): MsfState {
  const s = fresh();
  for (const line of history) {
    const t = line.trim();
    if (!s.active) {
      if (/^msfconsole(\s+-q)?$/.test(t)) s.active = true;
      continue;
    }
    msfLine(s, t, net);
  }
  return s;
}

export const MSF_BANNER = ['', '       =[ metasploit v6.4.35-dev ]', '+ -- --=[ 2461 exploits - 1267 auxiliary ]', '+ -- --=[ 1471 payloads - 49 encoders ]', '', 'Documentation: https://docs.metasploit.com/', ''];
