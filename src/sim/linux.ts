// The machine you are logged in to in The Basics: its files and their
// permissions, its processes and listening sockets, systemd services and the
// ufw firewall. The box is never stored: its state now is the level's
// starting box with every earlier command in the history replayed on it, so
// what you changed stays changed and nothing else can drift.

import type { BoxFile, BoxService, CommandResult, LinuxBox, UfwRule } from './terminal';
import { ipToInt } from './terminal';

// ---- Paths and modes --------------------------------------------------------

export function absPath(box: LinuxBox, p: string): string {
  if (!p || p === '.') return box.cwd;
  if (p === '~') return box.home;
  let path = p.startsWith('/') ? p : p.startsWith('~/') ? `${box.home}/${p.slice(2)}` : `${box.cwd}/${p}`;
  const parts: string[] = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  path = '/' + parts.join('/');
  return path;
}

const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);

function isDir(box: LinuxBox, p: string): boolean {
  if (box.files[p]?.dir) return true;
  return Object.keys(box.files).some((f) => f.startsWith(p === '/' ? '/' : p + '/'));
}

/** rwxr-x--- from 0o750, with d for folders. */
export function modeString(mode: number, dir = false): string {
  const bits = 'rwxrwxrwx';
  let s = dir ? 'd' : '-';
  for (let i = 0; i < 9; i++) s += mode & (1 << (8 - i)) ? bits[i] : '-';
  return s;
}

export const octal = (mode: number) => mode.toString(8).padStart(3, '0');

/** Apply chmod's mode argument: 600, 0640, o-r, go-rwx, u=rw,go= ... */
export function applyChmod(mode: number, spec: string): number | null {
  if (/^0?[0-7]{3}$/.test(spec)) return parseInt(spec, 8);
  let m = mode;
  for (const clause of spec.split(',')) {
    const c = /^([ugoa]*)([-+=])([rwx]*)$/.exec(clause);
    if (!c) return null;
    const who = c[1] || 'a';
    const perm = (c[3]!.includes('r') ? 4 : 0) | (c[3]!.includes('w') ? 2 : 0) | (c[3]!.includes('x') ? 1 : 0);
    const shifts = [...new Set(who.replace('a', 'ugo').split(''))].map((w) => (w === 'u' ? 6 : w === 'g' ? 3 : 0));
    for (const sh of shifts) {
      if (c[2] === '+') m |= perm << sh;
      else if (c[2] === '-') m &= ~(perm << sh);
      else m = (m & ~(7 << sh)) | (perm << sh);
    }
  }
  return m;
}

function canRead(box: LinuxBox, f: BoxFile, root: boolean): boolean {
  if (root) return true;
  if (f.owner === box.user) return !!(f.mode & 0o400);
  if (box.groups.includes(f.group)) return !!(f.mode & 0o040);
  return !!(f.mode & 0o004);
}

// ---- Firewall ---------------------------------------------------------------

function inRange(ip: string, from: string): boolean {
  if (from === 'any') return true;
  const [net, bitsRaw] = from.split('/');
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  const a = ipToInt(ip);
  const b = ipToInt(net!);
  if (a === null || b === null) return false;
  const size = 2 ** (32 - bits);
  const start = b - (b % size);
  return a >= start && a < start + size;
}

/** Would a new connection to `port` from `ip` get through? First matching rule wins, then the default. */
export function ufwAllows(box: LinuxBox, port: number, proto: 'tcp' | 'udp', ip: string): boolean {
  if (!box.ufw.active) return true;
  for (const r of box.ufw.rules) {
    if (r.port !== undefined && r.port !== port) continue;
    if (r.proto && r.proto !== proto) continue;
    if (!inRange(ip, r.from)) continue;
    return r.action !== 'deny';
  }
  return box.ufw.defaultIn === 'allow';
}

const SERVICE_PORTS: Record<string, { port: number; proto: 'tcp' | 'udp' }> = {
  ssh: { port: 22, proto: 'tcp' },
  http: { port: 80, proto: 'tcp' },
  https: { port: 443, proto: 'tcp' },
  dns: { port: 53, proto: 'udp' },
  redis: { port: 6379, proto: 'tcp' },
  postgresql: { port: 5432, proto: 'tcp' },
};

