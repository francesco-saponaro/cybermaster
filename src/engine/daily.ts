// Today's case: one challenge a day, picked from the date (UTC) so everyone
// with the same zones open gets the same puzzle, offline, with no server.

import { hashString } from './rng';
import { clock } from './scoring';

export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** The next UTC day, for "come back tomorrow". */
export function nextUtcDay(day: string): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return utcDay(d);
}

/** One level from the pool and a seed for its variant, both from the day alone. */
export function dailyPick(day: string, pool: string[]): { levelId: string; seed: number } | null {
  if (pool.length === 0) return null;
  const levelId = pool[hashString(`cybermaster:${day}:level`) % pool.length]!;
  return { levelId, seed: hashString(`cybermaster:${day}:seed`) };
}

export interface DailyShare {
  day: string;
  zone: string;
  stars: number;
  seconds: number;
  hints: number;
  streak: number;
}

/** The result to paste anywhere: the date, the zone, stars and time, no spoilers. */
export function shareText(r: DailyShare): string {
  const stars = '★'.repeat(r.stars) + '☆'.repeat(Math.max(0, 3 - r.stars));
  return [`CyberMaster daily ${r.day}`, r.zone, `${stars} ${clock(r.seconds)}`, `${r.hints === 0 ? 'No hints' : `${r.hints} hint${r.hints === 1 ? '' : 's'}`}, streak ${r.streak}`].join('\n');
}
