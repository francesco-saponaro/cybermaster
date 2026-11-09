// Packet Runner as a pure step function. Time is passed in (milliseconds), the
// order of requests comes from a seed, and nothing here touches the DOM.
//
// Each lane is a conveyor measured in slots: a request enters at 0 and waits
// in the gate at GATE. A request can never be closer than SPACING to the one
// ahead of it in its lane, so two cards never overlap, and there are never
// more than MAX_LIVE on the board.

import { makeRng } from '../engine/rng';
import { PACKETS, type PacketTemplate } from '../content/arcade/packets';

export const LANES = 3;
export const GATE = 2;
/** A request counts as "in the gate" from here on. */
export const GATE_ZONE = GATE - 0.35;
export const SPACING = 1;
export const MAX_LIVE = 5;
export const PER_LANE = 2;
export const DURATION = 90_000;
export const LIVES = 3;
export const FREEZE = 1000;
const SEQUENCE = 400;

export interface Live {
  id: number;
  template: string;
  lane: number;
  pos: number;
  /** Time spent waiting in the gate, ms. */
  waited: number;
}

export interface Mistake {
  template: string;
  why: string;
  kind: 'allowed' | 'blocked' | 'slipped';
}

export type PacketAction = { t: 'lane'; d: -1 | 1 } | { t: 'lane-set'; lane: number } | { t: 'verdict'; allow: boolean };

export interface PacketState {
  seed: number;
  /** Speed factor: 1 normally, lower with reduced motion. */
  pace: number;
  elapsed: number;
  lives: number;
  score: number;
  combo: number;
  bestCombo: number;
  lane: number;
  live: Live[];
  nextId: number;
  /** Index into the sequence of the next request to spawn. */
  cursor: number;
  order: string[];
  lanes: number[];
  spawnIn: number;
  freeze: number;
  /** The last call, for the flash and the line under the board. */
  last: { lane: number; ok: boolean; text: string; nonce: number } | null;
  correct: number;
  decided: number;
  mistakes: Mistake[];
  /** A customer who waited too long and left: costs the combo, not a life. */
  dropped: number;
  over: boolean;
  won: boolean;
}

/** How hard it is at a moment in the run: slots per second, ms between requests, ms a request waits in the gate. */
export function difficulty(elapsed: number): { speed: number; spawnEvery: number; patience: number } {
  const k = Math.max(0, Math.min(1, elapsed / DURATION));
  return {
    speed: 0.42 + 0.5 * k,
    spawnEvery: Math.round(1700 - 650 * k),
    patience: Math.round(4500 - 1500 * k),
  };
}

/** The multiplier from the combo: x1, then one more every five right calls, up to x4. */
export function multiplier(combo: number): number {
  return Math.min(4, 1 + Math.floor(combo / 5));
}

export function startPackets(seed: number, pace = 1): PacketState {
  const rng = makeRng(seed);
  const good = PACKETS.filter((p) => !p.bad);
  const bad = PACKETS.filter((p) => p.bad);
  const order: string[] = [];
  const lanes: number[] = [];
  let prev = '';
  for (let i = 0; i < SEQUENCE; i++) {
    // A little under half are bad, and the same request never comes twice in a row.
    let t: PacketTemplate;
    do t = rng.chance(0.45) ? rng.pick(bad) : rng.pick(good);
    while (t.id === prev);
    prev = t.id;
    order.push(t.id);
    lanes.push(rng.int(0, LANES - 1));
  }
  return {
    seed,
    pace,
    elapsed: 0,
    lives: LIVES,
    score: 0,
    combo: 0,
    bestCombo: 0,
    lane: 1,
    live: [],
    nextId: 1,
    cursor: 0,
    order,
    lanes,
    spawnIn: 400,
    freeze: 0,
    last: null,
    correct: 0,
    decided: 0,
    mistakes: [],
    dropped: 0,
    over: false,
    won: false,
  };
}

const templateOf = (id: string) => PACKETS.find((p) => p.id === id)!;

/** The request waiting in a lane's gate, if any. */
export function inGate(s: PacketState, lane: number): Live | undefined {
  return s.live.find((p) => p.lane === lane && p.pos >= GATE_ZONE);
}

function laneFree(s: PacketState, lane: number): boolean {
  const inLane = s.live.filter((p) => p.lane === lane);
  if (inLane.length >= PER_LANE) return false;
  return inLane.every((p) => p.pos >= SPACING);
}