/** Read a ufw rule from words like `allow 22/tcp`, `allow from 10.0.0.0/8 to any port 22 proto tcp`, `limit ssh`. */
export function parseUfwRule(words: string[]): UfwRule | string {
  const [action, ...rest] = words;
  if (action !== 'allow' && action !== 'deny' && action !== 'limit') return `ERROR: Invalid syntax`;
  const rule: UfwRule = { action, from: 'any' };
  if (rest.length === 0) return 'ERROR: Invalid syntax';
  const w = rest.filter((x) => x !== 'in');
  if (w.length === 1 && w[0] !== 'from') {
    const m = /^(\d+)(?:\/(tcp|udp))?$/.exec(w[0]!);
    if (m) {
      rule.port = Number(m[1]);
      if (m[2]) rule.proto = m[2] as 'tcp' | 'udp';
      return rule;
    }
    const svc = SERVICE_PORTS[w[0]!.toLowerCase()];
    if (!svc) return `ERROR: Could not find a profile matching '${w[0]}'`;
    rule.port = svc.port;
    rule.proto = svc.proto;
    return rule;
  }
  for (let i = 0; i < w.length; i++) {
    const k = w[i];
    const v = w[i + 1];
    if (k === 'from' && v) {
      if (v !== 'any' && !/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(v)) return `ERROR: Bad source address`;
      rule.from = v;
      i++;
    } else if (k === 'to' && v) {
      if (v !== 'any') return 'ERROR: This box has one address: use "to any"';
      i++;
    } else if (k === 'port' && v) {
      if (!/^\d+$/.test(v)) return `ERROR: Bad port`;
      rule.port = Number(v);
      i++;
    } else if (k === 'proto' && v) {
      if (v !== 'tcp' && v !== 'udp') return 'ERROR: Unsupported protocol';
      rule.proto = v;
      i++;
    } else return 'ERROR: Invalid syntax';
  }
  return rule;
}

const ruleKey = (r: UfwRule) => `${r.action}|${r.port ?? '*'}|${r.proto ?? '*'}|${r.from}`;

function ruleTo(r: UfwRule, v6 = false): string {
  const port = r.port === undefined ? 'Anywhere' : `${r.port}${r.proto ? '/' + r.proto : ''}`;
  return v6 ? `${port} (v6)` : port;
}

function ufwTable(box: LinuxBox, verbose: boolean, numbered: boolean): string[] {
  const rows: [string, string, string][] = [];
  for (const r of box.ufw.rules) {
    const act = r.action.toUpperCase() + (verbose || numbered ? ' IN' : '');
    rows.push([ruleTo(r), act, r.from === 'any' ? 'Anywhere' : r.from]);
  }
  for (const r of box.ufw.rules) if (r.from === 'any') rows.push([ruleTo(r, true), r.action.toUpperCase() + (verbose || numbered ? ' IN' : ''), 'Anywhere (v6)']);
  if (!rows.length) return [];
  const out = ['', numbered ? '     To                         Action      From' : 'To                         Action      From', numbered ? '     --                         ------      ----' : '--                         ------      ----'];
  rows.forEach(([to, act, from], i) => {
    const line = to.padEnd(27) + act.padEnd(12) + from;
    out.push(numbered ? `[${String(i + 1).padStart(2)}] ${line}` : line);
  });
  return out;
}

/** What the firewall lets through, as facts: for each port a service listens on, open to the world, the office only, or closed. */
export function reach(box: LinuxBox, port: number): 'public' | 'office-only' | 'closed' {
  const world = box.internet ? ufwAllows(box, port, 'tcp', box.internet) : true;
  const office = box.sshFrom ? ufwAllows(box, port, 'tcp', box.sshFrom) : true;
  return world ? 'public' : office ? 'office-only' : 'closed';
}

function reachFacts(box: LinuxBox): string[] {
  const facts: string[] = [];
  const ports = new Set<number>([22, 80, 443, ...box.services.flatMap((s) => s.listen.map((l) => l.port)), ...Object.keys(box.want ?? {}).map(Number)]);
  for (const port of ports) facts.push(`fw:${port}:${reach(box, port)}`);
  if (box.want && box.ufw.defaultIn === 'deny' && Object.entries(box.want).every(([p, w]) => reach(box, Number(p)) === w)) facts.push('fw:as-planned');
  return facts;
}

// ---- Commands that read the box -------------------------------------------

