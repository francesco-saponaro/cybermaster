// The combo: correct actions in a row with no hint, Show me or mistake in
// between. The best combo of a run multiplies its XP, and a run with no
// mistakes and no help at all earns a clean-run bonus.

export interface Combo {
  current: number;
  best: number;
  /** Mistakes and helps in the run, so the result card can say whether it was clean. */
  mistakes: number;
  helps: number;
}

export type ComboEvent = 'correct' | 'mistake' | 'help';

export const COMBO_START: Combo = { current: 0, best: 0, mistakes: 0, helps: 0 };

export function comboStep(c: Combo, e: ComboEvent): Combo {
  switch (e) {
    case 'correct': {
      const current = c.current + 1;
      return { ...c, current, best: Math.max(c.best, current) };
    }
    case 'mistake':
      return { ...c, current: 0, mistakes: c.mistakes + 1 };
    case 'help':
      return { ...c, current: 0, helps: c.helps + 1 };
  }
}

/** Did this event end a combo of two or more (worth a sound)? */
export function comboBroke(before: Combo, e: ComboEvent): boolean {
  return e !== 'correct' && before.current >= 2;
}

/** x1 for a best combo of 0 or 1, then +0.1 per step, up to x1.5. */
export function comboMultiplier(best: number): number {
  if (best <= 1) return 1;
  return Math.min(1.5, Math.round((1 + (best - 1) * 0.1) * 10) / 10);
}

export const CLEAN_BONUS = 0.25;

export interface XpBreakdown {
  base: number;
  multiplier: number;
  comboXp: number;
  cleanXp: number;
  total: number;
}

/** The XP a clear is worth once the combo and a clean run are counted. */
export function xpWithBonuses(base: number, comboBest: number, clean: boolean): XpBreakdown {
  const multiplier = comboMultiplier(comboBest);
  const comboXp = Math.round(base * multiplier) - base;
  const cleanXp = clean ? Math.round(base * CLEAN_BONUS) : 0;
  return { base, multiplier, comboXp, cleanXp, total: base + comboXp + cleanXp };
}
