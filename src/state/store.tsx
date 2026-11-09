import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { emptySave, loadSave, persistSave, clearSave, type SaveFile, type DayResult } from '../engine/save';
import { levelStars, xpForClear, challengeStars, challengePoints, type RunStats } from '../engine/scoring';
import { xpWithBonuses, type XpBreakdown } from '../engine/combo';
import { BADGES, bumpStreak, earnedBadges, levelFromXp } from '../engine/progress';
import { ZONES } from '../content/zones';
import { CODEX } from '../content/codex';
import { LEVEL_BY_ID } from '../content/index';
import { setMuted as setAudioMuted, play } from '../engine/audio';

/** How a run went beyond the basics: its best combo and whether it was clean. */
export interface RunExtras {
  comboBest?: number;
  clean?: boolean;
}

export interface LevelOutcome {
  levelId: string;
  stars: 1 | 2 | 3;
  xpGained: number;
  firstClear: boolean;
  leveledUp: boolean;
  newBadges: string[];
  unlockedCodex: string[];
  newEvidence: string[];
  breakdown?: XpBreakdown;
}

export interface ChallengeRunStats {
  hints: number;
  seconds: number;
  par: number;
  comboBest: number;
  clean: boolean;
}

export interface ChallengeOutcome {
  levelId: string;
  stars: 1 | 2 | 3;
  points: number;
  xpGained: number;
  breakdown: XpBreakdown;
  firstClear: boolean;
  /** A better result than this level's (or today's) best so far. */
  best: boolean;
  leveledUp: boolean;
  newBadges: string[];
  daily?: { day: string; streak: number; first: boolean; result: DayResult };
}

interface Store {
  save: SaveFile;
  rename: (name: string) => void;
  toggleMute: () => void;
  completeLevel: (levelId: string, run: RunStats & RunExtras, today?: string) => LevelOutcome;
  completeChallenge: (levelId: string, run: ChallengeRunStats, daily?: string) => ChallengeOutcome;
  recordIncident: (levelId: string, won: boolean) => void;
  markBeat: (zoneId: string) => void;
  closeCase: () => void;
  reset: () => void;
}

const StoreContext = createContext<Store | null>(null);

const zoneShapes = ZONES.map((z) => ({ id: z.id, levelIds: z.levelIds }));
const CODEX_TOTAL = CODEX.length;
const MIGRATION = { codexIds: CODEX.map((c) => c.id), badgeIds: BADGES.map((b) => b.id) };

function withBadges(prev: SaveFile, next: SaveFile, extra: string[] = []): { save: SaveFile; newBadges: string[] } {
  const prior = new Set(prev.badges);
  const badges = [...new Set([...earnedBadges(next, zoneShapes, CODEX_TOTAL), ...extra])];
  return { save: { ...next, badges: [...new Set([...prev.badges, ...badges])] }, newBadges: badges.filter((b) => !prior.has(b)) };
}

/** Pure: the next save after clearing a level, and what changed. */
export function applyClear(save: SaveFile, levelId: string, run: RunStats & RunExtras, today: string, now: string): { save: SaveFile; outcome: LevelOutcome } {
  const level = LEVEL_BY_ID[levelId];
  const stars = levelStars(run, level?.par ?? 120);
  const prior = save.levels[levelId];
  const firstClear = !prior || prior.stars < 1;
  const base = level ? xpForClear(level.xp, stars, firstClear) : 0;
  const breakdown = run.comboBest !== undefined ? xpWithBonuses(base, run.comboBest, !!run.clean) : undefined;
  const xpGained = breakdown ? breakdown.total : base;
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
    bestCombo: Math.max(save.bestCombo, run.comboBest ?? 0),
  };
  const { save: done, newBadges } = withBadges(save, next, run.clean ? ['clean-run'] : []);
  return {
    save: done,
    outcome: { levelId, stars, xpGained, firstClear, leveledUp: levelFromXp(nextXp) > levelFromXp(save.xp), newBadges, unlockedCodex, newEvidence, breakdown },
  };
}

