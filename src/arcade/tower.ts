// Hold the Line as a pure step function: two routes into the database across
// a 7 by 9 grid, waves of attacks generated from a seed, fixes on the tiles
// beside the routes. Time is passed in; nothing here touches the DOM.
//
// Units on a route keep SPACING tiles apart along it, which with a unit drawn
// UNIT_SIZE tiles wide means two units never overlap, corners included
// (SPACING >= 2 * UNIT_SIZE). The routes never come within two tiles of each
// other, and there are never more than MAX_UNITS on the board.

import { makeRng } from '../engine/rng';
import { ATTACKS, FIX_BY_ID, passWhy, stops, type AttackId, type FixId } from '../content/arcade/defence';

export const COLS = 7;
export const ROWS = 9;
export const DB = { c: 3, r: 8 } as const;
export const SPACING = 1.8;
export const UNIT_SIZE = 0.86;
export const MAX_UNITS = 8;
export const LEAK_PER_UNIT = 10;
export const START_BUDGET = 100;
export const STOP_POINTS = 40;
export const STOP_BUDGET = 5;
export const WAVE_BONUS = 100;
export const WAVE_BUDGET = 40;
export const FIRST_BUILD = 6000;
export const BUILD = 5000;
export const WAF_SLOW = 0.5;

export interface Tile {
  c: number;
  r: number;
}

const LEFT: Tile[] = [
  [0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 3], [0, 4], [1, 4], [2, 4], [2, 5], [2, 6], [2, 7], [2, 8], [3, 8],
].map(([c, r]) => ({ c: c!, r: r! }));
const RIGHT: Tile[] = LEFT.map((t) => ({ c: COLS - 1 - t.c, r: t.r }));
/** The two routes, each ending on the database tile. Route names are the shop pages they go through. */
export const ROUTES: { name: string; tiles: Tile[] }[] = [
  { name: 'Search box', tiles: LEFT },
  { name: 'Account page', tiles: RIGHT },
];

export const WAVE_TYPES: AttackId[][] = [
  ['sqli'],
  ['sqli', 'xss'],
  ['xss', 'idor', 'sqli'],
  ['cmdi', 'idor', 'sqli', 'xss'],
  ['ssrf', 'mass', 'cmdi', 'xss'],
  ['sqli', 'xss', 'idor', 'cmdi', 'ssrf', 'mass'],
];
export const WAVE_COUNTS = [6, 8, 10, 12, 14, 16];

export interface Unit {
  id: number;
  type: AttackId;
  route: number;
  /** Progress along the route, in tiles. */
  p: number;
  /** Fixes it has already walked past (for the message, once each). */
  passed: number[];
}

export interface Placed {
  id: number;
  fix: FixId;
  c: number;
  r: number;
  stopped: number;
  /** Attacks that walked past it, by type. */
  passedBy: Partial<Record<AttackId, number>>;
}

export interface TowerEvent {
  text: string;
  tone: 'good' | 'bad' | 'info';
  nonce: number;
  /** Where it happened, for a flash on the board. */
  at?: Tile;
}

export type TowerAction =
  | { t: 'select'; fix: FixId | null }
  | { t: 'cursor'; dc: number; dr: number }
  | { t: 'cursor-set'; c: number; r: number }
  | { t: 'place' }
  | { t: 'send' };

export interface TowerState {
  seed: number;
  pace: number;
  elapsed: number;
  phase: 'build' | 'wave';
  wave: number;
  buildLeft: number;
  budget: number;
  leak: number;
  score: number;
  stops: number;
  leaks: number;
  waveLeaks: number;
  units: Unit[];
  fixes: Placed[];
  /** What is left to send this wave, per route. */
  queue: AttackId[][];
  spawnIn: number[];
  nextId: number;
  waves: { route: number; type: AttackId }[][];
  selected: FixId | null;
  cursor: Tile;
  event: TowerEvent | null;
  over: boolean;
  won: boolean;
}

export const isRoute = (c: number, r: number) => ROUTES.some((rt) => rt.tiles.some((t) => t.c === c && t.r === r));
export const inGrid = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
export const covers = (f: Tile, t: Tile) => Math.max(Math.abs(f.c - t.c), Math.abs(f.r - t.r)) <= 1;

/** Can a fix go here: on the grid, beside a route, not on one, not taken. */
export function buildable(s: Pick<TowerState, 'fixes'>, c: number, r: number): boolean {
  if (!inGrid(c, r) || isRoute(c, r)) return false;
  if (s.fixes.some((f) => f.c === c && f.r === r)) return false;
  return ROUTES.some((rt) => rt.tiles.some((t) => covers({ c, r }, t)));
}

