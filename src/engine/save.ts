// The save file: a Zod schema, a loader that migrates old versions, and
// storage behind try/catch so a blocked localStorage never breaks the game.

import { z } from 'zod';

export const SAVE_VERSION = 6;
export const SAVE_KEY = 'cybermaster.save';

const RunSchema = z.object({
  stars: z.number().int().min(0).max(3),
  clears: z.number().int().min(0),
  bestSeconds: z.number().min(0),
  lastPlayedAt: z.string(),
});

const ChallengeRunSchema = z.object({
  stars: z.number().int().min(0).max(3),
  clears: z.number().int().min(0),
  bestSeconds: z.number().min(0),
  bestPoints: z.number().int().min(0),
  lastPlayedAt: z.string(),
});

const DayResultSchema = z.object({
  levelId: z.string(),
  stars: z.number().int().min(1).max(3),
  seconds: z.number().min(0),
  hints: z.number().int().min(0),
  points: z.number().int().min(0),
});

const StreakSchema = z.object({ count: z.number().int().min(0), lastDay: z.string() });

const ArcadeRunSchema = z.object({
  best: z.number().int().min(0),
  stars: z.number().int().min(0).max(3),
  plays: z.number().int().min(0),
  lastPlayedAt: z.string(),
});

/** Version 4: hands-on levels, no challenges, no story. */
const V4Fields = {
  name: z.string().max(24),
  xp: z.number().int().min(0),
  levels: z.record(z.string(), RunSchema),
  codex: z.array(z.string()),
  badges: z.array(z.string()),
  streak: StreakSchema,
  settings: z.object({ muted: z.boolean() }),
  evidence: z.array(z.string()),
  zones: z.array(z.string()),
};
const V4Schema = z.object({ version: z.literal(4), ...V4Fields });

const V5Fields = {
  name: z.string().max(24),
  xp: z.number().int().min(0),
  levels: z.record(z.string(), RunSchema),
  codex: z.array(z.string()),
  badges: z.array(z.string()),
  streak: z.object({ count: z.number().int().min(0), lastDay: z.string() }),
  settings: z.object({ muted: z.boolean() }),
  /** Evidence collected by clearing levels, for the Report zone. */
  evidence: z.array(z.string()),
  /** Zones opened by progress made in an older version of the game. */
  zones: z.array(z.string()),
  /** Best result of each level's challenge (unguided) version. */
  challenges: z.record(z.string(), ChallengeRunSchema),
  /** Today's case: a streak of days played, and the best result of each day. */
  daily: z.object({ streak: StreakSchema, days: z.record(z.string(), DayResultSchema) }),
  /** Story beats seen (one per zone), and whether the case is closed. */
  story: z.object({ beats: z.array(z.string()), closed: z.boolean() }),
  /** Live incidents won and lost, per boss level. */
  incidents: z.record(z.string(), z.object({ won: z.number().int().min(0), lost: z.number().int().min(0) })),
  bestCombo: z.number().int().min(0),
};
/** Version 5: challenges, today's case, the story and the incidents, no arcade. */
const V5Schema = z.object({ version: z.literal(5), ...V5Fields });

export const SaveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  ...V5Fields,
  /** Best run of each arcade game. */
  arcade: z.record(z.string(), ArcadeRunSchema),
});

export type SaveFile = z.infer<typeof SaveSchema>;
export type LevelRun = z.infer<typeof RunSchema>;
export type ChallengeRunRecord = z.infer<typeof ChallengeRunSchema>;
export type DayResult = z.infer<typeof DayResultSchema>;
export type ArcadeRun = z.infer<typeof ArcadeRunSchema>;

export function emptySave(): SaveFile {
  return {
    version: SAVE_VERSION,
    name: '',
    xp: 0,
    levels: {},
    codex: [],
    badges: [],
    streak: { count: 0, lastDay: '' },
    settings: { muted: false },
    evidence: [],
    zones: [],
    challenges: {},
    daily: { streak: { count: 0, lastDay: '' }, days: {} },
    story: { beats: [], closed: false },
    incidents: {},
    bestCombo: 0,
    arcade: {},
  };
}