function lsLine(path: string, f: BoxFile): string {
  const size = String(f.size ?? f.body?.length ?? 4096).padStart(5);
  return `${modeString(f.mode, f.dir)} 1 ${f.owner.padEnd(6)} ${f.group.padEnd(6)} ${size} Nov 12 09:14 ${base(path)}`;
}

function permFacts(path: string, f: BoxFile): string[] {
  const name = base(path);
  const facts = [`mode:${path}:${octal(f.mode)}`, `ls:${name}`];
  if (!f.dir) {
    if (f.mode & 0o004) facts.push(`world-readable:${name}`);
    if (f.mode & 0o002) facts.push(`world-writable:${name}`);
    if ((f.mode & 0o007) === 0) facts.push(`private:${name}`);
    if (!(f.mode & 0o022)) facts.push(`no-group-other-write:${name}`);
  }
  return facts;
}

function ls(box: LinuxBox, args: string[]): CommandResult {
  const flags = args.filter((a) => a.startsWith('-')).join('');
  const long = flags.includes('l');
  const all = flags.includes('a');
  const targets = args.filter((a) => !a.startsWith('-'));
  const target = absPath(box, targets[0] ?? '.');
  const facts: string[] = ['ls'];
  const single = box.files[target];
  if (single && !single.dir) {
    if (!long) return { out: [targets[0]!], facts };
    return { out: [lsLine(target, single)], facts: [...facts, ...permFacts(target, single)] };
  }
  if (!isDir(box, target)) return { out: [`ls: cannot access '${targets[0]}': No such file or directory`], facts: [] };
  const prefix = target === '/' ? '/' : target + '/';
  const children = Object.keys(box.files)
    .filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes('/'))
    .filter((f) => all || !base(f).startsWith('.'))
    .sort((a, b) => base(a).replace(/^\./, '').localeCompare(base(b).replace(/^\./, '')));
  if (!long) return { out: [children.map((c) => base(c) + (box.files[c]!.dir ? '/' : '')).join('  ')], facts };
  const out = [`total ${children.length * 4 + (all ? 8 : 0)}`];
  if (all) out.push(`drwxr-xr-x 3 ${box.user.padEnd(6)} ${box.user.padEnd(6)}  4096 Nov 12 09:14 .`, 'drwxr-xr-x 4 root   root    4096 Nov  2 10:20 ..');
  for (const c of children) {
    out.push(lsLine(c, box.files[c]!));
    facts.push(...permFacts(c, box.files[c]!));
  }
  return { out, facts };
}

function readFile(box: LinuxBox, arg: string | undefined, root: boolean, cmd: string): { path: string; body: string } | CommandResult {
  if (!arg) return { out: [`usage: ${cmd} <file>`], facts: [] };
  const path = absPath(box, arg);
  const f = box.files[path];
  if (!f) return { out: [`${cmd}: ${arg}: No such file or directory`], facts: [] };
  if (f.dir) return { out: [`${cmd}: ${arg}: Is a directory`], facts: [] };
  if (!canRead(box, f, root)) return { out: [`${cmd}: ${arg}: Permission denied`], facts: [], fail: `${arg} belongs to ${f.owner} and is not readable by you: put sudo in front.` };
  return { path, body: f.body ?? '' };
}

function cat(box: LinuxBox, args: string[], root: boolean): CommandResult {
  const r = readFile(box, args[0], root, 'cat');
  if ('out' in r) return r;
  return { out: r.body.split('\n'), facts: [`cat:${base(r.path)}`, `read:${r.path}`] };
}

function tail(box: LinuxBox, args: string[], root: boolean): CommandResult {
  let n = 10;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '-n') n = Number(args[++i] ?? 10);
    else if (/^-n?\d+$/.test(a)) n = Number(a.replace(/^-n?/, ''));
    else rest.push(a);
  }
  const r = readFile(box, rest[0], root, 'tail');
  if ('out' in r) return r;
  return { out: r.body.split('\n').slice(-n), facts: [`read:${r.path}`] };
}

