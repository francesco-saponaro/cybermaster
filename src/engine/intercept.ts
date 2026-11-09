// Intercept: the pure part of the Zone 1 action mission. Packets stream through
// the proxy; the canvas component owns the drawing, this file owns the maths.

import { clampScore, comboMultiplier } from './scoring';

export interface InterceptTally {
  caught: number;
  falseCatches: number;
  missedBad: number;
  cleanPassed: number;
  combo: number;
  bestCombo: number;
  misses: number;
}

export function emptyTally(): InterceptTally {
  return { caught: 0, falseCatches: 0, missedBad: 0, cleanPassed: 0, combo: 0, bestCombo: 0, misses: 0 };
}

/** The player caught a packet. `bad` says whether it deserved catching. */
export function tallyCatch(t: InterceptTally, bad: boolean): InterceptTally {
  if (bad) {
    const combo = t.combo + 1;
    return { ...t, caught: t.caught + 1, combo, bestCombo: Math.max(t.bestCombo, combo) };
  }
  return { ...t, falseCatches: t.falseCatches + 1, combo: 0, misses: t.misses + 1 };
}

/** A packet left the screen uncaught. `bad` says whether it should have been caught. */
export function tallyPass(t: InterceptTally, bad: boolean): InterceptTally {
  if (bad) return { ...t, missedBad: t.missedBad + 1, combo: 0, misses: t.misses + 1 };
  return { ...t, cleanPassed: t.cleanPassed + 1 };
}

/** Points shown on screen for one catch: 100, scaled by the combo multiplier. */
export function catchPoints(combo: number): number {
  return 100 * comboMultiplier(combo);
}

/** Final 0..100 score: accuracy first (90), combo bonus last (10). A false catch costs half a hit. */
export function interceptScore({
  caught,
  totalBad,
  falseCatches,
  bestCombo,
}: {
  caught: number;
  totalBad: number;
  falseCatches: number;
  missedBad: number;
  bestCombo: number;
}): number {
  if (totalBad <= 0) return 0;
  const accuracy = Math.max(0, (caught - falseCatches * 0.5) / totalBad) * 90;
  const combo = Math.min(10, Math.max(0, bestCombo - 1) * 2.5);
  return clampScore(accuracy + combo);
}

/** Seconds a packet takes to cross the screen, ramping from pace.start to pace.end over the mission. */
export function packetSeconds(index: number, total: number, pace: { start: number; end: number }): number {
  if (total <= 1) return pace.start;
  const t = Math.max(0, Math.min(1, index / (total - 1)));
  return pace.start + (pace.end - pace.start) * t;
}

/** The miss meter: the run ends when misses reach the limit, unless the mission is the zone's tutorial. */
export function runIsOver(misses: number, limit: number, tutorial: boolean): boolean {
  if (tutorial) return false;
  return misses >= limit;
}
