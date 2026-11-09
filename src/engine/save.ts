// The save file: a Zod schema, a loader that migrates old versions, and
// storage behind try/catch so a blocked localStorage never breaks the game.

import { z } from 'zod';

export const SAVE_VERSION = 3;
export const SAVE_KEY = 'cybermaster.save';

const RunSchema = z.object({
  best: z.number().min(0).max(100),
  stars: z.number().int().min(0).max(3),
  clears: z.number().int().min(0),
  lastPlayedAt: z.string(),
});

export const SaveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  name: z.string().max(24),
  xp: z.number().int().min(0),
  missions: z.record(z.string(), RunSchema),
  codex: z.array(z.string()),
  badges: z.array(z.string()),
  streak: z.object({ count: z.number().int().min(0), lastDay: z.string() }),
  settings: z.object({ muted: z.boolean() }),
  prologueDone: z.boolean(),
  hints: z.number().int().min(0),
});

export type SaveFile = z.infer<typeof SaveSchema>;
export type MissionRun = z.infer<typeof RunSchema>;

export function emptySave(): SaveFile {
  return {
    version: SAVE_VERSION,
    name: '',
    xp: 0,
    missions: {},
    codex: [],
    badges: [],
    streak: { count: 0, lastDay: '' },
    settings: { muted: false },
    prologueDone: false,
    hints: 0,
  };
}

// Version 2 is version 3 without the prologue flag and the hint count.
const V2Schema = z.object({
  version: z.literal(2),
  name: z.string().max(24),
  xp: z.number().int().min(0),
  missions: z.record(z.string(), RunSchema),
  codex: z.array(z.string()),
  badges: z.array(z.string()),
  streak: z.object({ count: z.number().int().min(0), lastDay: z.string() }),
  settings: z.object({ muted: z.boolean() }),
});

// Version 1 stored a flat list of completed mission ids and a score map. It is
// kept here so an old save still opens.
const V1Schema = z.object({
  version: z.literal(1),
  name: z.string().optional(),
  xp: z.number().optional(),
  completed: z.array(z.string()).optional(),
  scores: z.record(z.string(), z.number()).optional(),
  muted: z.boolean().optional(),
});

/** Turn whatever was stored into a current save file, or a fresh one if it cannot be read. */
export function migrate(raw: unknown): SaveFile {
  const current = SaveSchema.safeParse(raw);
  if (current.success) return current.data;

  const v2 = V2Schema.safeParse(raw);
  if (v2.success) {
    const { version: _v, ...rest } = v2.data;
    void _v;
    // a player with any progress has already seen the game open, so the prologue stays behind them
    const started = rest.xp > 0 || Object.keys(rest.missions).length > 0;
    return { ...rest, version: SAVE_VERSION, prologueDone: started, hints: 0 };
  }

  const v1 = V1Schema.safeParse(raw);
  if (v1.success) {
    const fresh = emptySave();
    fresh.name = v1.data.name ?? '';
    fresh.xp = Math.max(0, Math.round(v1.data.xp ?? 0));
    fresh.settings.muted = v1.data.muted ?? false;
    for (const id of v1.data.completed ?? []) {
      const best = Math.max(50, Math.min(100, v1.data.scores?.[id] ?? 50));
      fresh.missions[id] = { best, stars: best >= 95 ? 3 : best >= 75 ? 2 : 1, clears: 1, lastPlayedAt: '' };
    }
    fresh.prologueDone = fresh.xp > 0 || Object.keys(fresh.missions).length > 0;
    return fresh;
  }
  return emptySave();
}

export function loadSave(storage: Pick<Storage, 'getItem'> | null = safeStorage()): SaveFile {
  try {
    const text = storage?.getItem(SAVE_KEY);
    if (!text) return emptySave();
    return migrate(JSON.parse(text));
  } catch {
    return emptySave();
  }
}

export function persistSave(save: SaveFile, storage: Pick<Storage, 'setItem'> | null = safeStorage()): boolean {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage: Pick<Storage, 'removeItem'> | null = safeStorage()): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // nothing to do: the save was never written
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
