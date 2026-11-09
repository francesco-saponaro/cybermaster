// Pure scoring helpers shared by the missions. Every mission ends with a
// score from 0 to 100; stars, XP and grades come from that.

export interface MissionResult {
  score: number;
  seconds: number;
  notes: string[];
}

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function stars(score: number): 0 | 1 | 2 | 3 {
  if (score >= 95) return 3;
  if (score >= 75) return 2;
  if (score >= 50) return 1;
  return 0;
}

export function grade(score: number): string {
  if (score >= 95) return 'Flawless';
  if (score >= 75) return 'Solid';
  if (score >= 50) return 'Cleared';
  return 'Failed';
}

/** Hits against misses: each wrong click costs a share of a hit. */
export function accuracyScore(hits: number, total: number, misses: number, missCost = 0.5): number {
  if (total <= 0) return 0;
  return clampScore(((hits - misses * missCost) / total) * 100);
}

/** A time bonus of up to `max` points, linear from `fast` seconds down to `slow`. */
export function timeBonus(seconds: number, fast: number, slow: number, max = 10): number {
  if (seconds <= fast) return max;
  if (seconds >= slow) return 0;
  return Math.round(max * (1 - (seconds - fast) / (slow - fast)));
}

/** Combo multiplier used by the fast missions: grows with consecutive hits, capped at 4x. */
export function comboMultiplier(streak: number): number {
  return Math.min(4, 1 + Math.floor(streak / 3));
}

/** CVSS Forge: full marks for all eight metrics, partial marks by metric and closeness of score. */
export function cvssScore(matched: number, scoreGap: number): number {
  const byMetric = (matched / 8) * 80;
  const byScore = scoreGap <= 0.05 ? 20 : scoreGap <= 1 ? 10 : scoreGap <= 2 ? 5 : 0;
  return clampScore(byMetric + byScore);
}

/** XP earned for a run: the mission's XP scaled by the score, with a first-clear bonus. */
export function xpForRun(missionXp: number, score: number, firstClear: boolean): number {
  if (score < 50) return Math.round(missionXp * 0.1);
  const base = Math.round(missionXp * (score / 100));
  return firstClear ? base + Math.round(missionXp * 0.5) : base;
}

/** The report mission: good fragments fill the trust meter, wrong ones drain it. */
export function trustScore(qualities: ('good' | 'weak' | 'wrong')[]): number {
  if (qualities.length === 0) return 0;
  const points = qualities.reduce((n, q) => n + (q === 'good' ? 1 : q === 'weak' ? 0.4 : -0.3), 0);
  return clampScore((points / qualities.length) * 100);
}

/** What a hint costs, in XP. */
export const HINT_COST = 10;

/** Spend a hint: XP goes down by the cost, never below zero, and the hint count goes up. */
export function applyHint<T extends { xp: number; hints: number }>(save: T): T {
  return { ...save, xp: Math.max(0, save.xp - HINT_COST), hints: save.hints + 1 };
}

/** Live session: how good the freeze was. Exact message is 1, one message off is 0.5, otherwise 0. */
export function freezeScore(frozenAt: number | null, wrongAt: number): number {
  if (frozenAt === null) return 0;
  const gap = Math.abs(frozenAt - wrongAt);
  return gap === 0 ? 1 : gap === 1 ? 0.5 : 0;
}

/** One live round: half for freezing at the right moment, half for the right fix. */
export function liveRoundScore(freeze: number, fixCorrect: boolean): number {
  return clampScore(freeze * 50 + (fixCorrect ? 50 : 0));
}

/** Timed streams (Cookie Jar, the card sorts): accuracy is 90 of the score, speed the last 10. */
export function streamScore(correct: number, total: number, quick: number): number {
  if (total <= 0) return 0;
  return clampScore((correct / total) * 90 + (quick / total) * 10);
}