function grep(box: LinuxBox, args: string[], root: boolean): CommandResult {
  const count = args.includes('-c');
  const icase = args.includes('-i');
  const words = args.filter((a) => !a.startsWith('-'));
  if (words.length < 2) return { out: ['usage: grep [-c] [-i] <text> <file>'], facts: [] };
  const r = readFile(box, words[1], root, 'grep');
  if ('out' in r) return r;
  const needle = icase ? words[0]!.toLowerCase() : words[0]!;
  const hits = r.body.split('\n').filter((l) => (icase ? l.toLowerCase() : l).includes(needle));
  return { out: count ? [String(hits.length)] : hits, facts: [`read:${r.path}`, `grep:${r.path}`] };
}

function ps(box: LinuxBox): CommandResult {
  const rows = [
    ['root', 1, '/sbin/init'],
    ['root', 402, '/usr/lib/systemd/systemd-journald'],
    ['root', 655, 'sshd: /usr/sbin/sshd -D [listener] 0 of 10-100 startups'],
    ...box.services.filter((s) => s.active && s.process !== 'sshd').map((s) => [s.user, s.pid, s.process + (s.listen[0] ? ` ${s.listen[0].addr}:${s.listen[0].port}` : '')] as [string, number, string]),
    [box.user, 2210, '-bash'],
    [box.user, 2291, 'ps aux'],
  ] as [string, number, string][];
  const out = ['USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND'];
  for (const [u, pid, cmd] of rows) out.push(`${u.padEnd(10)} ${String(pid).padStart(5)}  0.0  0.1  ${String(18000 + pid * 7).padStart(5)}  ${String(4000 + pid).padStart(4)} ?        Ss   Nov09   0:01 ${cmd}`);
  return { out, facts: ['ps', ...box.services.filter((s) => s.active).map((s) => `proc:${s.unit}`)] };
}

function ss(box: LinuxBox, args: string[], root: boolean): CommandResult {
  const flags = args.filter((a) => a.startsWith('-')).join('').replace(/-/g, '');
  const tcp = flags.includes('t') || !flags.includes('u');
  const udp = flags.includes('u');
  const listening = flags.includes('l');
  const procs = flags.includes('p');
  if (!listening) return { out: ['(no established connections besides your own SSH session)', 'Tip: -l lists the ports waiting for connections: ss -tlnp'], facts: [] };
  const out = [`Netid State  Recv-Q Send-Q   Local Address:Port    Peer Address:Port Process`];
  const facts = ['ss'];
  const all = box.services.flatMap((s) => s.listen.map((l) => ({ s, l })));
  for (const { s, l } of all) {
    if ((l.proto === 'tcp' && !tcp) || (l.proto === 'udp' && !udp)) continue;
    if (!s.active) {
      facts.push(`closed:${l.port}`);
      continue;
    }
    const state = l.proto === 'tcp' ? 'LISTEN' : 'UNCONN';
    const who = procs && (root || s.user === box.user) ? `users:(("${s.process}",pid=${s.pid},fd=6))` : '';
    out.push(`${l.proto.padEnd(5)} ${state.padEnd(6)} 0      ${l.proto === 'tcp' ? '511' : '0  '}    ${`${l.addr}:${l.port}`.padStart(17)}    ${'0.0.0.0:*'.padStart(15)} ${who}`);
    facts.push(`listen:${l.port}:${l.addr}`);
    if (l.addr === '0.0.0.0' || l.addr === '*' || l.addr === '[::]') facts.push(`exposed:${l.port}`);
    else facts.push(`local:${l.port}`);
  }
  if (procs && !root) out.push('(Not all processes could be identified: run as root with sudo to see every owner.)');
  return { out, facts };
}

function findUnit(box: LinuxBox, name: string | undefined): BoxService | undefined {
  if (!name) return undefined;
  const n = name.replace(/\.service$/, '');
  return box.services.find((s) => s.unit === n || s.process === n);
}

function unitStatus(s: BoxService): string[] {
  const lines = [
    `${s.active ? '●' : '○'} ${s.unit}.service - ${s.description}`,
    `     Loaded: loaded (/usr/lib/systemd/system/${s.unit}.service; ${s.enabled ? 'enabled' : 'disabled'}; preset: enabled)`,
    s.active ? `     Active: active (running) since Mon 2026-11-09 06:58:12 CET; 4 days ago` : `     Active: inactive (dead)`,
  ];
  if (s.active) lines.push(`   Main PID: ${s.pid} (${s.process})`, `     CGroup: /system.slice/${s.unit}.service`, `             └─${s.pid} ${s.process}${s.listen[0] ? ` ${s.listen[0].addr}:${s.listen[0].port}` : ''}`);
  return lines;
}