/** Tiles per second for a wave. */
export function waveSpeed(wave: number): number {
  return 1.6 + 0.12 * wave;
}

/** Where a unit is drawn, in tiles (centre of the tile it is crossing). */
export function unitXY(u: Pick<Unit, 'route' | 'p'>): { x: number; y: number } {
  const tiles = ROUTES[u.route]!.tiles;
  const i = Math.max(0, Math.min(tiles.length - 1, Math.floor(u.p)));
  const j = Math.min(tiles.length - 1, i + 1);
  const k = u.p - i;
  const a = tiles[i]!;
  const b = tiles[j]!;
  return { x: a.c + (b.c - a.c) * k, y: a.r + (b.r - a.r) * k };
}

const tileOf = (u: Unit): Tile => {
  const tiles = ROUTES[u.route]!.tiles;
  return tiles[Math.max(0, Math.min(tiles.length - 1, Math.floor(u.p + 0.5)))]!;
};

export function startTower(seed: number, pace = 1): TowerState {
  const rng = makeRng(seed);
  const waves = WAVE_TYPES.map((types, w) => {
    const count = WAVE_COUNTS[w]!;
    // Every type of the wave appears at least once, the rest at random, and both routes are used.
    const list: AttackId[] = rng.shuffle([...types, ...Array.from({ length: count - types.length }, () => rng.pick(types))]);
    return list.map((type, i) => ({ type, route: i < 2 ? i : rng.int(0, 1) }));
  });
  return {
    seed,
    pace,
    elapsed: 0,
    phase: 'build',
    wave: 0,
    buildLeft: FIRST_BUILD,
    budget: START_BUDGET,
    leak: 0,
    score: 0,
    stops: 0,
    leaks: 0,
    waveLeaks: 0,
    units: [],
    fixes: [],
    queue: [[], []],
    spawnIn: [0, 0],
    nextId: 1,
    waves,
    selected: 'params',
    cursor: { c: 3, r: 1 },
    event: null,
    over: false,
    won: false,
  };
}

/** The next wave's make-up, for the preview: how many of each attack. */
export function wavePreview(s: TowerState, wave = s.wave): { type: AttackId; count: number }[] {
  const w = s.waves[wave];
  if (!w) return [];
  return ATTACKS.map((a) => ({ type: a.id, count: w.filter((u) => u.type === a.id).length })).filter((x) => x.count > 0);
}

function say(s: TowerState, text: string, tone: TowerEvent['tone'], at?: Tile): TowerState {
  return { ...s, event: { text, tone, nonce: (s.event?.nonce ?? 0) + 1, at } };
}

function startWave(s: TowerState): TowerState {
  const w = s.waves[s.wave]!;
  return { ...s, phase: 'wave', buildLeft: 0, waveLeaks: 0, queue: [w.filter((u) => u.route === 0).map((u) => u.type), w.filter((u) => u.route === 1).map((u) => u.type)], spawnIn: [0, 400] };
}

