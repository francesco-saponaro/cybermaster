// Lockdown as pure functions: who can reach what under a set of rules, whether
// a diagram is solved, a breadth-first solver for the fewest changes, and the
// run itself (a set of diagrams against one clock).

import { OPTIONS, PUZZLES, type OptionId, type Origin, type Puzzle } from '../content/arcade/lockdown';

export type Config = Record<string, OptionId>;

interface Traveler {
  at: string;
  origin: Origin;
  principal: string | null;
}

export interface Reach {
  /** Nodes each source reaches. */
  reached: Record<string, Set<string>>;
  /** For drawing: the edges each source used to reach each node, keyed by target. */
  paths: Record<string, Record<string, [string, string][]>>;
}

const option = (p: Puzzle, cfg: Config, ref: string | undefined): OptionId | undefined => {
  if (!ref) return undefined;
  if (ref in OPTIONS) return ref as OptionId;
  return cfg[ref] ?? p.slots.find((s) => s.id === ref)?.initial;
};

export function initialConfig(p: Puzzle): Config {
  return Object.fromEntries(p.slots.map((s) => [s.id, s.initial]));
}

function roleOf(p: Puzzle, cfg: Config, nodeId: string): string | null {
  const node = p.nodes.find((n) => n.id === nodeId);
  const o = option(p, cfg, node?.runsAs);
  return o ? OPTIONS[o].role ?? null : null;
}

/** Does a node's gate let this traveler in? */
export function admits(p: Puzzle, cfg: Config, nodeId: string, t: Pick<Traveler, 'origin' | 'principal'>): boolean {
  const node = p.nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  const o = option(p, cfg, node.gate);
  if (!o) return true;
  const opt = OPTIONS[o];
  if (opt.kind === 'fw') return (opt.origins ?? []).includes(t.origin);
  if (opt.kind === 'policy') {
    if (opt.roles === 'any') return true;
    const roles = opt.roles ?? [];
    if (!roles.length) return false;
    return !!t.principal && (t.principal === 'admin' || roles.includes(t.principal));
  }
  return true;
}

export function reach(p: Puzzle, cfg: Config): Reach {
  const reached: Reach['reached'] = {};
  const paths: Reach['paths'] = {};
  for (const src of p.sources) {
    const start: Traveler = src.startAt
      ? { at: src.startAt, origin: 'internal', principal: roleOf(p, cfg, src.startAt) }
      : { at: src.id, origin: src.origin, principal: src.principal ?? null };
    const key = (t: Traveler) => `${t.at}|${t.origin}|${t.principal ?? ''}`;
    const seen = new Map<string, { from: string | null; edge: [string, string] | null }>([[key(start), { from: null, edge: null }]]);
    const queue: Traveler[] = [start];
    const got = new Set<string>(src.startAt ? [src.startAt] : []);
    const via: Record<string, [string, string][]> = {};
    const trail = (k: string): [string, string][] => {
      const out: [string, string][] = [];
      let cur: string | null = k;
      while (cur) {
        const e = seen.get(cur);
        if (!e || !e.edge) break;
        out.unshift(e.edge);
        cur = e.from;
      }
      return out;
    };
    while (queue.length) {
      const t = queue.shift()!;
      for (const [from, to] of p.edges) {
        if (from !== t.at) continue;
        if (!admits(p, cfg, to, t)) continue;
        const node = p.nodes.find((n) => n.id === to)!;
        const next: Traveler = node.runsAs ? { at: to, origin: 'internal', principal: roleOf(p, cfg, to) } : { at: to, origin: 'internal', principal: t.principal };
        const k = key(next);
        if (seen.has(k)) continue;
        seen.set(k, { from: key(t), edge: [from, to] });
        if (!got.has(to)) {
          got.add(to);
          via[to] = trail(k);
        }
        // Only a shell lets you go on from a server; a web front just answers.
        if (!node.runsAs || node.shell) queue.push(next);
      }
    }
    reached[src.id] = got;
    paths[src.id] = via;
  }
  return { reached, paths };
}

export interface Verdict {
  solved: boolean;
  /** Attacker routes still open: source and the protected node it reaches. */
  breaches: { source: string; node: string }[];
  /** People cut off: source and the node it needs and cannot reach. */
  cut: { source: string; node: string }[];
}

export function judge(p: Puzzle, cfg: Config, r = reach(p, cfg)): Verdict {
  const crowns = p.nodes.filter((n) => n.crown).map((n) => n.id);
  const breaches = p.sources.filter((s) => s.kind === 'attacker').flatMap((s) => crowns.filter((c) => r.reached[s.id]!.has(c)).map((node) => ({ source: s.id, node })));
  const cut = p.sources.filter((s) => s.kind === 'user').flatMap((s) => (s.needs ?? []).filter((n) => !r.reached[s.id]!.has(n)).map((node) => ({ source: s.id, node })));
  return { solved: !breaches.length && !cut.length, breaches, cut };
}

const cfgKey = (p: Puzzle, c: Config) => p.slots.map((s) => c[s.id]).join(',');

/** The fewest rule changes that solve a diagram (one change sets one rule to a new value), or -1. */
export function solve(p: Puzzle): { moves: number; config: Config | null; explored: number } {
  const start = initialConfig(p);
  const seen = new Set([cfgKey(p, start)]);
  let frontier: Config[] = [start];
  let depth = 0;
  while (frontier.length) {
    for (const c of frontier) if (judge(p, c).solved) return { moves: depth, config: c, explored: seen.size };
    const next: Config[] = [];
    for (const c of frontier)
      for (const s of p.slots)
        for (const o of s.options) {
          if (c[s.id] === o) continue;
          const n = { ...c, [s.id]: o };
          const k = cfgKey(p, n);
          if (seen.has(k)) continue;
          seen.add(k);
          next.push(n);
        }
    frontier = next;
    depth += 1;
  }
  return { moves: -1, config: null, explored: seen.size };
}