const unitFacts = (s: BoxService) => [`unit:${s.unit}`, `${s.enabled ? 'enabled' : 'disabled'}:${s.unit}`, `${s.active ? 'active' : 'inactive'}:${s.unit}`, ...(!s.enabled && !s.active ? [`off:${s.unit}`] : [])];

function systemctl(box: LinuxBox, args: string[], root: boolean): CommandResult {
  const now = args.includes('--now');
  const words = args.filter((a) => !a.startsWith('-'));
  const [sub, name] = words;
  if (!sub) return { out: ['usage: systemctl status|stop|start|disable|enable|is-enabled|is-active <service>', '       systemctl list-units --type=service'], facts: [] };
  if (sub === 'list-units') {
    const out = ['  UNIT                       LOAD   ACTIVE SUB     DESCRIPTION'];
    for (const s of box.services.filter((x) => x.active)) out.push(`  ${(s.unit + '.service').padEnd(26)} loaded active running ${s.description}`);
    return { out, facts: ['units', ...box.services.filter((s) => s.active).map((s) => `unit:${s.unit}`)] };
  }
  const s = findUnit(box, name);
  if (!name) return { out: [`Too few arguments. Example: systemctl ${sub} ssh`], facts: [] };
  if (!s) return { out: [`Unit ${name.replace(/\.service$/, '')}.service could not be found.`], facts: [] };
  switch (sub) {
    case 'status':
      return { out: unitStatus(s), facts: unitFacts(s) };
    case 'is-enabled':
      return { out: [s.enabled ? 'enabled' : 'disabled'], facts: [`${s.enabled ? 'enabled' : 'disabled'}:${s.unit}`] };
    case 'is-active':
      return { out: [s.active ? 'active' : 'inactive'], facts: [`${s.active ? 'active' : 'inactive'}:${s.unit}`] };
    case 'stop':
    case 'start':
    case 'restart':
    case 'disable':
    case 'enable': {
      if (!root) {
        const verb = sub === 'disable' || sub === 'enable' ? `${sub} unit file` : `${sub} ${s.unit}.service`;
        return { out: [`Failed to ${verb}: Access denied`], facts: [], fail: `Changing a service needs root: put sudo in front, like sudo systemctl ${sub} ${s.unit}.` };
      }
      if (s.keep && (sub === 'stop' || sub === 'disable')) {
        return { out: [`(not done: ${s.keep})`], facts: [], fail: `Leave ${s.unit} running: ${s.keep}` };
      }
      if (s.unit === 'ssh' && (sub === 'stop' || sub === 'disable')) {
        return { out: ['Refusing: this is the SSH service your own session runs on.'], facts: [], fail: 'Stopping SSH would cut you off from the box. Leave ssh alone and change the service the step names.' };
      }
      const out: string[] = [];
      if (sub === 'stop') s.active = false;
      if (sub === 'start' || sub === 'restart') s.active = true;
      if (sub === 'disable') {
        if (s.enabled) out.push(`Removed "/etc/systemd/system/multi-user.target.wants/${s.unit}.service".`);
        s.enabled = false;
        if (now) s.active = false;
      }
      if (sub === 'enable') {
        if (!s.enabled) out.push(`Created symlink /etc/systemd/system/multi-user.target.wants/${s.unit}.service → /usr/lib/systemd/system/${s.unit}.service.`);
        s.enabled = true;
        if (now) s.active = true;
      }
      return { out, facts: [`did:${sub}:${s.unit}`] };
    }
    default:
      return { out: [`Unknown command verb '${sub}'.`], facts: [] };
  }
}

