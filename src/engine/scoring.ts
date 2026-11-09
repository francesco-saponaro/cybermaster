// Stars and XP for a cleared level. Stars come from how the level was played:
// Show me uses, failed attempts and time against the level's par.

export interface RunStats {
  showMe: number;
  fails: number;
  seconds: number;
}

export function levelStars(run: RunStats, par: number): 1 | 2 | 3 {
  let s = 3;
  if (run.showMe >= 1) s -= 1;
  if (run.showMe >= 3) s -= 1;
  if (run.fails >= 4) s -= 1;
  if (run.seconds > par * 3) s -= 1;
  return Math.max(1, s) as 1 | 2 | 3;
}

/** Why the run lost stars, in a few words each, for the result card. */
export function starNotes(run: RunStats, par: number): string[] {
  const notes: string[] = [];
  if (run.showMe >= 1) notes.push(`Show me used ${run.showMe} time${run.showMe === 1 ? '' : 's'}`);
  if (run.fails >= 4) notes.push(`${run.fails} failed attempts`);
  if (run.seconds > par * 3) notes.push('slower than three times par');
  return notes;
}

/** XP for a clear: the level's XP scaled by stars, plus half again the first time. */
export function xpForClear(levelXp: number, stars: number, firstClear: boolean): number {
  const base = Math.round(levelXp * (0.5 + stars / 6));
  return firstClear ? base + Math.round(levelXp * 0.5) : base;
}

export function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m > 0 ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
}
