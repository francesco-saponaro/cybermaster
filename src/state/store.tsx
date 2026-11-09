import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { emptySave, loadSave, persistSave, clearSave, type SaveFile } from '../engine/save';
import { levelStars, xpForClear, type RunStats } from '../engine/scoring';
import { BADGES, bumpStreak, earnedBadges, levelFromXp } from '../engine/progress';
import { ZONES } from '../content/zones';
import { CODEX } from '../content/codex';
import { LEVEL_BY_ID } from '../content/index';
import { setMuted as setAudioMuted, play } from '../engine/audio';

export interface LevelOutcome {
  levelId: string;
  stars: 1 | 2 | 3;
  xpGained: number;
  firstClear: boolean;
  leveledUp: boolean;
  newBadges: string[];
  unlockedCodex: string[];
  newEvidence: string[];
}

interface Store {
  save: SaveFile;
  rename: (name: string) => void;
  toggleMute: () => void;
  completeLevel: (levelId: string, run: RunStats, today?: string) => LevelOutcome;
  reset: () => void;
}

const StoreContext = createContext<Store | null>(null);

const zoneShapes = ZONES.map((z) => ({ id: z.id, levelIds: z.levelIds }));
const CODEX_TOTAL = CODEX.length;
const MIGRATION = { codexIds: CODEX.map((c) => c.id), badgeIds: BADGES.map((b) => b.id) };

/** Pure: the next save after clearing a level, and what changed. */
export function applyClear(save: SaveFile, levelId: string, run: RunStats, today: string, now: string): { save: SaveFile; outcome: LevelOutcome } {
  const level = LEVEL_BY_ID[levelId];
  const stars = levelStars(run, level?.par ?? 120);
  const prior = save.levels[levelId];
  const firstClear = !prior || prior.stars < 1;
  const xpGained = level ? xpForClear(level.xp, stars, firstClear) : 0;
  const nextXp = save.xp + xpGained;
  const unlockedCodex = (level?.codex ?? []).filter((c) => !save.codex.includes(c));
  const newEvidence = (level?.evidence ?? []).filter((e) => !save.evidence.includes(e));
  const next: SaveFile = {
    ...save,
    xp: nextXp,
    levels: {
      ...save.levels,
      [levelId]: {
        stars: Math.max(prior?.stars ?? 0, stars),
        clears: (prior?.clears ?? 0) + 1,
        bestSeconds: prior && prior.bestSeconds > 0 ? Math.min(prior.bestSeconds, run.seconds) : run.seconds,
        lastPlayedAt: now,
      },
    },
    codex: [...save.codex, ...unlockedCodex],
    evidence: [...save.evidence, ...newEvidence],
    streak: bumpStreak(save.streak, today),
  };
  const priorBadges = new Set(save.badges);
  const badges = earnedBadges(next, zoneShapes, CODEX_TOTAL);
  next.badges = [...new Set([...save.badges, ...badges])];
  return {
    save: next,
    outcome: {
      levelId,
      stars,
      xpGained,
      firstClear,
      leveledUp: levelFromXp(nextXp) > levelFromXp(save.xp),
      newBadges: badges.filter((b) => !priorBadges.has(b)),
      unlockedCodex,
      newEvidence,
    },
  };
}

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: SaveFile }) {
  const [save, setSave] = useState<SaveFile>(() => initial ?? loadSave(undefined, MIGRATION));

  const write = useCallback((next: SaveFile) => {
    setSave(next);
    persistSave(next);
  }, []);

  const rename = useCallback((name: string) => write({ ...save, name: name.slice(0, 24) }), [save, write]);

  const toggleMute = useCallback(() => {
    const muted = !save.settings.muted;
    setAudioMuted(muted);
    write({ ...save, settings: { ...save.settings, muted } });
  }, [save, write]);

  const completeLevel = useCallback(
    (levelId: string, run: RunStats, today = new Date().toISOString().slice(0, 10)): LevelOutcome => {
      const { save: next, outcome } = applyClear(save, levelId, run, today, new Date().toISOString());
      write(next);
      play(outcome.unlockedCodex.length || outcome.newBadges.length ? 'unlock' : 'clear');
      if (outcome.leveledUp) play('levelup');
      return outcome;
    },
    [save, write],
  );

  const reset = useCallback(() => {
    clearSave();
    const fresh = emptySave();
    fresh.settings.muted = save.settings.muted;
    write(fresh);
  }, [save.settings.muted, write]);

  const value = useMemo(() => ({ save, rename, toggleMute, completeLevel, reset }), [save, rename, toggleMute, completeLevel, reset]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside a StoreProvider');
  return ctx;
}

export { zoneShapes };