function ufw(box: LinuxBox, args: string[], root: boolean): CommandResult {
  const [sub, ...rest] = args;
  if (!sub) return { out: ['usage: ufw status [verbose|numbered] | enable | disable | default deny incoming | allow <rule> | deny <rule> | limit <rule> | delete <n>'], facts: [] };
  if (!root) return { out: ['ERROR: You need to be root to run this script'], facts: [], fail: 'ufw changes and reads the firewall, which needs root: put sudo in front, like sudo ufw status verbose.' };
  const fw = box.ufw;
  switch (sub) {
    case 'status': {
      const verbose = rest[0] === 'verbose';
      const numbered = rest[0] === 'numbered';
      if (!fw.active) return { out: ['Status: inactive'], facts: ['ufw:inactive', 'ufw-seen'] };
      const out = ['Status: active'];
      const facts = ['ufw:active', 'ufw-seen', ...reachFacts(box)];
      if (verbose) {
        out.push('Logging: on (low)', `Default: ${fw.defaultIn} (incoming), allow (outgoing), disabled (routed)`, 'New profiles: skip');
        facts.push(fw.defaultIn === 'deny' ? 'fw:default-deny' : 'fw:default-allow');
      }
      out.push(...ufwTable(box, verbose, numbered));
      return { out, facts };
    }
    case 'default': {
      const [policy, dir] = rest;
      if ((policy !== 'deny' && policy !== 'allow' && policy !== 'reject') || (dir !== 'incoming' && dir !== 'outgoing')) return { out: ['ERROR: Usage: ufw default deny|allow incoming|outgoing'], facts: [] };
      if (dir === 'outgoing') return { out: [`Default outgoing policy changed to '${policy}'`, '(be sure to update your rules accordingly)'], facts: [] };
      fw.defaultIn = policy === 'allow' ? 'allow' : 'deny';
      return { out: [`Default incoming policy changed to '${policy}'`, '(be sure to update your rules accordingly)'], facts: fw.defaultIn === 'deny' ? ['set:default-deny'] : [] };
    }
    case 'allow':
    case 'deny':
    case 'limit': {
      const r = parseUfwRule([sub, ...rest]);
      if (typeof r === 'string') return { out: [r], facts: [], fail: 'ufw did not understand that rule. Copy the rule from the step, for example sudo ufw allow 443/tcp.' };
      if (fw.rules.some((x) => ruleKey(x) === ruleKey(r))) return { out: ['Skipping adding existing rule', ...(r.from === 'any' ? ['Skipping adding existing rule (v6)'] : [])], facts: [] };
      fw.rules.push(r);
      return { out: ['Rule added', ...(r.from === 'any' ? ['Rule added (v6)'] : [])], facts: [`ufw-rule:${r.action}:${r.port ?? 'all'}:${r.from}`] };
    }
    case 'delete': {
      if (rest.length === 1 && /^\d+$/.test(rest[0]!)) {
        const i = Number(rest[0]) - 1;
        if (!fw.rules[i]) return { out: ['ERROR: Could not find rule ' + rest[0]], facts: [] };
        fw.rules.splice(i, 1);
        return { out: ['Rule deleted'], facts: [] };
      }
      const r = parseUfwRule(rest);
      if (typeof r === 'string') return { out: [r], facts: [] };
      const i = fw.rules.findIndex((x) => ruleKey(x) === ruleKey(r));
      if (i < 0) return { out: ['Could not delete non-existent rule'], facts: [] };
      fw.rules.splice(i, 1);
      return { out: ['Rule deleted', ...(r.from === 'any' ? ['Rule deleted (v6)'] : [])], facts: [] };
    }
    case 'enable': {
      const warn = 'Command may disrupt existing ssh connections. Proceed with operation (y|n)? y';
      if (box.sshFrom && !ufwAllows({ ...box, ufw: { ...fw, active: true } }, 22, 'tcp', box.sshFrom)) {
        return {
          out: [warn, `Connection to ${box.hostname} closed by remote host.`, '(The simulation rolled the firewall back so you can try again.)'],
          facts: ['locked-out'],
          fail: `You just locked yourself out: the firewall now drops SSH from ${box.sshFrom}, the address you are connected from. Allow 22 from your network before enabling.`,
        };
      }
      fw.active = true;
      return { out: [warn, 'Firewall is active and enabled on system startup'], facts: ['ufw-on'] };
    }
    case 'disable':
      fw.active = false;
      return { out: ['Firewall stopped and disabled on system startup'], facts: [] };
    case 'reset':
      fw.active = false;
      fw.rules = [];
      fw.defaultIn = 'allow';
      return { out: ['Resetting all rules to installed defaults. Proceed with operation (y|n)? y', 'Firewall reset'], facts: [] };
    default:
      return { out: [`ERROR: Invalid syntax`], facts: [] };
  }
}

