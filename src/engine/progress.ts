// Levels, ranks and badges, computed from the save file.

import type { SaveFile } from './save';

export const RANKS = [
  { name: 'Recruit', minLevel: 1 },
  { name: 'Analyst', minLevel: 4 },
  { name: 'Hunter', minLevel: 8 },
  { name: 'Master', minLevel: 13 },
] as const;

/** XP needed to reach a level: 0, 150, 400, 750, 1200 ... (quadratic, so levels keep their weight). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return 50 * n * (n + 2);
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp && level < 60) level += 1;
  return level;
}

export function levelProgress(xp: number): { level: number; into: number; span: number } {
  const level = levelFromXp(xp);
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, into: xp - from, span: to - from };
}

export function rankForLevel(level: number): string {
  let rank: string = RANKS[0].name;
  for (const r of RANKS) if (level >= r.minLevel) rank = r.name;
  return rank;
}

export interface Badge {
  id: string;
  name: string;
  how: string;
}

export const BADGES: Badge[] = [
  { id: 'first-clear', name: 'On the roster', how: 'Clear your first mission.' },
  { id: 'flawless', name: 'Flawless', how: 'Score 95 or more on any mission.' },
  { id: 'five-flawless', name: 'Steady hands', how: 'Score 95 or more on five missions.' },
  { id: 'zone-wire', name: 'Wire reader', how: 'Clear every mission in The Wire.' },
  { id: 'zone-arena', name: 'Arena veteran', how: 'Clear every mission in The Arena.' },
  { id: 'zone-perimeter', name: 'Sweeper', how: 'Clear every mission in The Perimeter.' },
  { id: 'zone-cloud', name: 'Cloud watcher', how: 'Clear every mission in The Cloud.' },
  { id: 'zone-report', name: 'Report writer', how: 'Clear every mission in The Report.' },
  { id: 'streak-3', name: 'Three days running', how: 'Play on three days in a row.' },
  { id: 'streak-7', name: 'A week on watch', how: 'Play on seven days in a row.' },
  { id: 'codex-half', name: 'Half the codex', how: 'Fill half of the codex.' },
  { id: 'codex-full', name: 'The whole codex', how: 'Fill every codex entry.' },
  { id: 'master', name: 'Master of the Watch', how: 'Reach the Master rank.' },
];

/** Which badges the save file has earned. Pure: the caller stores the result. */
export function earnedBadges(
  save: SaveFile,
  zones: { id: string; missionIds: string[]; bossId: string }[],
  codexTotal: number,
): string[] {
  const out = new Set<string>();
  const runs = Object.values(save.missions);
  const cleared = runs.filter((r) => r.best >= 50);
  if (cleared.length > 0) out.add('first-clear');
  const flawless = runs.filter((r) => r.best >= 95).length;
  if (flawless >= 1) out.add('flawless');
  if (flawless >= 5) out.add('five-flawless');
  for (const z of zones) {
    const all = [...z.missionIds, z.bossId];
    if (all.every((id) => (save.missions[id]?.best ?? 0) >= 50)) out.add(`zone-${z.id}`);
  }
  if (save.streak.count >= 3) out.add('streak-3');
  if (save.streak.count >= 7) out.add('streak-7');
  if (codexTotal > 0 && save.codex.length * 2 >= codexTotal) out.add('codex-half');
  if (codexTotal > 0 && save.codex.length >= codexTotal) out.add('codex-full');
  if (rankForLevel(levelFromXp(save.xp)) === 'Master') out.add('master');
  return [...out];
}

/** A zone unlocks when the previous zone's boss is cleared. The first is always open. */
export function zoneUnlocked(
  save: SaveFile,
  zones: { id: string; bossId: string }[],
  zoneId: string,
): boolean {
  const index = zones.findIndex((z) => z.id === zoneId);
  if (index <= 0) return true;
  const previous = zones[index - 1]!;
  return (save.missions[previous.bossId]?.best ?? 0) >= 50;
}

/** Inside a zone the missions open in order; the boss opens when every mission is cleared. */
export function missionUnlocked(
  save: SaveFile,
  zone: { missionIds: string[]; bossId: string },
  missionId: string,
): boolean {
  if (missionId === zone.bossId) return zone.missionIds.every((id) => (save.missions[id]?.best ?? 0) >= 50);
  const index = zone.missionIds.indexOf(missionId);
  if (index <= 0) return true;
  return (save.missions[zone.missionIds[index - 1]!]?.best ?? 0) >= 50;
}

/** Update the streak for a play on `today` (YYYY-MM-DD). */
export function bumpStreak(streak: SaveFile['streak'], today: string): SaveFile['streak'] {
  if (streak.lastDay === today) return streak;
  const last = streak.lastDay ? new Date(streak.lastDay + 'T00:00:00Z').getTime() : 0;
  const now = new Date(today + 'T00:00:00Z').getTime();
  const dayGap = Math.round((now - last) / 86400000);
  return { count: dayGap === 1 ? streak.count + 1 : 1, lastDay: today };
}