export function stepTower(s0: TowerState, dtMs: number): TowerState {
  if (s0.over) return s0;
  const dt = Math.max(0, Math.min(100, dtMs));
  let s: TowerState = { ...s0, elapsed: s0.elapsed + dt };
  if (s.phase === 'build') {
    const left = s.buildLeft - dt;
    return left <= 0 ? startWave(s) : { ...s, buildLeft: left };
  }
  const speed = waveSpeed(s.wave) * s.pace;
  const spawnEvery = ((SPACING * 1.15) / speed) * 1000;

  // Move each route front to back; a unit never closes within SPACING of the one ahead.
  const moved: Unit[] = [];
  for (let route = 0; route < ROUTES.length; route++) {
    let limit = Infinity;
    for (const u of s.units.filter((x) => x.route === route).sort((a, b) => b.p - a.p)) {
      const here = tileOf(u);
      const slowed = s.fixes.some((f) => f.fix === 'waf' && covers(f, here));
      const p = Math.min(u.p + ((slowed ? WAF_SLOW : 1) * speed * dt) / 1000, limit);
      moved.push({ ...u, p: Math.max(u.p, p) });
      limit = Math.max(u.p, p) - SPACING;
    }
  }
  s = { ...s, units: moved };

  // Fixes act on the tile each unit is crossing.
  const survivors: Unit[] = [];
  let fixes = s.fixes;
  for (const u of s.units) {
    const here = tileOf(u);
    const near = fixes.filter((f) => covers(f, here));
    const stopper = near.find((f) => stops(f.fix, u.type));
    if (stopper) {
      fixes = fixes.map((f) => (f.id === stopper.id ? { ...f, stopped: f.stopped + 1 } : f));
      s = say({ ...s, score: s.score + STOP_POINTS, budget: s.budget + STOP_BUDGET, stops: s.stops + 1 }, `${FIX_BY_ID[stopper.fix].name} stopped ${ATTACKS.find((a) => a.id === u.type)!.short}.`, 'good', here);
      continue;
    }
    const fresh = near.filter((f) => !u.passed.includes(f.id) && f.fix !== 'waf');
    if (fresh.length) {
      const f = fresh[0]!;
      fixes = fixes.map((x) => (fresh.some((y) => y.id === x.id) ? { ...x, passedBy: { ...x.passedBy, [u.type]: (x.passedBy[u.type] ?? 0) + 1 } } : x));
      s = say(s, passWhy(f.fix, u.type), 'bad', { c: f.c, r: f.r });
      survivors.push({ ...u, passed: [...u.passed, ...fresh.map((x) => x.id)] });
      continue;
    }
    const last = ROUTES[u.route]!.tiles.length - 1;
    if (u.p >= last - 0.5) {
      const a = ATTACKS.find((x) => x.id === u.type)!;
      const leak = s.leak + LEAK_PER_UNIT;
      s = say({ ...s, leak, leaks: s.leaks + 1, waveLeaks: s.waveLeaks + 1 }, `${a.name} reached the database. ${a.why}`, 'bad', DB);
      if (leak >= 100) return { ...s, units: [], fixes, leak: 100, over: true, won: false };
      continue;
    }
    survivors.push(u);
  }
  s = { ...s, units: survivors, fixes };

  // Send the next attack on each route when its entrance is clear.
  const spawnIn = s.spawnIn.map((t) => t - dt);
  const queue = s.queue.map((q) => [...q]);
  const units = [...s.units];
  let nextId = s.nextId;
  for (let route = 0; route < ROUTES.length; route++) {
    if (spawnIn[route]! > 0 || !queue[route]!.length || units.length >= MAX_UNITS) continue;
    if (units.some((u) => u.route === route && u.p < SPACING)) continue;
    units.push({ id: nextId++, type: queue[route]!.shift()!, route, p: 0, passed: [] });
    spawnIn[route] = spawnEvery;
  }
  s = { ...s, units, queue, spawnIn, nextId };

  // The wave is over when everything was sent and nothing is left on the board.
  if (!s.units.length && s.queue.every((q) => !q.length)) {
    const clean = s.waveLeaks === 0;
    const wave = s.wave + 1;
    s = { ...s, score: s.score + (clean ? WAVE_BONUS : 0), budget: s.budget + WAVE_BUDGET, wave };
    if (wave >= s.waves.length) return say({ ...s, score: s.score + s.budget, over: true, won: true }, 'Every wave held.', 'good');
    s = say({ ...s, phase: 'build', buildLeft: BUILD }, clean ? `Wave ${wave} held with nothing leaked.` : `Wave ${wave} is over.`, clean ? 'good' : 'info');
  }
  return s;
}

export function actTower(s: TowerState, a: TowerAction): TowerState {
  if (s.over) return s;
  switch (a.t) {
    case 'select':
      return { ...s, selected: a.fix };
    case 'cursor':
      return { ...s, cursor: { c: Math.max(0, Math.min(COLS - 1, s.cursor.c + a.dc)), r: Math.max(0, Math.min(ROWS - 1, s.cursor.r + a.dr)) } };
    case 'cursor-set':
      return inGrid(a.c, a.r) ? { ...s, cursor: { c: a.c, r: a.r } } : s;
    case 'send':
      return s.phase === 'build' ? startWave(s) : s;
    case 'place': {
      const { c, r } = s.cursor;
      if (!s.selected) return say(s, 'Pick a fix first.', 'info');
      const fix = FIX_BY_ID[s.selected];
      if (isRoute(c, r)) return say(s, 'That tile is the route itself. Put fixes on the tiles beside it.', 'info', { c, r });
      if (s.fixes.some((f) => f.c === c && f.r === r)) return say(s, 'There is already a fix on that tile.', 'info', { c, r });
      if (!buildable(s, c, r)) return say(s, 'Too far from a route: a fix covers only the tiles next to it.', 'info', { c, r });
      if (s.budget < fix.cost) return say(s, `${fix.name} costs ${fix.cost}. You have ${s.budget}.`, 'info');
      const placed: Placed = { id: s.nextId, fix: fix.id, c, r, stopped: 0, passedBy: {} };
      return say({ ...s, budget: s.budget - fix.cost, fixes: [...s.fixes, placed], nextId: s.nextId + 1 }, fix.stops ? `${fix.name} placed. It stops ${ATTACKS.find((x) => x.id === fix.stops)!.short} on the route tiles around it.` : 'WAF placed. Attacks crossing it slow down, and all of them still get through.', 'info', { c, r });
    }
  }
}
