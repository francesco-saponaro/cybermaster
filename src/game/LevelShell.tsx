import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { Level } from '../content/types';
import { ZONE_BY_ID, ZONES } from '../content/zones';
import { CAST, INCIDENTS } from '../content/story';
import { useStore, type ChallengeOutcome, type LevelOutcome } from '../state/store';
import { play, playCombo } from '../engine/audio';
import { clock, formatSeconds, nextHintCost } from '../engine/scoring';
import { COMBO_START, comboBroke, comboStep, type Combo, type ComboEvent } from '../engine/combo';
import { incidentConfig, recordsTaken, type IncidentPace } from '../engine/incident';
import { remarkFor } from '../engine/caseboard';
import { Rich } from './Rich';
import { termsIn } from '../content/glossary';
import { ResultCard } from './ResultCard';
import { ChallengeResult } from './ChallengeResult';
import { Scope } from '../components/Scope';
import { MuteIcon } from '../components/Hud';
import type { CheckState } from './types';
import { StepList, StepBar, recallOn, setRecall } from './Steps';
import { StartHintContext, useStartHintState } from './StartHint';
import { Burst, ComboChip, IncidentBar, IncidentLost, LockOn, useIncident } from './Live';

export interface ShellApi {
  onChecks: (c: Record<string, boolean | CheckState>) => void;
  fail: (reason: string) => void;
  act: { nonce: number; act: unknown } | null;
}

export type ShellMode =
  | { kind: 'guided' }
  | { kind: 'challenge'; seed: number; hints: string[]; onNew: () => void }
  | { kind: 'daily'; day: string; seed: number; hints: string[] };

type Outcome =
  | { kind: 'guided'; out: LevelOutcome & { seconds: number; showMe: number; fails: number } }
  | { kind: 'challenge'; out: ChallengeOutcome; seconds: number; hints: number };

const FINAL_LEVEL = ZONES[ZONES.length - 1]!.levelIds[ZONES[ZONES.length - 1]!.levelIds.length - 1];

/**
 * The frame every level runs in: the top bar, the instruction card, the steps
 * (guided) or the brief and hints (challenge), the live incident on a boss,
 * the combo, and the result. The sandbox itself is rendered by the caller.
 */
