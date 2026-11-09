// Network Sweeper as a pure reducer. A 6 by 6 grid of addresses on Harbor's
// network, generated from a seed: some live, a few vulnerable, one or two that
// a scanner wrongly guesses are vulnerable, and a band outside the signed
// scope. The attacker's progress runs on time passed in from outside.

import { makeRng } from '../engine/rng';

export const COLS = 6;
export const ROWS = 6;
export const ATTACK_MS = 95_000;
export const USES = { ping: 5, ports: 8, version: 5, lookup: 4 } as const;
export type Tool = keyof typeof USES;
export const OUT_OF_SCOPE_PUSH = 8;
export const WRONG_FLAG_PUSH = 10;
export const FLAG_POINTS = 600;
export const WRONG_FLAG_POINTS = 150;
export const OUT_OF_SCOPE_POINTS = 100;
export const TIME_POINTS = 10;
export const TOOL_POINTS = 25;

export interface Service {
  port: number;
  name: string;
  product: string;
  vuln: string;
  cve: string;
  patched: string;
}

/** Real products, versions and CVEs. */
export const SERVICES: Service[] = [
  { port: 80, name: 'http', product: 'Apache httpd', vuln: '2.4.49', cve: 'CVE-2021-41773', patched: '2.4.58' },
  { port: 21, name: 'ftp', product: 'vsftpd', vuln: '2.3.4', cve: 'CVE-2011-2523', patched: '3.0.5' },
  { port: 22, name: 'ssh', product: 'OpenSSH', vuln: '7.2p2', cve: 'CVE-2016-6210', patched: '9.6p1' },
  { port: 445, name: 'smb', product: 'Samba', vuln: '4.5.9', cve: 'CVE-2017-7494', patched: '4.19.5' },
  { port: 8009, name: 'ajp', product: 'Apache Tomcat', vuln: '9.0.30', cve: 'CVE-2020-1938', patched: '9.0.85' },
  { port: 443, name: 'https', product: 'OpenSSL', vuln: '1.0.1f', cve: 'CVE-2014-0160', patched: '3.0.13' },
];

export interface Port {
  svc: number;
  /** The scanner's fingerprint guess says the vulnerable version. */
  guessVuln: boolean;
  /** The live banner says the vulnerable version. */
  bannerVuln: boolean;
}

export interface Host {
  i: number;
  c: number;
  r: number;
  ip: string;
  inScope: boolean;
  live: boolean;
  ports: Port[];
}

export interface Known {
  /** Probed at least once, so `live` is known. */
  seen: boolean;
  live: boolean;
  ports: boolean;
  version: boolean;
  lookup: boolean;
  flag: 'right' | 'wrong' | null;
}

export type SweepAction = { t: 'select'; i: number } | { t: 'move'; dc: number; dr: number } | { t: 'tool'; tool: Tool } | { t: 'flag' };

export interface SweepEvent {
  text: string;
  tone: 'good' | 'bad' | 'info';
  nonce: number;
}

export interface SweepState {
  seed: number;
  pace: number;
  /** Which side of the grid is outside the scope. */
  outside: 'right' | 'bottom';
  hosts: Host[];
  known: Known[];
  uses: Record<Tool, number>;
  selected: number;
  attack: number;
  elapsed: number;
  score: number;
  flags: number;
  wrongFlags: number;
  outOfScope: number;
  event: SweepEvent | null;
  over: boolean;
  won: boolean;
}

export const vulnerable = (h: Host) => h.live && h.ports.some((p) => p.bannerVuln);
export const looksVulnerable = (h: Host) => h.live && h.ports.some((p) => p.guessVuln);
export const targets = (s: Pick<SweepState, 'hosts'>) => s.hosts.filter((h) => h.inScope && vulnerable(h));
const idx = (c: number, r: number) => r * COLS + c;

export function inScopeAt(outside: SweepState['outside'], c: number, r: number): boolean {
  return outside === 'right' ? c < 4 : r < 4;
}