/** Pure: the next save after clearing a challenge, or today's case when `daily` is the day. */
export function applyChallenge(save: SaveFile, levelId: string, run: ChallengeRunStats, today: string, now: string, daily?: string): { save: SaveFile; outcome: ChallengeOutcome } {
  const level = LEVEL_BY_ID[levelId];
  const stars = challengeStars(run);
  const points = challengePoints(run);
  const levelXp = level?.xp ?? 100;
  const prior = save.challenges[levelId];
  const firstClear = !daily && (!prior || prior.stars < 1);
  let base = Math.round(levelXp * (0.4 + 0.2 * stars)) + (firstClear ? Math.round(levelXp * 0.25) : 0);
  let next: SaveFile = { ...save, streak: bumpStreak(save.streak, today), bestCombo: Math.max(save.bestCombo, run.comboBest) };
  let best: boolean;
  let dailyOut: ChallengeOutcome['daily'];
  if (daily) {
    const result: DayResult = { levelId, stars, seconds: run.seconds, hints: run.hints, points };
    const had = save.daily.days[daily];
    const first = !had;
    best = !had || stars > had.stars || (stars === had.stars && run.seconds < had.seconds);
    // The first solve of the day earns the bonus; replays only improve the best.
    if (first) base += Math.round(levelXp * 0.5);
    else base = Math.round(base / 2);
    const streak = first ? bumpStreak(save.daily.streak, daily) : save.daily.streak;
    next = { ...next, daily: { streak, days: { ...save.daily.days, [daily]: best ? result : had! } } };
    dailyOut = { day: daily, streak: streak.count, first, result: best ? result : had! };
  } else {
    best = !prior || stars > prior.stars || points > prior.bestPoints;
    next = {
      ...next,
      challenges: {
        ...save.challenges,
        [levelId]: {
          stars: Math.max(prior?.stars ?? 0, stars),
          clears: (prior?.clears ?? 0) + 1,
          bestSeconds: prior && prior.bestSeconds > 0 ? Math.min(prior.bestSeconds, run.seconds) : run.seconds,
          bestPoints: Math.max(prior?.bestPoints ?? 0, points),
          lastPlayedAt: now,
        },
      },
    };
  }
  const breakdown = xpWithBonuses(base, run.comboBest, run.clean);
  next = { ...next, xp: save.xp + breakdown.total };
  const { save: done, newBadges } = withBadges(save, next, run.clean ? ['clean-run'] : []);
  return {
    save: done,
    outcome: { levelId, stars, points, xpGained: breakdown.total, breakdown, firstClear, best, leveledUp: levelFromXp(done.xp) > levelFromXp(save.xp), newBadges, daily: dailyOut },
  };
}

export function applyIncident(save: SaveFile, levelId: string, won: boolean): SaveFile {
  const prior = save.incidents[levelId] ?? { won: 0, lost: 0 };
  return { ...save, incidents: { ...save.incidents, [levelId]: won ? { ...prior, won: prior.won + 1 } : { ...prior, lost: prior.lost + 1 } } };
}

export function applyBeat(save: SaveFile, zoneId: string): SaveFile {
  return save.story.beats.includes(zoneId) ? save : { ...save, story: { ...save.story, beats: [...save.story.beats, zoneId] } };
}

export function applyCloseCase(save: SaveFile): { save: SaveFile; newBadges: string[] } {
  if (save.story.closed) return { save, newBadges: [] };
  return withBadges(save, { ...save, story: { ...save.story, closed: true } });
}

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: SaveFile }) {
  const [save, setSave] = useState<SaveFile>(() => initial ?? loadSave(undefined, MIGRATION));
  // Actions read and write the latest save through a ref, so two updates in a row never overwrite each other.
  const latest = useRef(save);

  const write = useCallback((next: SaveFile) => {
    latest.current = next;
    setSave(next);
    persistSave(next);
  }, []);

  const rename = useCallback((name: string) => write({ ...latest.current, name: name.slice(0, 24) }), [write]);

  const toggleMute = useCallback(() => {
    const cur = latest.current;
    const muted = !cur.settings.muted;
    setAudioMuted(muted);
    write({ ...cur, settings: { ...cur.settings, muted } });
  }, [write]);

  const completeLevel = useCallback(
    (levelId: string, run: RunStats & RunExtras, today = new Date().toISOString().slice(0, 10)): LevelOutcome => {
      const { save: next, outcome } = applyClear(latest.current, levelId, run, today, new Date().toISOString());
      write(next);
      play(outcome.unlockedCodex.length || outcome.newBadges.length ? 'unlock' : 'clear');
      if (outcome.leveledUp) play('levelup');
      return outcome;
    },
    [write],
  );

  const completeChallenge = useCallback(
    (levelId: string, run: ChallengeRunStats, daily?: string): ChallengeOutcome => {
      const { save: next, outcome } = applyChallenge(latest.current, levelId, run, new Date().toISOString().slice(0, 10), new Date().toISOString(), daily);
      write(next);
      play(outcome.newBadges.length ? 'unlock' : 'clear');
      if (outcome.leveledUp) play('levelup');
      return outcome;
    },
    [write],
  );

  const recordIncident = useCallback((levelId: string, won: boolean) => write(applyIncident(latest.current, levelId, won)), [write]);
  const markBeat = useCallback((zoneId: string) => write(applyBeat(latest.current, zoneId)), [write]);
  const closeCase = useCallback(() => write(applyCloseCase(latest.current).save), [write]);

  const reset = useCallback(() => {
    clearSave();
    const fresh = emptySave();
    fresh.settings.muted = latest.current.settings.muted;
    write(fresh);
  }, [write]);

  const value = useMemo(
    () => ({ save, rename, toggleMute, completeLevel, completeChallenge, recordIncident, markBeat, closeCase, reset }),
    [save, rename, toggleMute, completeLevel, completeChallenge, recordIncident, markBeat, closeCase, reset],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside a StoreProvider');
  return ctx;
}

export { zoneShapes };