export function LevelShell({ level, mode = { kind: 'guided' }, children }: { level: Level; mode?: ShellMode; children: (api: ShellApi) => ReactNode }) {
  const { save, completeLevel, completeChallenge, recordIncident, toggleMute } = useStore();
  const guided = mode.kind === 'guided';
  const hints = mode.kind === 'guided' ? [] : mode.hints;
  const zone = ZONE_BY_ID[level.zone]!;
  const index = zone.levelIds.indexOf(level.id);
  const [runKey, setRunKey] = useState(0);
  const [checks, setChecks] = useState<Record<string, CheckState>>({});
  const [fails, setFails] = useState(0);
  const [failMsg, setFailMsg] = useState<{ text: string; nonce: number } | null>(null);
  const [shown, setShown] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [act, setAct] = useState<{ nonce: number; act: unknown } | null>(null);
  const [started, setStarted] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [locking, setLocking] = useState(false);
  const [lost, setLost] = useState(false);
  const [shake, setShake] = useState(0);
  const [combo, setCombo] = useState<Combo>(COMBO_START);
  const [broke, setBroke] = useState(0);
  const [burst, setBurst] = useState<{ id: string; nonce: number } | null>(null);
  const done = useRef(false);
  const comboRef = useRef<Combo>(COMBO_START);
  const mainRef = useRef<HTMLElement>(null);
  const prevPass = useRef<Record<string, boolean>>({});
  const baselined = useRef(false);
  const hint = useStartHintState(level.zone, index === 0 && guided);
  const currentRef = useRef<HTMLLIElement | null>(null);
  const [barVisible, setBarVisible] = useState(false);
  const remark = remarkFor(level.id, save);

  // ---- The live incident (boss levels) -------------------------------------
  const story = level.boss ? INCIDENTS[level.id] : undefined;
  const firstPlay = useRef((save.levels[level.id]?.stars ?? 0) < 1).current;
  const [recall, setRecallState] = useState(recallOn);
  const pace: IncidentPace = !guided ? 'harsh' : firstPlay ? 'gentle' : 'normal';
  const cfg = useMemo(() => (story ? incidentConfig(pace, level.par, story.records) : null), [story, pace, level.par]);
  const incident = useIncident(cfg, !!outcome || locking || lost);

  const event = useCallback((e: ComboEvent) => {
    const before = comboRef.current;
    const after = comboStep(before, e);
    comboRef.current = after;
    setCombo(after);
    if (comboBroke(before, e)) {
      setBroke((n) => n + 1);
      play('break');
    }
    if (e === 'correct') playCombo(after.current);
  }, []);

  // Restart the shake animation on every failure without remounting the sandbox.
  useEffect(() => {
    const el = mainRef.current;
    if (!shake || !el) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }, [shake]);

  useEffect(() => {
    if (outcome || lost) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [outcome, lost]);

  // The attacker reached 100: the run is over, calmly.
  useEffect(() => {
    if (incident.state?.status === 'breached' && !lost && !done.current) {
      setLost(true);
      setFailMsg(null);
      recordIncident(level.id, false);
      play('breach');
    }
  }, [incident.state?.status, lost, recordIncident, level.id]);

  const onChecks = useCallback((c: Record<string, boolean | CheckState>) => {
    const norm: Record<string, CheckState> = {};
    for (const [k, v] of Object.entries(c)) norm[k] = typeof v === 'boolean' ? { pass: v } : v;
    // The sandbox's first report is the starting point: a check already true at the start (normal use still works, say) is not a move.
    if (!baselined.current) {
      baselined.current = true;
      prevPass.current = Object.fromEntries(Object.entries(norm).map(([k, v]) => [k, v.pass]));
    }
    setChecks((prev) => {
      const same = Object.keys(norm).length === Object.keys(prev).length && Object.entries(norm).every(([k, v]) => prev[k]?.pass === v.pass && prev[k]?.detail === v.detail);
      return same ? prev : norm;
    });
  }, []);

  // A check turning green: a note, a pop and sparks, a step on the combo, and
  // a push back on the attacker. All of them green finishes the level.
  useEffect(() => {
    if (lost) return undefined;
    const newly = level.checks.filter((c) => checks[c.id]?.pass && !prevPass.current[c.id]);
    prevPass.current = Object.fromEntries(level.checks.map((c) => [c.id, !!checks[c.id]?.pass]));
    if (newly.length) {
      play('hit');
      setBurst({ id: newly[newly.length - 1]!.id, nonce: Date.now() });
      for (let i = 0; i < newly.length; i++) {
        event('correct');
        incident.dispatch({ t: 'correct' });
      }
    }
    if (done.current) return undefined;
    if (level.checks.length > 0 && level.checks.every((c) => checks[c.id]?.pass)) {
      done.current = true;
      setFailMsg(null);
      setLocking(true);
      play('lock');
      if (story) {
        incident.dispatch({ t: 'contain' });
        recordIncident(level.id, true);
        window.setTimeout(() => play('contain'), 250);
      }
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      const c = comboRef.current;
      const clean = fails === 0 && shown === 0 && hintsUsed === 0;
      const t = window.setTimeout(() => {
        setLocking(false);
        if (mode.kind === 'guided') {
          const out = completeLevel(level.id, { showMe: shown, fails, seconds, comboBest: c.best, clean });
          setOutcome({ kind: 'guided', out: { ...out, seconds, showMe: shown, fails } });
        } else {
          const out = completeChallenge(level.id, { hints: hintsUsed, seconds, par: level.par, comboBest: c.best, clean }, mode.kind === 'daily' ? mode.day : undefined);
          setOutcome({ kind: 'challenge', out, seconds, hints: hintsUsed });
        }
      }, 750);
      return () => window.clearTimeout(t);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, level, lost]);

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
    const io = new IntersectionObserver(([e]) => setBarVisible(!!e && e.boundingClientRect.top < 0), { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
    io.observe(el);
    return () => io.disconnect();
  }, [passedKey]);

  const fail = useCallback(
    (reason: string) => {
      if (done.current || lost) return;
      setFails((f) => f + 1);
      setFailMsg({ text: reason, nonce: Date.now() });
      setShake((s) => s + 1);
      play('miss');
      event('mistake');
      incident.dispatch({ t: 'wrong' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event, lost],
  );

  const showMe = () => {
    const step = level.showMe[shown];
    if (!step) return;
    setShown((n) => n + 1);
    if (step.act) setAct({ nonce: Date.now(), act: step.act });
    play('blip');
    event('help');
  };

  const takeHint = () => {
    if (hintsUsed >= hints.length) return;
    setHintsUsed((n) => n + 1);
    play('hint');
    event('help');
  };

  const restart = () => {
    done.current = false;
    prevPass.current = {};
    baselined.current = false;
    comboRef.current = COMBO_START;
    setCombo(COMBO_START);
    setChecks({});
    setFails(0);
    setFailMsg(null);
    setShown(0);
    setHintsUsed(0);
    setAct(null);
    setOutcome(null);
    setLocking(false);
    setLost(false);
    setBurst(null);
    setStarted(Date.now());
    setNow(Date.now());
    incident.reset();
    setRunKey((k) => k + 1);
  };

  const api = useMemo<ShellApi>(() => ({ onChecks, fail, act }), [onChecks, fail, act]);
  const passed = level.checks.filter((c) => checks[c.id]?.pass).length;
  const endSeconds = outcome ? (outcome.kind === 'guided' ? outcome.out.seconds : outcome.seconds) : null;
  const seconds = endSeconds ?? Math.max(0, Math.round((now - started) / 1000));
  const nextId = zone.levelIds[index + 1];
  const nextHint = nextHintCost(hintsUsed, hints.length);
  const threat = incident.state ? Math.max(0, Math.min(3, Math.floor(incident.state.progress / 25))) : -1;
  const tag = mode.kind === 'daily' ? "Today's case" : mode.kind === 'challenge' ? 'Challenge' : level.boss ? 'Boss' : null;

  return (
    <div className="lv" data-mode={mode.kind} data-threat={incident.state && incident.state.status === 'running' && !outcome ? threat : undefined}>
      <header className="lv-top">
        <Link to="/zones/$zoneId" params={{ zoneId: zone.id }} className="lv-exit" aria-label={`Back to ${zone.name}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hide-sm">{zone.name}</span>
        </Link>
        <div className="lv-title">
          {mode.kind === 'daily' ? null : <span className="lv-num">{index + 1}/{zone.levelIds.length}</span>}
          <h1>{mode.kind === 'daily' ? zone.name : level.title}</h1>
          {tag ? <span className="status hide-xs" data-tone={level.boss || !guided ? 'bad' : undefined}>{tag}</span> : null}
        </div>
        <div className="lv-actions">
          <ComboChip n={combo.current} broke={broke} />
          <span className="lv-clock tnum" aria-label={guided ? 'Time on this level' : 'Time, against par'}>
            {guided ? formatSeconds(seconds) : (
              <>
                <span data-over={seconds > level.par}>{clock(seconds)}</span>
                <span className="lv-par"> / {clock(level.par)}</span>
              </>
            )}
          </span>
          <button type="button" className="lv-icon" onClick={toggleMute} aria-label={save.settings.muted ? 'Unmute sound' : 'Mute sound'} title={save.settings.muted ? 'Sound off' : 'Sound on'}>
            <MuteIcon muted={save.settings.muted} />
          </button>
          <button type="button" className="cbtn cbtn-sm hide-sm" onClick={restart}>
            Restart
          </button>
          {guided ? (
            <button type="button" className="cbtn cbtn-sm" onClick={showMe} disabled={shown >= level.showMe.length || !!outcome || lost}>
              Show me{shown > 0 ? ` ${shown}/${level.showMe.length}` : ''}
            </button>
          ) : (
            <button type="button" className="cbtn cbtn-sm" onClick={takeHint} disabled={nextHint === null || !!outcome || lost}>
              {nextHint === null ? 'No hints left' : `Hint, -${nextHint}`}
            </button>
          )}
        </div>
      </header>

      {incident.state && cfg && story ? <IncidentBar state={incident.state} cfg={cfg} threat={story.threat} unit={story.unit} /> : null}

      <div className="lv-body" data-incident={!!story}>
        <aside className="lv-aside" aria-label="Instructions and checks">
          <div className="brief-grid stack-12">
            <section className="card brief">
              {remark ? (
                <div className="brief-remark">
                  <p className="brief-who">
                    <Scope size={18} filled />
                    {remark.who}, {CAST[remark.who].after}
                  </p>
                  <p className="brief-line">{remark.text}</p>
                </div>
              ) : (
                <p className="brief-who">
                  <Scope size={18} filled />
                  Ines, your lead
                </p>
              )}
              <p className="brief-goal">{level.goal}</p>
              <p className="brief-say">
                <Rich text={level.instruction} />
              </p>
            </section>
            <div className="stack-12">
              {guided ? (
                <section className="card brief" aria-live="polite">
                  <div className="row" style={{ marginBottom: 6 }}>
                    <p className="lv-label grow" style={{ margin: 0 }}>Steps</p>
                    <span className="small muted mono">{passed}/{level.checks.length} done</span>
                  </div>
                  {!firstPlay ? (
                    <label className="recall-toggle small">
                      <input type="checkbox" checked={recall} onChange={(e) => { setRecall(e.target.checked); setRecallState(e.target.checked); }} />
                      Recall mode: hide the commands, type them from memory
                    </label>
                  ) : null}
                  <StepList steps={level.checks} checks={checks} together={level.stepsTogether} currentRef={currentRef} burst={burst} recall={!firstPlay && recall} />
                </section>
              ) : (
                <ChallengeChecks level={level} checks={checks} burst={burst} />
              )}
              {failMsg ? (
                <div key={failMsg.nonce} className="failline shake" role="alert">
                  <strong>Not yet.</strong>
                  <span>{failMsg.text}</span>
                </div>
              ) : null}
              {guided && shown > 0 ? (
                <section className="card brief">
                  <p className="lv-label">Show me</p>
                  <ol className="showme-steps">
                    {level.showMe.slice(0, shown).map((s, i) => (
                      <li key={i} className="slide-in">{s.say}</li>
                    ))}
                  </ol>
                </section>
              ) : null}
              {!guided ? (
                <section className="card brief hints" aria-live="polite">
                  <div className="row" style={{ marginBottom: hintsUsed ? 8 : 0 }}>
                    <p className="lv-label grow" style={{ margin: 0 }}>Hints</p>
                    <span className="small muted mono">{hintsUsed}/{hints.length}</span>
                  </div>
                  {hintsUsed === 0 ? (
                    <p className="small muted" style={{ margin: '6px 0 0' }}>
                      Each hint costs points and the first two cost a star. They go from a nudge to nearly the answer.
                    </p>
                  ) : (
                    <ol className="hint-list">
                      {hints.slice(0, hintsUsed).map((h, i) => (
                        <li key={i} className="slide-in">
                          <Rich text={h} />
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              ) : null}
            </div>
            <LevelWords level={level} open={firstPlay} />
          </div>
        </aside>

        <main className="lv-main" ref={mainRef} aria-label="Sandbox">
          {guided ? <StepBar steps={level.checks} checks={checks} visible={barVisible && !outcome} failure={failMsg} recall={!firstPlay && recall} /> : null}
          <StartHintContext.Provider value={hint}>
            <div key={runKey} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {children(api)}
            </div>
          </StartHintContext.Provider>
        </main>
      </div>

      {locking ? <LockOn /> : null}
      {lost && story && cfg && incident.state ? (
        <IncidentLost records={recordsTaken(incident.state.progress, cfg.records)} unit={story.unit} loot={story.loot} zoneId={zone.id} onRetry={restart} guided={guided} />
      ) : null}
      {outcome?.kind === 'guided' ? <ResultCard level={level} outcome={outcome.out} nextId={nextId} zoneId={zone.id} onReplay={restart} finale={level.id === FINAL_LEVEL && !save.story.closed} /> : null}
      {outcome?.kind === 'challenge' ? (
        <ChallengeResult level={level} outcome={outcome.out} seconds={outcome.seconds} hints={outcome.hints} zoneId={zone.id} zoneName={zone.name} onNew={mode.kind === 'challenge' ? mode.onNew : undefined} onReplay={restart} />
      ) : null}
    </div>
  );
}

/** A challenge's progress: one mark per check, its words shown once it is done. */
function ChallengeChecks({ level, checks, burst }: { level: Level; checks: Record<string, CheckState>; burst: { id: string; nonce: number } | null }) {
  const passed = level.checks.filter((c) => checks[c.id]?.pass).length;
  return (
    <section className="card brief" aria-live="polite">
      <div className="row" style={{ marginBottom: 8 }}>
        <p className="lv-label grow" style={{ margin: 0 }}>Checks</p>
        <span className="small muted mono">{passed}/{level.checks.length}</span>
      </div>
      <ol className="cchecks">
        {level.checks.map((c, i) => {
          const pass = !!checks[c.id]?.pass;
          return (
            <li key={c.id} data-pass={pass} data-check={c.id}>
              <span className="cmark" aria-hidden="true">
                {pass ? '' : i + 1}
                {pass && burst?.id === c.id ? <Burst key={burst.nonce} /> : null}
              </span>
              {pass ? (
                <span className="slide-in">
                  <strong>{c.label}</strong>
                  <span className="check-detail">
                    <Rich text={c.learned} />
                  </span>
                </span>
              ) : (
                <span className="muted">Not done yet</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Every technical word the level uses, explained in plain words. Open the first time you play a level. */
function LevelWords({ level, open }: { level: Level; open: boolean }) {
  const words = useMemo(() => {
    const extra = level as unknown as Record<string, unknown>;
    const texts = [
      level.goal,
      level.instruction,
      ...level.checks.flatMap((c) => [c.label, c.do, c.learned, c.hint ?? '']),
      ...level.showMe.map((m) => m.say),
      typeof extra.request === 'string' ? extra.request : '',
      level.didWhat,
    ];
    return termsIn(texts);
  }, [level]);
  if (words.length === 0) return null;
  return (
    <details className="card brief words" open={open} data-testid="level-words">
      <summary>
        <span className="lv-label" style={{ margin: 0 }}>Words in this level</span>
        <span className="small muted mono">{words.length}</span>
      </summary>
      <p className="words-hint">New to any of these? Here is what they mean. Underlined words in the steps explain themselves too.</p>
      <dl className="words-list">
        {words.map((w) => (
          <div key={w.id}>
            <dt>{w.term}</dt>
            <dd>
              {w.plain}
              {w.example ? (
                <>
                  {' '}
                  <code>{w.example}</code>
                </>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