export function startSweeper(seed: number, pace = 1): SweepState {
  const rng = makeRng(seed);
  const outside: SweepState['outside'] = rng.chance(0.5) ? 'right' : 'bottom';
  const octets = rng.sample(Array.from({ length: 240 }, (_, k) => k + 10), COLS * ROWS);
  const hosts: Host[] = Array.from({ length: COLS * ROWS }, (_, i) => {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    return { i, c, r, ip: `10.0.4.${octets[i]}`, inScope: inScopeAt(outside, c, r), live: false, ports: [] };
  });
  const inside = rng.shuffle(hosts.filter((h) => h.inScope));
  const outsideHosts = rng.shuffle(hosts.filter((h) => !h.inScope));
  const nVuln = rng.int(1, 2);
  const nFalse = rng.int(1, 2);
  const nLive = rng.int(7, 8);
  const live = inside.slice(0, nLive);
  const portsFor = (kind: 'vuln' | 'false' | 'fine'): Port[] => {
    const svcs = rng.sample(SERVICES.map((_, k) => k), rng.int(1, 2));
    return svcs.map((svc, k) => ({ svc, guessVuln: kind !== 'fine' && k === 0, bannerVuln: kind === 'vuln' && k === 0 }));
  };
  live.forEach((h, k) => {
    h.live = true;
    h.ports = portsFor(k < nVuln ? 'vuln' : k < nVuln + nFalse ? 'false' : 'fine');
  });
  // Outside the scope: a few live machines, one of them tempting.
  outsideHosts.slice(0, 3).forEach((h, k) => {
    h.live = true;
    h.ports = portsFor(k === 0 ? 'vuln' : 'fine');
  });
  const firstInside = hosts.find((h) => h.inScope)!.i;
  return {
    seed,
    pace,
    outside,
    hosts,
    known: hosts.map(() => ({ seen: false, live: false, ports: false, version: false, lookup: false, flag: null })),
    uses: { ...USES },
    selected: firstInside,
    attack: 0,
    elapsed: 0,
    score: 0,
    flags: 0,
    wrongFlags: 0,
    outOfScope: 0,
    event: null,
    over: false,
    won: false,
  };
}

function say(s: SweepState, text: string, tone: SweepEvent['tone']): SweepState {
  return { ...s, event: { text, tone, nonce: (s.event?.nonce ?? 0) + 1 } };
}

function lose(s: SweepState): SweepState {
  const target = targets(s).find((h) => s.known[h.i]!.flag !== 'right') ?? targets(s)[0];
  return say({ ...s, attack: 100, over: true, won: false }, `The attacker reached ${target ? target.ip : 'the network'} first.`, 'bad');
}

/** Using a tool outside the scope: allowed, but the attacker gains on you and Ines notices. */
function strayed(s: SweepState): SweepState {
  const attack = s.attack + OUT_OF_SCOPE_PUSH;
  const next = { ...s, attack, outOfScope: s.outOfScope + 1, score: s.score - OUT_OF_SCOPE_POINTS };
  return attack >= 100 ? lose(next) : next;
}

export function stepSweeper(s: SweepState, dtMs: number): SweepState {
  if (s.over) return s;
  const dt = Math.max(0, Math.min(100, dtMs));
  const attack = s.attack + (100 * dt * s.pace) / ATTACK_MS;
  const next = { ...s, elapsed: s.elapsed + dt, attack };
  return attack >= 100 ? lose(next) : next;
}

/** The 3 by 3 block a ping sweep covers, centred on a host and clipped to the grid. */
export function block(c: number, r: number): number[] {
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (c + dc >= 0 && c + dc < COLS && r + dr >= 0 && r + dr < ROWS) out.push(idx(c + dc, r + dr));
  return out;
}

const setKnown = (s: SweepState, i: number, k: Partial<Known>): Known[] => s.known.map((x, j) => (j === i ? { ...x, ...k } : x));

function finishIfDone(s: SweepState): SweepState {
  const all = targets(s).every((h) => s.known[h.i]!.flag === 'right');
  if (!all) return s;
  const toolsLeft = Object.values(s.uses).reduce((a, b) => a + b, 0);
  const bonus = Math.round((100 - s.attack) * TIME_POINTS) + toolsLeft * TOOL_POINTS;
  return say({ ...s, score: Math.max(0, s.score + bonus), over: true, won: true }, 'Every vulnerable host in scope is flagged. The attacker has nothing left to use.', 'good');
}