function chmod(box: LinuxBox, args: string[], root: boolean): CommandResult {
  const words = args.filter((a) => a !== '-R' && a !== '-v');
  const [spec, ...targets] = words;
  if (!spec || targets.length === 0) return { out: ['usage: chmod <mode> <file>   e.g. chmod 600 .env'], facts: [] };
  const out: string[] = [];
  const facts: string[] = [];
  for (const t of targets) {
    const path = absPath(box, t);
    const f = box.files[path];
    if (!f) {
      out.push(`chmod: cannot access '${t}': No such file or directory`);
      continue;
    }
    if (!root && f.owner !== box.user) return { out: [`chmod: changing permissions of '${t}': Operation not permitted`], facts: [], fail: `${t} belongs to ${f.owner}: only its owner or root can change it.` };
    const next = applyChmod(f.mode, spec);
    if (next === null) return { out: [`chmod: invalid mode: '${spec}'`], facts: [], fail: 'chmod reads a mode like 600 or o-r. Copy it from the step.' };
    if (!f.dir && next & 0o002) return { out: [`(refused: ${modeString(next)} lets every user on the box rewrite ${t})`], facts: [], fail: `That makes ${t} writable by everyone, which is worse. Owner read and write only is 600.` };
    f.mode = next;
    facts.push(`chmod:${base(path)}`);
    if (!f.dir && (next & 0o007) === 0) facts.push(`chmod-private:${base(path)}`);
    if (!(next & 0o022)) facts.push(`chmod-nowrite:${base(path)}`);
  }
  return { out, facts };
}

/**
 * Commands that touch the box. Returns null for commands that are not about
 * the box, so the terminal handles them as before. Mutates `box`.
 */
export function boxCommand(box: LinuxBox, cmd: string, args: string[], root: boolean): CommandResult | null {
  switch (cmd) {
    case 'ls':
      return ls(box, args);
    case 'cat':
      return cat(box, args, root);
    case 'tail':
      return tail(box, args, root);
    case 'grep':
      return grep(box, args, root);
    case 'cd': {
      const target = absPath(box, args[0] ?? '~');
      if (!isDir(box, target)) return { out: [`cd: ${args[0]}: No such file or directory`], facts: [] };
      box.cwd = target;
      return { out: [], facts: [] };
    }
    case 'pwd':
      return { out: [box.cwd], facts: [] };
    case 'whoami':
      return { out: [root ? 'root' : box.user], facts: ['whoami'] };
    case 'hostname':
      return { out: [box.hostname], facts: [] };
    case 'id':
      return {
        out: [root ? 'uid=0(root) gid=0(root) groups=0(root)' : `uid=${box.uid}(${box.user}) gid=${box.uid}(${box.user}) groups=${box.groups.map((g, i) => `${i === 0 ? box.uid : g === 'sudo' ? 27 : 1100 + i}(${g})`).join(',')}`],
        facts: ['id'],
      };
    case 'chmod':
      return chmod(box, args, root);
    case 'ps':
      return ps(box);
    case 'ss':
    case 'netstat':
      return ss(box, args, root);
    case 'systemctl':
      return systemctl(box, args, root);
    case 'ufw':
      return ufw(box, args, root);
    case 'ip': {
      const sub = args[0] ?? '';
      if (sub === 'a' || sub === 'addr' || sub === 'address') {
        const i = box.iface;
        const bc = broadcastOf(i.ip, i.prefix);
        return {
          out: [
            '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000',
            '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00',
            '    inet 127.0.0.1/8 scope host lo',
            `2: ${i.name}: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000`,
            `    link/ether ${i.mac} brd ff:ff:ff:ff:ff:ff`,
            `    inet ${i.ip}/${i.prefix} brd ${bc} scope global dynamic ${i.name}`,
          ],
          facts: ['ip-addr', `local-ip:${i.ip}`],
        };
      }
      if (sub === 'r' || sub === 'route') {
        const i = box.iface;
        return {
          out: [`default via ${box.gateway} dev ${i.name} proto dhcp src ${i.ip} metric 100`, `${networkOf(i.ip, i.prefix)}/${i.prefix} dev ${i.name} proto kernel scope link src ${i.ip}`],
          facts: ['ip-route', `gateway:${box.gateway}`],
        };
      }
      return { out: ['usage: ip addr | ip route'], facts: [] };
    }
    default:
      return null;
  }
}

