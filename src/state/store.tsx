import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { emptySave, loadSave, persistSave, clearSave, type SaveFile } from '../engine/save';
import { xpForRun, stars as starsFor } from '../engine/scoring';
import { bumpStreak, earnedBadges, levelFromXp } from '../engine/progress';
import { ZONES } from '../content/zones';
import { CODEX } from '../content/codex';
import { MISSION_BY_ID } from '../content/index';
import { setMuted as setAudioMuted, play } from '../engine/audio';

export interface MissionOutcome {
  missionId: string;
  score: number;
  xpGained: number;
  firstClear: boolean;
  leveledUp: boolean;
  newBadges: string[];
  unlockedCodex: string[];
}

interface Store {
  save: SaveFile;
  rename: (name: string) => void;
  toggleMute: () => void;
  completeMission: (missionId: string, score: number, today?: string) => MissionOutcome;
  reset: () => void;
}

const StoreContext = createContext<Store | null>(null);

const zoneShapes = ZONES.map((z) => ({ id: z.id, missionIds: z.missionIds, bossId: z.bossId }));
const CODEX_TOTAL = CODEX.length;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [save, setSave] = useState<SaveFile>(() => loadSave());

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

  const completeMission = useCallback(
    (missionId: string, score: number, today = new Date().toISOString().slice(0, 10)): MissionOutcome => {
      const mission = MISSION_BY_ID[missionId];
      const prior = save.missions[missionId];
      const firstClear = score >= 50 && (prior?.best ?? 0) < 50;
      const xpGained = mission ? xpForRun(mission.xp, score, firstClear) : 0;

      const beforeLevel = levelFromXp(save.xp);
      const nextXp = save.xp + xpGained;
      const afterLevel = levelFromXp(nextXp);

      const best = Math.max(prior?.best ?? 0, score);
      const run = {
        best,
        stars: starsFor(best),
        clears: (prior?.clears ?? 0) + (score >= 50 ? 1 : 0),
        lastPlayedAt: new Date().toISOString(),
      };

      const unlockedCodex = score >= 50 && mission ? mission.codex.filter((c) => !save.codex.includes(c)) : [];
      const codex = [...save.codex, ...unlockedCodex];

      const nextSave: SaveFile = {
        ...save,
        xp: nextXp,
        missions: { ...save.missions, [missionId]: run },
        codex,
        streak: score >= 50 ? bumpStreak(save.streak, today) : save.streak,
      };
      const priorBadges = new Set(save.badges);
      const badgeList = earnedBadges(nextSave, zoneShapes, CODEX_TOTAL);
      const newBadges = badgeList.filter((b) => !priorBadges.has(b));
      nextSave.badges = badgeList;

      write(nextSave);

      if (score >= 50) play(unlockedCodex.length || newBadges.length ? 'unlock' : 'clear');
      if (afterLevel > beforeLevel) play('levelup');

      return { missionId, score, xpGained, firstClear, leveledUp: afterLevel > beforeLevel, newBadges, unlockedCodex };
    },
    [save, write],
  );

  const reset = useCallback(() => {
    clearSave();
    const fresh = emptySave();
    fresh.settings.muted = save.settings.muted;
    write(fresh);
  }, [save.settings.muted, write]);

  const value = useMemo(
    () => ({ save, rename, toggleMute, completeMission, reset }),
    [save, rename, toggleMute, completeMission, reset],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside a StoreProvider');
  return ctx;
}
