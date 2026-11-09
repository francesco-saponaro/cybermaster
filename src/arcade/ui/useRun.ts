import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { play } from '../../engine/audio';
import { randomSeed } from '../../engine/rng';
import type { ArcadeOutcome } from '../../engine/arcade';
import type { GameId } from '../../content/arcade';

export type Phase = 'start' | 'play' | 'paused' | 'over';

export interface RunApi {
  phase: Phase;
  seed: number;
  /** Bumped on every new run, to reset the game's state. */
  runId: number;
  outcome: (ArcadeOutcome & { newBadges: string[] }) | null;
  won: boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  finish: (score: number, won: boolean) => void;
  retry: () => void;
  reduced: boolean;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return reduced;
}

/**
 * One run of an arcade game: the start screen, play, pause and game over. A
 * seed in the address replays the same run; otherwise each run gets a new one.
 * The run pauses itself when the tab is hidden.
 */
export function useRun(gameId: GameId, fixedSeed: number | undefined, reset: (seed: number) => void): RunApi {
  const { completeArcade } = useStore();
  const [phase, setPhase] = useState<Phase>('start');
  const [seed, setSeed] = useState(() => fixedSeed ?? randomSeed());
  const [runId, setRunId] = useState(0);
  const [outcome, setOutcome] = useState<RunApi['outcome']>(null);
  const [won, setWon] = useState(false);
  const finished = useRef(false);
  const reduced = usePrefersReducedMotion();
  const resetRef = useRef(reset);
  resetRef.current = reset;
  const seedRef = useRef(seed);
  seedRef.current = seed;

  // The board is reset in the same update that starts the run, so the first frame of a new run never sees the old one.
  const begin = useCallback((nextSeed: number) => {
    finished.current = false;
    resetRef.current(nextSeed);
    setOutcome(null);
    setRunId((n) => n + 1);
    setPhase('play');
    play('unlock');
  }, []);
  const start = useCallback(() => begin(seedRef.current), [begin]);
  const pause = useCallback(() => setPhase((p) => (p === 'play' ? 'paused' : p)), []);
  const resume = useCallback(() => setPhase((p) => (p === 'paused' ? 'play' : p)), []);
  const finish = useCallback(
    (score: number, didWin: boolean) => {
      if (finished.current) return;
      finished.current = true;
      setWon(didWin);
      setOutcome(completeArcade(gameId, score));
      setPhase('over');
      play(didWin ? 'clear' : 'breach');
    },
    [completeArcade, gameId],
  );
  // A seed from the address replays the same run; otherwise every retry is new.
  const retry = useCallback(() => {
    const next = fixedSeed === undefined ? randomSeed() : seedRef.current;
    setSeed(next);
    begin(next);
  }, [fixedSeed, begin]);

  // Hidden tab: pause, so a run is never lost in the background.
  useEffect(() => {
    const onHide = () => {
      if (document.hidden) setPhase((p) => (p === 'play' ? 'paused' : p));
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  return { phase, seed, runId, outcome, won, start, pause, resume, finish, retry, reduced };
}

/** Calls `tick` once per animation frame with the milliseconds since the last frame, while `running`. */
export function useLoop(running: boolean, tick: (dt: number) => void): void {
  const ref = useRef(tick);
  ref.current = tick;
  useEffect(() => {
    if (!running) return undefined;
    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.max(0, Math.min(100, t - last));
      last = t;
      ref.current(dt);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

/** Game keys, only while the run is being played. Returns true from the handler to stop the browser's default. */
export function useGameKeys(active: boolean, handler: (e: KeyboardEvent) => boolean | void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!active) return undefined;
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (ref.current(e)) e.preventDefault();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [active]);
}
