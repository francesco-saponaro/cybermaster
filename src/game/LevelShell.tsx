import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { Level } from '../content/types';
import { ZONE_BY_ID } from '../content/zones';
import { useStore, type LevelOutcome } from '../state/store';
import { play } from '../engine/audio';
import { formatSeconds } from '../engine/scoring';
import { Rich } from './Rich';
import { ResultCard } from './ResultCard';
import { Scope } from '../components/Scope';
import type { CheckState } from './types';
import { StepList, StepBar } from './Steps';
import { StartHintContext, useStartHintState } from './StartHint';

export interface ShellApi {
  onChecks: (c: Record<string, boolean | CheckState>) => void;
  fail: (reason: string) => void;
  act: { nonce: number; act: unknown } | null;
}

/**
 * The frame every level runs in: the top bar, the instruction card with the
 * goal, the numbered steps, Show me, and the result card when every step is
 * green. The sandbox itself is rendered by the caller.
 */
export function LevelShell({ level, children }: { level: Level; children: (api: ShellApi) => ReactNode }) {
  const { completeLevel } = useStore();
  const zone = ZONE_BY_ID[level.zone]!;
  const index = zone.levelIds.indexOf(level.id);
  const [runKey, setRunKey] = useState(0);
  const [checks, setChecks] = useState<Record<string, CheckState>>({});
  const [fails, setFails] = useState(0);
  const [failMsg, setFailMsg] = useState<{ text: string; nonce: number } | null>(null);
  const [shown, setShown] = useState(0);
  const [act, setAct] = useState<{ nonce: number; act: unknown } | null>(null);
  const [started, setStarted] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [outcome, setOutcome] = useState<(LevelOutcome & { seconds: number; showMe: number; fails: number }) | null>(null);
  const [shake, setShake] = useState(0);
  const done = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  const prevPass = useRef<Record<string, boolean>>({});
  const hint = useStartHintState(level.zone, index === 0);
  const currentRef = useRef<HTMLLIElement | null>(null);
  const [barVisible, setBarVisible] = useState(false);

  // Restart the shake animation on every failure without remounting the sandbox.
  useEffect(() => {
    const el = mainRef.current;
    if (!shake || !el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }, [shake]);

  useEffect(() => {
    if (outcome) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [outcome]);

  const onChecks = useCallback((c: Record<string, boolean | CheckState>) => {
    const norm: Record<string, CheckState> = {};
    for (const [k, v] of Object.entries(c)) norm[k] = typeof v === 'boolean' ? { pass: v } : v;
    setChecks((prev) => {
      const same = Object.keys(norm).length === Object.keys(prev).length && Object.entries(norm).every(([k, v]) => prev[k]?.pass === v.pass && prev[k]?.detail === v.detail);
      return same ? prev : norm;
    });
  }, []);

  // A check turning green plays a note; all of them green finishes the level.
  useEffect(() => {
    const newlyPassed = level.checks.some((c) => checks[c.id]?.pass && !prevPass.current[c.id]);
    prevPass.current = Object.fromEntries(level.checks.map((c) => [c.id, !!checks[c.id]?.pass]));
    if (newlyPassed) play('hit');
    if (done.current) return;
    if (level.checks.length > 0 && level.checks.every((c) => checks[c.id]?.pass)) {
      done.current = true;
      setFailMsg(null);
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      const t = window.setTimeout(() => {
        const out = completeLevel(level.id, { showMe: shown, fails, seconds });
        setOutcome({ ...out, seconds, showMe: shown, fails });
      }, 650);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [checks, level, completeLevel, shown, fails, started]);

  // Doing the first step is as good as dismissing the start-here note.
  const firstDone = !!(level.checks[0] && checks[level.checks[0].id]?.pass);
  useEffect(() => {
    if (firstDone && hint.show) hint.dismiss();
  }, [firstDone, hint]);

  // On narrow screens the steps sit above the sandbox; once the current step
  // scrolls out of view, a bar at the top of the screen keeps it in sight.
  const passedKey = level.checks.map((c) => (checks[c.id]?.pass ? 1 : 0)).join('');
  useEffect(() => {
    const el = currentRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setBarVisible(false);
      return undefined;
    }
    // Shown as soon as the step's own heading has scrolled off the top.
    const io = new IntersectionObserver(([e]) => setBarVisible(!!e && e.boundingClientRect.top < 0), { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    io.observe(el);
    return () => io.disconnect();
  }, [passedKey]);

  const fail = useCallback((reason: string) => {
    if (done.current) return;
    setFails((f) => f + 1);
    setFailMsg({ text: reason, nonce: Date.now() });
    setShake((s) => s + 1);
    play('miss');
  }, []);

  const showMe = () => {
    const step = level.showMe[shown];
    if (!step) return;
    setShown((n) => n + 1);
    if (step.act) setAct({ nonce: Date.now(), act: step.act });
    play('blip');
  };

  const restart = () => {
    done.current = false;
    prevPass.current = {};
    setChecks({});
    setFails(0);
    setFailMsg(null);
    setShown(0);
    setAct(null);
    setOutcome(null);
    setStarted(Date.now());
    setNow(Date.now());
    setRunKey((k) => k + 1);
  };

  const api = useMemo<ShellApi>(() => ({ onChecks, fail, act }), [onChecks, fail, act]);
  const passed = level.checks.filter((c) => checks[c.id]?.pass).length;
  const seconds = Math.max(0, Math.round(((outcome ? started + outcome.seconds * 1000 : now) - started) / 1000));
  const nextId = zone.levelIds[index + 1];

  return (
    <div className="lv">
      <header className="lv-top">
        <Link to="/zones/$zoneId" params={{ zoneId: zone.id }} className="lv-exit" aria-label={`Back to ${zone.name}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hide-sm">{zone.name}</span>
        </Link>
        <div className="lv-title">
          <span className="lv-num">{index + 1}/{zone.levelIds.length}</span>
          <h1>{level.title}</h1>
          {level.boss ? <span className="status" data-tone="bad">Boss</span> : null}
        </div>
        <div className="lv-actions">
          <span className="lv-clock" aria-label="Time on this level">{formatSeconds(seconds)}</span>
          <button type="button" className="cbtn cbtn-sm hide-sm" onClick={restart}>
            Restart
          </button>
          <button type="button" className="cbtn cbtn-sm" onClick={showMe} disabled={shown >= level.showMe.length || !!outcome}>
            Show me{shown > 0 ? ` ${shown}/${level.showMe.length}` : ''}
          </button>
        </div>
      </header>

      <div className="lv-body">
        <aside className="lv-aside" aria-label="Instructions and checks">
          <div className="brief-grid stack-12">
            <section className="card brief">
              <p className="brief-who">
                <Scope size={18} filled />
                Ines, your lead
              </p>
              <p className="brief-goal">{level.goal}</p>
              <p className="brief-say">
                <Rich text={level.instruction} />
              </p>
            </section>
            <div className="stack-12">
              <section className="card brief" aria-live="polite">
                <div className="row" style={{ marginBottom: 6 }}>
                  <p className="lv-label grow" style={{ margin: 0 }}>Steps</p>
                  <span className="small muted mono">{passed}/{level.checks.length} done</span>
                </div>
                <StepList steps={level.checks} checks={checks} together={level.stepsTogether} currentRef={currentRef} />
              </section>
              {failMsg ? (
                <div key={failMsg.nonce} className="failline shake" role="alert">
                  <strong>Not yet.</strong>
                  <span>{failMsg.text}</span>
                </div>
              ) : null}
              {shown > 0 ? (
                <section className="card brief">
                  <p className="lv-label">Show me</p>
                  <ol className="showme-steps">
                    {level.showMe.slice(0, shown).map((s, i) => (
                      <li key={i} className="slide-in">{s.say}</li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </div>
          </div>
        </aside>

        <main className="lv-main" ref={mainRef} aria-label="Sandbox">
          <StepBar steps={level.checks} checks={checks} visible={barVisible && !outcome} failure={failMsg} />
          <StartHintContext.Provider value={hint}>
            <div key={runKey} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {children(api)}
            </div>
          </StartHintContext.Provider>
        </main>
      </div>

      {outcome ? <ResultCard level={level} outcome={outcome} nextId={nextId} zoneId={zone.id} onReplay={restart} /> : null}
    </div>
  );
}
