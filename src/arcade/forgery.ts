// Spot the Forgery as a pure reducer. Twelve rounds dealt from a seed: four
// easy pairs, four that need the rule, four subtle ones with a harmless
// difference. Each round shows a real request and a forged one side by side;
// the player picks the forged one before the round's clock runs out. Time is
// passed in from outside, and the clock stops while the answer is explained.

import { makeRng } from '../engine/rng';
import { FORGERY_PAIRS } from '../content/arcade/forgery';

export const ROUNDS = 12;
export const PER_TIER = 4;
export const LIVES = 3;
export const FIRST_ROUND_MS = 18_000;
export const LAST_ROUND_MS = 9_000;
export const RIGHT_POINTS = 100;
export const TIME_POINTS = 10;

export type Side = 'left' | 'right';

export interface Mistake {
  pair: string;
  kind: 'wrong' | 'slow';
}

export interface ForgeryState {
  seed: number;
  /** Pair ids, one per round. */
  rounds: string[];
  /** Which side the forged card is on, per round. */
  sides: Side[];
  round: number;
  /** ask: waiting for a pick. reveal: the answer is shown and the clock is stopped. */
  stage: 'ask' | 'reveal';
  timeLeft: number;
  lives: number;
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  /** The player's pick this round, or null if the clock ran out. */
  picked: Side | null;
  /** Points scored this round, for the reveal. */
  gained: number;
  mistakes: Mistake[];
  over: boolean;
  won: boolean;
}

export type ForgeryAction = { t: 'pick'; side: Side } | { t: 'next' };

/** How long a round lasts: 18 seconds at first, 9 by the last round. */
export function roundMs(round: number): number {
  const k = ROUNDS <= 1 ? 0 : Math.min(1, round / (ROUNDS - 1));
  return Math.round(FIRST_ROUND_MS - (FIRST_ROUND_MS - LAST_ROUND_MS) * k);
}

/** x1 for the first three right answers in a row, x2 for the next three, then x3. */
export function multiplier(streak: number): number {
  return Math.min(3, 1 + Math.floor(streak / 3));
}

/** Deals a run from a pool of pairs, four per tier. Fix First uses the same rules with its own pairs. */
export function startForgery(seed: number, pairs: readonly { id: string; tier: 1 | 2 | 3 }[] = FORGERY_PAIRS): ForgeryState {
  const rng = makeRng(seed);
  const rounds: string[] = [];
  for (const tier of [1, 2, 3] as const) {
    const pool = pairs.filter((p) => p.tier === tier).map((p) => p.id);
    const picked = rng.shuffle(pool).slice(0, PER_TIER);
    rounds.push(...picked);
  }
  const sides = rounds.map(() => (rng.chance(0.5) ? 'left' : 'right') as Side);
  return {
    seed,
    rounds,
    sides,
    round: 0,
    stage: 'ask',
    timeLeft: roundMs(0),
    lives: LIVES,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    picked: null,
    gained: 0,
    mistakes: [],
    over: false,
    won: false,
  };
}

function reveal(s: ForgeryState, picked: Side | null): ForgeryState {
  const forged = s.sides[s.round]!;
  const right = picked === forged;
  if (right) {
    const gained = RIGHT_POINTS * multiplier(s.streak) + Math.ceil(s.timeLeft / 1000) * TIME_POINTS;
    const streak = s.streak + 1;
    return { ...s, stage: 'reveal', picked, gained, score: s.score + gained, streak, bestStreak: Math.max(s.bestStreak, streak), correct: s.correct + 1 };
  }
  return {
    ...s,
    stage: 'reveal',
    picked,
    gained: 0,
    streak: 0,
    lives: s.lives - 1,
    mistakes: [...s.mistakes, { pair: s.rounds[s.round]!, kind: picked === null ? 'slow' : 'wrong' }],
  };
}

/** Time passing. Only counts while a round is asking. */
export function stepForgery(s: ForgeryState, dt: number): ForgeryState {
  if (s.over || s.stage !== 'ask') return s;
  const timeLeft = Math.max(0, s.timeLeft - dt);
  if (timeLeft > 0) return { ...s, timeLeft };
  return reveal({ ...s, timeLeft: 0 }, null);
}

export function actForgery(s: ForgeryState, a: ForgeryAction): ForgeryState {
  if (s.over) return s;
  if (a.t === 'pick') return s.stage === 'ask' ? reveal(s, a.side) : s;
  if (s.stage !== 'reveal') return s;
  if (s.lives <= 0) return { ...s, over: true, won: false };
  const round = s.round + 1;
  if (round >= ROUNDS) return { ...s, over: true, won: true };
  return { ...s, round, stage: 'ask', timeLeft: roundMs(round), picked: null, gained: 0 };
}

/** Whole seconds left in the round, for the display. */
export function secondsLeft(s: ForgeryState): number {
  return Math.ceil(s.timeLeft / 1000);
}