const MUTATING = new Set(['chmod', 'systemctl', 'ufw', 'cd']);

/** The box as it is now: the level's box with every earlier line of the history replayed on it. */
export function replayBox(start: LinuxBox, earlier: string[], split: (line: string) => string[]): LinuxBox {
  const box: LinuxBox = structuredClone(start);
  for (const line of earlier) {
    let words = split(line.trim());
    let root = false;
    if (words[0] === 'sudo') {
      root = true;
      words = words.slice(1);
    }
    const [cmd = '', ...rest] = words;
    if (MUTATING.has(cmd)) boxCommand(box, cmd, rest, root);
  }
  return box;
}

// ---- Subnets ------------------------------------------------------------------

const intToIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
const maskOf = (bits: number) => (bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0);

export function networkOf(ip: string, bits: number): string {
  return intToIp((ipToInt(ip)! & maskOf(bits)) >>> 0);
}

export function broadcastOf(ip: string, bits: number): string {
  return intToIp(((ipToInt(ip)! & maskOf(bits)) | (~maskOf(bits) >>> 0)) >>> 0);
}

/** How many addresses a host can use in a /bits: two fewer than the block, except /31 and /32. */
export function usableHosts(bits: number): number {
  if (bits === 32) return 1;
  if (bits === 31) return 2;
  return 2 ** (32 - bits) - 2;
}

function binary(n: number, bits: number): string {
  const b = (n >>> 0).toString(2).padStart(32, '0');
  const dotted = b.replace(/(.{8})(?!$)/g, '$1.');
  // A space at the boundary between network and host bits, as ipcalc prints it.
  const at = bits + Math.floor(bits / 8) - (bits % 8 === 0 && bits > 0 ? 1 : 0);
  return bits >= 32 ? dotted : dotted.slice(0, at) + ' ' + dotted.slice(at).replace(/^\./, '');
}

export function ipcalc(args: string[]): CommandResult {
  const spec = args.find((a) => !a.startsWith('-'));
  if (!spec) return { out: ['usage: ipcalc <address>/<bits>   e.g. ipcalc 192.168.40.0/24'], facts: [] };
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/.exec(spec);
  if (!m || ipToInt(m[1]!) === null) return { out: [`INVALID ADDRESS: ${spec}`], facts: [], fail: 'ipcalc needs an address and a prefix, like ipcalc 192.168.40.0/24.' };
  const ip = m[1]!;
  const bits = m[2] === undefined ? 24 : Number(m[2]);
  if (bits < 8 || bits > 32) return { out: [`INVALID MASK: /${bits}`], facts: [], fail: 'Use a prefix between /8 and /32.' };
  const n = ipToInt(ip)!;
  const mask = maskOf(bits);
  const net = (n & mask) >>> 0;
  const bc = (net | (~mask >>> 0)) >>> 0;
  const lo = bits >= 31 ? net : net + 1;
  const hi = bits >= 31 ? bc : bc - 1;
  const first = n >>> 24;
  const cls = first < 128 ? 'A' : first < 192 ? 'B' : first < 224 ? 'C' : 'D';
  const priv = first === 10 || (first === 172 && ((n >>> 16) & 255) >= 16 && ((n >>> 16) & 255) <= 31) || (first === 192 && ((n >>> 16) & 255) === 168);
  const row = (k: string, v: string, b?: string) => (k.padEnd(11) + v.padEnd(21) + (b ?? '')).trimEnd();
  const out = [
    row('Address:', ip, binary(n, bits)),
    row('Netmask:', `${intToIp(mask)} = ${bits}`, binary(mask, bits)),
    row('Wildcard:', intToIp(~mask >>> 0), binary(~mask >>> 0, bits)),
    '=>',
    row('Network:', `${intToIp(net)}/${bits}`, binary(net, bits)),
    row('HostMin:', intToIp(lo), binary(lo, bits)),
    row('HostMax:', intToIp(hi), binary(hi, bits)),
    row('Broadcast:', intToIp(bc), binary(bc, bits)),
    row('Hosts/Net:', String(usableHosts(bits)), `Class ${cls}${priv ? ', Private Internet' : ''}`),
  ];
  return { out, facts: ['ipcalc', `ipcalc:${intToIp(net)}/${bits}`] };
}
