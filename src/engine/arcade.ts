// The arcade's stars, XP and unlocks, and the save after a run. Pure.
//
// XP comes only from new stars, so replaying a game never outpaces the levels:
// a game is worth at most ARCADE_XP[3] in its lifetime.

import type { SaveFile } from './save';
import { bumpStreak, levelFromXp, type ZoneShape } from './progress';

/** Total XP a game has paid out at each star count. */
export const ARCADE_XP = [0, 30, 60, 100] as const;

export function arcadeStars(score: number, thresholds: readonly [number, number, number]): 0 | 1 | 2 | 3 {
  if (score >= thresholds[2]) return 3;
  if (score >= thresholds[1]) return 2;
  if (score >= thresholds[0]) return 1;
  return 0;
}

/** XP for reaching `stars` when the best so far was `prior`: only the difference, never negative. */
export function arcadeXp(prior: number, stars: number): number {
  const p = ARCADE_XP[Math.max(0, Math.min(3, prior))]!;
  const n = ARCADE_XP[Math.max(0, Math.min(3, stars))]!;
  return Math.max(0, n - p);
}

/** A zone's game opens once its boss (the zone's last level) is cleared, or a later zone was opened by an old save. */
export function arcadeUnlocked(save: SaveFile, zones: ZoneShape[], zoneId: string): boolean {
  const i = zones.findIndex((z) => z.id === zoneId);
  const zone = zones[i];
  if (!zone) return false;
  const boss = zone.levelIds[zone.levelIds.length - 1];
  if (boss && (save.levels[boss]?.stars ?? 0) >= 1) return true;
  const after = zones[i + 1];
  return !!after && save.zones.includes(after.id);
}

export interface ArcadeOutcome {
  gameId: string;
  score: number;
  stars: 0 | 1 | 2 | 3;
  /** The best score before this run (0 when never played). */
  priorBest: number;
  best: boolean;
  xpGained: number;
  leveledUp: boolean;
}

export function applyArcade(save: SaveFile, gameId: string, score: number, thresholds: readonly [number, number, number], today: string, now: string): { save: SaveFile; outcome: ArcadeOutcome } {
  const s = Math.max(0, Math.round(score));
  const stars = arcadeStars(s, thresholds);
  const prior = save.arcade[gameId];
  const priorBest = prior?.best ?? 0;
  const xpGained = arcadeXp(prior?.stars ?? 0, stars);
  const next: SaveFile = {
    ...save,
    xp: save.xp + xpGained,
    streak: bumpStreak(save.streak, today),
    arcade: {
      ...save.arcade,
      [gameId]: {
        best: Math.max(priorBest, s),
        stars: Math.max(prior?.stars ?? 0, stars),
        plays: (prior?.plays ?? 0) + 1,
        lastPlayedAt: now,
      },
    },
  };
  return {
    save: next,
    outcome: { gameId, score: s, stars, priorBest, best: !prior || s > priorBest, xpGained, leveledUp: levelFromXp(next.xp) > levelFromXp(save.xp) },
  };
}
