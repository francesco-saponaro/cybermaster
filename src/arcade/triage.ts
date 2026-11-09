// Triage Rush as a pure reducer. A deck of findings from a seed, one card at a
// time in one slot, a timer per card that shortens through the run, and a
// streak for exact answers.

import { makeRng } from '../engine/rng';
import { FINDINGS, FINDING_BY_ID, SEVERITIES, type DriverId, type Severity } from '../content/arcade/findings';

export const DECK = 14;
export const FIRST_CARD_MS = 8000;
export const LAST_CARD_MS = 5000;
export const REVEAL_MS = 1100;
export const RIGHT_POINTS = 100;
export const NEAR_POINTS = 25;
export const DRIVER_POINTS = 50;

export interface Answer {
  id: string;
  picked: Severity | null;
  driver: DriverId | null;
  right: boolean;
  driverRight: boolean;
  points: number;
}

export type TriageAction = { t: 'driver'; id: DriverId } | { t: 'severity'; sev: Severity };

export interface TriageState {
  seed: number;
  pace: number;
  deck: string[];
  /** The three facts offered on each card, in the order shown. */
  drivers: DriverId[][];
  index: number;
  cardLeft: number;
  phase: 'ask' | 'reveal';
  revealLeft: number;
  driver: DriverId | null;
  score: number;
  streak: number;
  bestStreak: number;
  answers: Answer[];
  elapsed: number;
  over: boolean;
}

export function cardTime(i: number): number {
  return Math.round(FIRST_CARD_MS - ((FIRST_CARD_MS - LAST_CARD_MS) * Math.min(i, DECK - 1)) / (DECK - 1));
}

/** The streak multiplier: x1, then half again for every three exact answers in a row, up to x3. */
export function streakMultiplier(streak: number): number {
  return Math.min(3, 1 + 0.5 * Math.floor(streak / 3));
}

export function startTriage(seed: number, pace = 1): TriageState {
  const rng = makeRng(seed);
  const deck = rng.sample(FINDINGS.map((f) => f.id), DECK);
  const drivers = deck.map((id) => {
    const f = FINDING_BY_ID[id]!;
    return rng.shuffle([f.driver, ...f.decoys]);
  });
  return { seed, pace, deck, drivers, index: 0, cardLeft: cardTime(0) / pace, phase: 'ask', revealLeft: 0, driver: null, score: 0, streak: 0, bestStreak: 0, answers: [], elapsed: 0, over: false };
}

export const current = (s: TriageState) => FINDING_BY_ID[s.deck[s.index]!]!;

function resolve(s: TriageState, picked: Severity | null): TriageState {
  const f = current(s);
  const right = picked === f.severity;
  const near = !right && picked !== null && Math.abs(SEVERITIES.indexOf(picked) - SEVERITIES.indexOf(f.severity)) === 1;
  const driverRight = s.driver === f.driver;
  const mult = streakMultiplier(s.streak);
  const points = (right ? Math.round(RIGHT_POINTS * mult) : near ? NEAR_POINTS : 0) + (driverRight && picked !== null ? DRIVER_POINTS : 0);
  const streak = right ? s.streak + 1 : 0;
  return {
    ...s,
    phase: 'reveal',
    revealLeft: REVEAL_MS,
    score: s.score + points,
    streak,
    bestStreak: Math.max(s.bestStreak, streak),
    answers: [...s.answers, { id: f.id, picked, driver: s.driver, right, driverRight, points }],
  };
}

export function stepTriage(s: TriageState, dtMs: number): TriageState {
  if (s.over) return s;
  const dt = Math.max(0, Math.min(100, dtMs));
  const elapsed = s.elapsed + dt;
  if (s.phase === 'reveal') {
    const left = s.revealLeft - dt;
    if (left > 0) return { ...s, elapsed, revealLeft: left };
    const index = s.index + 1;
    if (index >= s.deck.length) return { ...s, elapsed, revealLeft: 0, over: true };
    return { ...s, elapsed, index, phase: 'ask', revealLeft: 0, driver: null, cardLeft: cardTime(index) / s.pace };
  }
  const cardLeft = s.cardLeft - dt;
  if (cardLeft <= 0) return resolve({ ...s, elapsed, cardLeft: 0 }, null);
  return { ...s, elapsed, cardLeft };
}

export function actTriage(s: TriageState, a: TriageAction): TriageState {
  if (s.over || s.phase !== 'ask') return s;
  if (a.t === 'driver') return s.drivers[s.index]!.includes(a.id) ? { ...s, driver: s.driver === a.id ? null : a.id } : s;
  return resolve(s, a.sev);
}

/** How many cards are done, for the HUD. */
export function cardsDone(s: TriageState): number {
  return s.answers.length;
}