export function actSweeper(s0: SweepState, a: SweepAction): SweepState {
  if (s0.over) return s0;
  let s = s0;
  if (a.t === 'select') return a.i >= 0 && a.i < s.hosts.length ? { ...s, selected: a.i } : s;
  if (a.t === 'move') {
    const h = s.hosts[s.selected]!;
    const c = Math.max(0, Math.min(COLS - 1, h.c + a.dc));
    const r = Math.max(0, Math.min(ROWS - 1, h.r + a.dr));
    return { ...s, selected: idx(c, r) };
  }
  const h = s.hosts[s.selected]!;
  const k = s.known[h.i]!;
  if (a.t === 'flag') {
    if (k.flag) return say(s, `${h.ip} is already flagged.`, 'info');
    if (!h.inScope) return say(strayed(s), `${h.ip} is outside the signed scope. It is not ours to report.`, 'bad');
    if (vulnerable(h)) {
      const share = Math.round(FLAG_POINTS / targets(s).length);
      s = say({ ...s, known: setKnown(s, h.i, { flag: 'right', seen: true, live: true }), flags: s.flags + 1, score: s.score + share }, `Flagged ${h.ip}: confirmed vulnerable.`, 'good');
      return finishIfDone(s);
    }
    const fooled = looksVulnerable(h) && !k.version;
    const port = h.ports.find((p) => p.guessVuln);
    const svc = port ? SERVICES[port.svc]! : null;
    const why = fooled && svc ? `The scanner only guessed ${svc.product} ${svc.vuln}. The banner says ${svc.patched}, which is patched.` : h.live ? `Nothing on ${h.ip} matches a known CVE.` : `Nothing answers at ${h.ip}.`;
    const attack = s.attack + WRONG_FLAG_PUSH;
    s = say({ ...s, known: setKnown(s, h.i, { flag: 'wrong' }), wrongFlags: s.wrongFlags + 1, score: s.score - WRONG_FLAG_POINTS, attack }, `False positive. ${why}`, 'bad');
    return attack >= 100 ? lose(s) : s;
  }
  const tool = a.tool;
  if (s.uses[tool] <= 0) return say(s, `No ${toolName(tool)} left.`, 'info');
  if (tool === 'ping') {
    const cells = block(h.c, h.r);
    const out = cells.some((i) => !s.hosts[i]!.inScope);
    const up = cells.filter((i) => s.hosts[i]!.live).length;
    const pinged = new Set(cells);
    s = { ...s, known: s.known.map((x, j) => (pinged.has(j) ? { ...x, seen: true, live: s.hosts[j]!.live } : x)), uses: { ...s.uses, ping: s.uses.ping - 1 } };
    if (out) return say(strayed(s), `Ping sweep: ${up} live. Part of that block is outside the scope, and the attacker gained on you.`, 'bad');
    return say(s, `Ping sweep around ${h.ip}: ${up} of ${cells.length} addresses answered.`, 'info');
  }
  if (tool === 'ports') {
    if (k.ports) return say(s, `Ports on ${h.ip} are already known.`, 'info');
    s = { ...s, known: setKnown(s, h.i, { ports: true, seen: true, live: h.live }), uses: { ...s.uses, ports: s.uses.ports - 1 } };
    const text = h.live ? `${h.ip}: ${h.ports.map((p) => `${SERVICES[p.svc]!.port}/${SERVICES[p.svc]!.name}`).join(', ')} open.` : `${h.ip}: nothing answers.`;
    return h.inScope ? say(s, text, 'info') : say(strayed(s), `${text} That host is outside the scope.`, 'bad');
  }
  if (tool === 'version') {
    if (!k.ports || !h.live) return say(s, 'Scan its ports first, so you know what to ask for a version.', 'info');
    if (k.version) return say(s, `The banner on ${h.ip} is already in.`, 'info');
    s = { ...s, known: setKnown(s, h.i, { version: true }), uses: { ...s.uses, version: s.uses.version - 1 } };
    const text = `${h.ip} banner: ${h.ports.map((p) => bannerOf(p)).join(', ')}.`;
    return h.inScope ? say(s, text, 'info') : say(strayed(s), `${text} That host is outside the scope.`, 'bad');
  }
  // lookup
  if (!k.version) return say(s, 'Check the real version first. The database needs the banner, not the scanner guess.', 'info');
  if (k.lookup) return say(s, `${h.ip} was already looked up.`, 'info');
  s = { ...s, known: setKnown(s, h.i, { lookup: true }), uses: { ...s.uses, lookup: s.uses.lookup - 1 } };
  const hit = h.ports.find((p) => p.bannerVuln);
  const text = hit ? `${SERVICES[hit.svc]!.product} ${SERVICES[hit.svc]!.vuln} matches ${SERVICES[hit.svc]!.cve}. Flag it.` : `No known CVE for ${h.ports.map((p) => bannerOf(p)).join(', ')}.`;
  return h.inScope ? say(s, text, hit ? 'good' : 'info') : say(strayed(s), `${text} But that host is outside the scope.`, 'bad');
}

export function toolName(t: Tool): string {
  return t === 'ping' ? 'ping sweeps' : t === 'ports' ? 'port scans' : t === 'version' ? 'version checks' : 'lookups';
}

export function guessOf(p: Port): string {
  const svc = SERVICES[p.svc]!;
  return `${svc.product} ${p.guessVuln ? svc.vuln : svc.patched}`;
}

export function bannerOf(p: Port): string {
  const svc = SERVICES[p.svc]!;
  return `${svc.product} ${p.bannerVuln ? svc.vuln : svc.patched}`;
}

export function attackSecondsLeft(s: SweepState): number {
  return Math.max(0, Math.ceil(((100 - s.attack) / 100) * (ATTACK_MS / s.pace) / 1000));
}