/** Version 5 to 6: everything kept, the arcade starts empty. */
function fromV5(v5: z.infer<typeof V5Schema>): SaveFile {
  const { version: _v, ...rest } = v5;
  void _v;
  return { ...rest, version: SAVE_VERSION, arcade: {} };
}

/** Version 4 to 6: everything kept, the new parts start empty. */
function fromV4(v4: z.infer<typeof V4Schema>): SaveFile {
  const { version: _v, ...rest } = v4;
  void _v;
  const fresh = emptySave();
  return { ...fresh, ...rest, version: SAVE_VERSION };
}

// Versions 2 and 3 kept a score per mission. The missions are gone (every zone
// is now a set of hands-on levels), so a cleared boss becomes an opened zone.
const OldRun = z.object({ best: z.number() }).passthrough();
const V23Schema = z.object({
  version: z.union([z.literal(2), z.literal(3)]),
  name: z.string().max(24),
  xp: z.number().int().min(0),
  missions: z.record(z.string(), OldRun),
  codex: z.array(z.string()),
  badges: z.array(z.string()),
  streak: z.object({ count: z.number().int().min(0), lastDay: z.string() }),
  settings: z.object({ muted: z.boolean() }),
});

// Version 1 stored a flat list of completed mission ids.
const V1Schema = z.object({
  version: z.literal(1),
  name: z.string().optional(),
  xp: z.number().optional(),
  completed: z.array(z.string()).optional(),
  scores: z.record(z.string(), z.number()).optional(),
  muted: z.boolean().optional(),
});

/** The old boss of each zone, and the zone its clear opened. */
const OLD_BOSS_OPENS: [string, string][] = [
  ['wire-boss', 'arena'],
  ['arena-boss', 'perimeter'],
  ['perimeter-boss', 'cloud'],
  ['cloud-boss', 'report'],
];

export interface MigrationContext {
  codexIds: string[];
  badgeIds: string[];
}

function zonesFromCleared(cleared: (id: string) => boolean): string[] {
  return OLD_BOSS_OPENS.filter(([boss]) => cleared(boss)).map(([, zone]) => zone);
}

/** Turn whatever was stored into a current save file, or a fresh one if it cannot be read. */
export function migrate(raw: unknown, ctx?: MigrationContext): SaveFile {
  const current = SaveSchema.safeParse(raw);
  if (current.success) return current.data;
  const v5 = V5Schema.safeParse(raw);
  if (v5.success) return fromV5(v5.data);
  const v4 = V4Schema.safeParse(raw);
  if (v4.success) return fromV4(v4.data);
  const keepCodex = (ids: string[]) => (ctx ? ids.filter((c) => ctx.codexIds.includes(c)) : ids);
  const keepBadges = (ids: string[]) => (ctx ? ids.filter((b) => ctx.badgeIds.includes(b)) : ids);

  const old = V23Schema.safeParse(raw);
  if (old.success) {
    const o = old.data;
    return {
      ...emptySave(),
      name: o.name,
      xp: o.xp,
      codex: keepCodex(o.codex),
      badges: keepBadges(o.badges),
      streak: o.streak,
      settings: o.settings,
      zones: zonesFromCleared((id) => (o.missions[id]?.best ?? 0) >= 50),
    };
  }

  const v1 = V1Schema.safeParse(raw);
  if (v1.success) {
    const fresh = emptySave();
    fresh.name = (v1.data.name ?? '').slice(0, 24);
    fresh.xp = Math.max(0, Math.round(v1.data.xp ?? 0));
    fresh.settings.muted = v1.data.muted ?? false;
    const done = new Set(v1.data.completed ?? []);
    fresh.zones = zonesFromCleared((id) => done.has(id));
    return fresh;
  }
  return emptySave();
}

export function loadSave(storage: Pick<Storage, 'getItem'> | null = safeStorage(), ctx?: MigrationContext): SaveFile {
  try {
    const text = storage?.getItem(SAVE_KEY);
    if (!text) return emptySave();
    return migrate(JSON.parse(text), ctx);
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
