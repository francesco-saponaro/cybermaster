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
  { id: 'first-clear', name: 'On the roster', how: 'Clear your first level.' },
  { id: 'flawless', name: 'Flawless', how: 'Clear a level with three stars.' },
  { id: 'five-flawless', name: 'Steady hands', how: 'Clear five levels with three stars.' },
  { id: 'zone-wire', name: 'Wire reader', how: 'Clear every level in The Wire.' },
  { id: 'zone-arena', name: 'Arena veteran', how: 'Clear every level in The Arena.' },
  { id: 'zone-perimeter', name: 'Sweeper', how: 'Clear every level in The Perimeter.' },
  { id: 'zone-cloud', name: 'Cloud watcher', how: 'Clear every level in The Cloud.' },
  { id: 'zone-report', name: 'Report writer', how: 'Clear every level in The Report.' },
  { id: 'streak-3', name: 'Three days running', how: 'Play on three days in a row.' },
  { id: 'streak-7', name: 'A week on watch', how: 'Play on seven days in a row.' },
  { id: 'codex-half', name: 'Half the codex', how: 'Fill half of the codex.' },
  { id: 'codex-full', name: 'The whole codex', how: 'Fill every codex entry.' },
  { id: 'master', name: 'Master of the Watch', how: 'Reach the Master rank.' },
  { id: 'challenge-wire', name: 'Wire, unguided', how: 'Clear every challenge in The Wire.' },
  { id: 'challenge-arena', name: 'Arena, unguided', how: 'Clear every challenge in The Arena.' },
  { id: 'challenge-perimeter', name: 'Perimeter, unguided', how: 'Clear every challenge in The Perimeter.' },
  { id: 'challenge-cloud', name: 'Cloud, unguided', how: 'Clear every challenge in The Cloud.' },
  { id: 'challenge-report', name: 'Report, unguided', how: 'Clear every challenge in The Report.' },
  { id: 'clean-run', name: 'Clean hands', how: 'Clear a level with no mistakes, no hints and no Show me.' },
  { id: 'daily-3', name: 'Three cases running', how: "Solve today's case three days in a row." },
  { id: 'case-closed', name: 'Case closed', how: 'Close the Lantern & Co. case.' },
];

export interface ZoneShape {
  id: string;
  levelIds: string[];
}

const cleared = (save: SaveFile, id: string) => (save.levels[id]?.stars ?? 0) >= 1;

/** Which badges the save file has earned. Pure: the caller stores the result. */
export function earnedBadges(save: SaveFile, zones: ZoneShape[], codexTotal: number): string[] {
  const out = new Set<string>();
  const runs = Object.values(save.levels);
  if (runs.some((r) => r.stars >= 1)) out.add('first-clear');
  const flawless = runs.filter((r) => r.stars >= 3).length;
  if (flawless >= 1) out.add('flawless');
  if (flawless >= 5) out.add('five-flawless');
  for (const z of zones) if (z.levelIds.length && z.levelIds.every((id) => cleared(save, id))) out.add(`zone-${z.id}`);
  if (save.streak.count >= 3) out.add('streak-3');
  if (save.streak.count >= 7) out.add('streak-7');
  if (codexTotal > 0 && save.codex.length * 2 >= codexTotal) out.add('codex-half');
  if (codexTotal > 0 && save.codex.length >= codexTotal) out.add('codex-full');
  if (rankForLevel(levelFromXp(save.xp)) === 'Master') out.add('master');
  for (const z of zones) if (z.levelIds.length && z.levelIds.every((id) => (save.challenges[id]?.stars ?? 0) >= 1)) out.add(`challenge-${z.id}`);
  if (save.daily.streak.count >= 3) out.add('daily-3');
  if (save.story.closed) out.add('case-closed');
  if (save.badges.includes('clean-run')) out.add('clean-run');
  return [...out];
}

/** A zone opens when the previous zone's last level is cleared, or when an older save opened it. */
export function zoneUnlocked(save: SaveFile, zones: ZoneShape[], zoneId: string): boolean {
  const index = zones.findIndex((z) => z.id === zoneId);
  if (index <= 0) return index === 0;
  if (save.zones.includes(zoneId)) return true;
  const previous = zones[index - 1]!;
  const last = previous.levelIds[previous.levelIds.length - 1];
  return !!last && cleared(save, last);
}

/** Inside an open zone, levels open one after another. */
export function levelUnlocked(save: SaveFile, zones: ZoneShape[], levelId: string): boolean {
  const zone = zones.find((z) => z.levelIds.includes(levelId));
  if (!zone || !zoneUnlocked(save, zones, zone.id)) return false;
  const i = zone.levelIds.indexOf(levelId);
  return i === 0 || cleared(save, zone.levelIds[i - 1]!);
}

/** A level's challenge opens once its guided version is cleared. */
export function challengeUnlocked(save: SaveFile, levelId: string): boolean {
  return cleared(save, levelId);
}

/** The level to play next in a zone: the first one not cleared, or the last. */
export function nextLevelIn(save: SaveFile, zone: ZoneShape): string | undefined {
  return zone.levelIds.find((id) => !cleared(save, id)) ?? zone.levelIds[zone.levelIds.length - 1];
}

/** Update the streak for a play on `today` (YYYY-MM-DD). */
export function bumpStreak(streak: SaveFile['streak'], today: string): SaveFile['streak'] {
  if (streak.lastDay === today) return streak;
  const last = streak.lastDay ? new Date(streak.lastDay + 'T00:00:00Z').getTime() : 0;
  const now = new Date(today + 'T00:00:00Z').getTime();
  const dayGap = Math.round((now - last) / 86400000);
  return { count: dayGap === 1 ? streak.count + 1 : 1, lastDay: today };
}