function mistake(s: PacketState, p: Live, kind: Mistake['kind'], text: string): PacketState {
  const lives = s.lives - 1;
  return {
    ...s,
    lives,
    combo: 0,
    freeze: FREEZE,
    live: s.live.filter((x) => x.id !== p.id),
    mistakes: [...s.mistakes, { template: p.template, why: templateOf(p.template).why, kind }],
    last: { lane: p.lane, ok: false, text, nonce: (s.last?.nonce ?? 0) + 1 },
    decided: s.decided + (kind === 'slipped' ? 0 : 1),
    over: lives <= 0,
    won: false,
  };
}

export function stepPackets(s: PacketState, dtMs: number): PacketState {
  if (s.over) return s;
  const dt = Math.max(0, Math.min(100, dtMs));
  // A wrong call freezes the board for a second so the reason can be read.
  if (s.freeze > 0) return { ...s, freeze: Math.max(0, s.freeze - dt) };
  const elapsed = s.elapsed + dt;
  if (elapsed >= DURATION) return { ...s, elapsed: DURATION, over: true, won: true };
  const d = difficulty(elapsed);
  const move = (d.speed * s.pace * dt) / 1000;
  // Move each lane front to back, so a request stops a fixed gap behind the one ahead.
  const moved: Live[] = [];
  for (let lane = 0; lane < LANES; lane++) {
    const inLane = s.live.filter((p) => p.lane === lane).sort((a, b) => b.pos - a.pos);
    let limit = GATE;
    for (const p of inLane) {
      const pos = Math.min(p.pos + move, limit);
      const waited = pos >= GATE ? p.waited + dt : p.waited;
      moved.push({ ...p, pos, waited });
      limit = pos - SPACING;
    }
  }
  let next: PacketState = { ...s, elapsed, live: moved, spawnIn: s.spawnIn - dt };
  // A request that waited too long decides itself: a bad one gets in, a good one gives up.
  const patience = d.patience / s.pace;
  const late = next.live.find((p) => p.waited >= patience);
  if (late) {
    const t = templateOf(late.template);
    if (t.bad) return mistake(next, late, 'slipped', `It got through while you waited. ${t.why}`);
    next = {
      ...next,
      combo: 0,
      dropped: next.dropped + 1,
      live: next.live.filter((x) => x.id !== late.id),
      last: { lane: late.lane, ok: false, text: 'A customer waited too long and gave up.', nonce: (next.last?.nonce ?? 0) + 1 },
    };
  }
  if (next.spawnIn <= 0 && next.live.length < MAX_LIVE) {
    const want = next.lanes[next.cursor % next.lanes.length]!;
    const lane = [0, 1, 2].map((k) => (want + k) % LANES).find((l) => laneFree(next, l));
    if (lane !== undefined) {
      next = {
        ...next,
        live: [...next.live, { id: next.nextId, template: next.order[next.cursor % next.order.length]!, lane, pos: 0, waited: 0 }],
        nextId: next.nextId + 1,
        cursor: next.cursor + 1,
        spawnIn: d.spawnEvery / s.pace,
      };
    }
  }
  return next;
}

export function actPackets(s: PacketState, a: PacketAction): PacketState {
  if (s.over) return s;
  if (a.t === 'lane') return { ...s, lane: Math.max(0, Math.min(LANES - 1, s.lane + a.d)) };
  if (a.t === 'lane-set') return { ...s, lane: Math.max(0, Math.min(LANES - 1, a.lane)) };
  if (s.freeze > 0) return s;
  const p = inGate(s, s.lane);
  if (!p) return s;
  const t = templateOf(p.template);
  const right = a.allow !== t.bad;
  if (!right) return mistake(s, p, a.allow ? 'allowed' : 'blocked', a.allow ? `That one should have been stopped. ${t.why}` : `That one was fine. ${t.why}`);
  const combo = s.combo + 1;
  return {
    ...s,
    combo,
    bestCombo: Math.max(s.bestCombo, combo),
    score: s.score + 100 * multiplier(s.combo),
    correct: s.correct + 1,
    decided: s.decided + 1,
    live: s.live.filter((x) => x.id !== p.id),
    last: { lane: p.lane, ok: true, text: a.allow ? 'Allowed.' : 'Blocked.', nonce: (s.last?.nonce ?? 0) + 1 },
  };
}

/** Seconds left in the run. */
export function packetSecondsLeft(s: PacketState): number {
  return Math.max(0, Math.ceil((DURATION - s.elapsed) / 1000));
}