// ---- The run --------------------------------------------------------------------

export const RUN_MS = 120_000;
export const SOLVE_POINTS = 100;
export const PAR_POINTS = 60;
export const NEAR_PAR_POINTS = 30;
export const SECOND_POINTS = 5;

export interface PuzzleResult {
  id: string;
  moves: number;
  par: number;
  solved: boolean;
  points: number;
}

export interface LockState {
  index: number;
  config: Config;
  moves: number;
  selected: string | null;
  elapsed: number;
  pace: number;
  score: number;
  results: PuzzleResult[];
  /** Shown briefly after a diagram is solved, before the next one. */
  cleared: { result: PuzzleResult; lesson: string; left: number } | null;
  event: { text: string; tone: 'good' | 'bad' | 'info'; nonce: number } | null;
  over: boolean;
  won: boolean;
}

export type LockAction = { t: 'select'; slot: string | null } | { t: 'set'; slot: string; option: OptionId } | { t: 'reset' } | { t: 'skip' };

export const CLEARED_MS = 1600;

export function startLockdown(pace = 1): LockState {
  return { index: 0, config: initialConfig(PUZZLES[0]!), moves: 0, selected: null, elapsed: 0, pace, score: 0, results: [], cleared: null, event: null, over: false, won: false };
}

export function puzzlePoints(moves: number, par: number): number {
  return SOLVE_POINTS + (moves <= par ? PAR_POINTS : moves <= par + 1 ? NEAR_PAR_POINTS : 0);
}

/** Stars for one diagram: three at par, two one change over, one otherwise. */
export function puzzleStars(r: PuzzleResult): 0 | 1 | 2 | 3 {
  if (!r.solved) return 0;
  return r.moves <= r.par ? 3 : r.moves <= r.par + 1 ? 2 : 1;
}

function advance(s: LockState): LockState {
  const index = s.index + 1;
  if (index >= PUZZLES.length) {
    const left = Math.max(0, Math.floor((RUN_MS / s.pace - s.elapsed) / 1000));
    return { ...s, cleared: null, over: true, won: true, score: s.score + left * SECOND_POINTS };
  }
  return { ...s, index, config: initialConfig(PUZZLES[index]!), moves: 0, selected: null, cleared: null };
}

export function stepLockdown(s: LockState, dtMs: number): LockState {
  if (s.over) return s;
  const dt = Math.max(0, Math.min(100, dtMs));
  const elapsed = s.elapsed + dt;
  if (s.cleared) {
    const left = s.cleared.left - dt;
    return left <= 0 ? advance({ ...s, elapsed }) : { ...s, elapsed, cleared: { ...s.cleared, left } };
  }
  if (elapsed >= RUN_MS / s.pace) return { ...s, elapsed: RUN_MS / s.pace, over: true, won: false };
  return { ...s, elapsed };
}

export function actLockdown(s: LockState, a: LockAction): LockState {
  if (s.over || s.cleared) return s;
  const p = PUZZLES[s.index]!;
  const nonce = (s.event?.nonce ?? 0) + 1;
  switch (a.t) {
    case 'select':
      return { ...s, selected: a.slot };
    case 'reset':
      return { ...s, config: initialConfig(p), moves: 0, event: { text: 'Every rule is back as it was.', tone: 'info', nonce } };
    case 'skip': {
      const result: PuzzleResult = { id: p.id, moves: s.moves, par: p.par, solved: false, points: 0 };
      return advance({ ...s, results: [...s.results, result], event: { text: `Skipped ${p.title}.`, tone: 'info', nonce } });
    }
    case 'set': {
      const slot = p.slots.find((x) => x.id === a.slot);
      if (!slot || !slot.options.includes(a.option)) return { ...s, event: { text: 'That setting does not fit that rule.', tone: 'info', nonce } };
      if (s.config[slot.id] === a.option) return { ...s, selected: null };
      const config = { ...s.config, [slot.id]: a.option };
      const moves = s.moves + 1;
      const v = judge(p, config);
      if (v.solved) {
        const points = puzzlePoints(moves, p.par);
        const result: PuzzleResult = { id: p.id, moves, par: p.par, solved: true, points };
        return { ...s, config, moves, selected: null, score: s.score + points, results: [...s.results, result], cleared: { result, lesson: p.lesson, left: CLEARED_MS }, event: { text: `Locked down in ${moves} change${moves === 1 ? '' : 's'} (par ${p.par}).`, tone: 'good', nonce } };
      }
      const name = (id: string) => p.sources.find((x) => x.id === id)?.label ?? p.nodes.find((x) => x.id === id)?.label ?? id;
      const text = v.cut.length
        ? `${name(v.cut[0]!.source)} can no longer reach ${name(v.cut[0]!.node)}.`
        : `${name(v.breaches[0]!.source)} can still reach ${name(v.breaches[0]!.node)}.`;
      return { ...s, config, moves, selected: null, event: { text, tone: v.cut.length ? 'bad' : 'info', nonce } };
    }
  }
}

export function lockSecondsLeft(s: LockState): number {
  return Math.max(0, Math.ceil((RUN_MS / s.pace - s.elapsed) / 1000));
}
