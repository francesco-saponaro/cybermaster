import { useCallback, useEffect, useReducer, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { STAGES, incidentStep, recordsTaken, secondsLeft, stageOf, startIncident, type Incident, type IncidentAction, type IncidentConfig } from '../engine/incident';
import { clock } from '../engine/scoring';
import { play } from '../engine/audio';
import { Scope } from '../components/Scope';

/**
 * The incident clock. Ticks four times a second from real time (so a hidden
 * tab or a sleeping laptop never loses the game in one jump: a tick is at most
 * a second), and plays the alert when the attacker reaches a new stage.
 */
export function useIncident(cfg: IncidentConfig | null, paused: boolean): { state: Incident | null; dispatch: (a: IncidentAction) => void; reset: () => void } {
  const reducer = useCallback((s: Incident | null, a: IncidentAction | { t: 'reset' }): Incident | null => {
    if (!cfg) return null;
    if (a.t === 'reset' || !s) return startIncident(cfg);
    return incidentStep(s, a, cfg);
  }, [cfg]);
  const [state, dispatch] = useReducer(reducer, cfg, (c) => (c ? startIncident(c) : null));
  const last = useRef(Date.now());
  const peak = useRef(state?.peak ?? 0);

  useEffect(() => {
    if (!cfg || paused) return undefined;
    last.current = Date.now();
    const t = window.setInterval(() => {
      const now = Date.now();
      const dt = Math.min(1, (now - last.current) / 1000);
      last.current = now;
      if (typeof document !== 'undefined' && document.hidden) return;
      dispatch({ t: 'tick', dt });
    }, 250);
    return () => window.clearInterval(t);
  }, [cfg, paused]);

  useEffect(() => {
    if (!state) return;
    if (state.peak > peak.current && state.status === 'running') play('alert');
    peak.current = state.peak;
  }, [state]);

  return { state, dispatch: dispatch as (a: IncidentAction) => void, reset: useCallback(() => dispatch({ t: 'reset' }), []) };
}

export function IncidentBar({ state, cfg, threat, unit }: { state: Incident; cfg: IncidentConfig; threat: string; unit: string }) {
  const ref = useRef<HTMLElement>(null);
  // On a phone the bar sticks to the top; the step bar sits right under it.
  useEffect(() => {
    const el = ref.current;
    const lv = el?.closest('.lv') as HTMLElement | null;
    if (!el || !lv || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => lv.style.setProperty('--inc-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      lv.style.removeProperty('--inc-h');
    };
  }, []);
  const stage = stageOf(state.progress);
  const left = secondsLeft(state, cfg);
  const taken = recordsTaken(state.progress, cfg.records);
  const frozen = state.frozen > 0 && state.status === 'running';
  return (
    <section ref={ref} className="inc" data-stage={stage} data-frozen={frozen} data-status={state.status} aria-label="Live incident">
      <div className="inc-head">
        <span className="inc-live">
          <span className="inc-dot" aria-hidden="true" />
          {state.status === 'contained' ? 'Contained' : frozen ? 'Held back' : 'Live incident'}
        </span>
        <span className="inc-threat">{threat}</span>
        <span className="inc-count tnum" aria-live="off">
          <span className="inc-k">Breach in</span> {state.status === 'contained' ? '--:--' : clock(left)}
        </span>
      </div>
      <ol className="inc-track" aria-label={`Attacker at ${STAGES[stage]}`}>
        {STAGES.map((name, i) => (
          <li key={name} data-state={i < stage ? 'past' : i === stage ? 'now' : 'next'}>
            <span className="inc-stage">{name}</span>
            <span className="inc-fill" style={{ width: `${i < stage ? 100 : i === stage ? ((state.progress - i * 25) / 25) * 100 : 0}%` }} />
          </li>
        ))}
      </ol>
      <p className="inc-data tnum">
        <span className="inc-k">{unit}</span> <strong>{taken.toLocaleString('en-GB')}</strong> / {cfg.records.toLocaleString('en-GB')}
      </p>
    </section>
  );
}

export function IncidentLost({ records, unit, loot, zoneId, onRetry, guided }: { records: number; unit: string; loot: string; zoneId: string; onRetry: () => void; guided: boolean }) {
  return (
    <div className="result-veil" role="dialog" aria-modal="true" aria-labelledby="lost-title">
      <div className="result lost">
        <p className="lv-label" style={{ margin: 0 }}>Incident lost</p>
        <h2 id="lost-title">The attacker got out.</h2>
        <p className="said">They left with {loot}.</p>
        <dl className="result-stats">
          <div>
            <dt>{unit.charAt(0).toUpperCase() + unit.slice(1)}</dt>
            <dd>{records.toLocaleString('en-GB')}</dd>
          </div>
        </dl>
        <p className="named">
          Nothing is lost for you: {guided ? 'the steps are still there, and every correct one pushes them back.' : 'every correct action pushes them back and freezes them for a moment. Mistakes speed them up.'}
        </p>
        <div className="result-actions">
          <button type="button" className="cbtn cbtn-go" onClick={onRetry} autoFocus>
            Try again
          </button>
          <Link to="/zones/$zoneId" params={{ zoneId }} className="cbtn">
            Zone map
          </Link>
        </div>
      </div>
    </div>
  );
}

/** A small burst of sparks around a check that just turned green. */
export function Burst() {
  return (
    <span className="burst" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ transform: `rotate(${i * 45}deg)` }} />
      ))}
    </span>
  );
}

export function ComboChip({ n, broke }: { n: number; broke: number }) {
  if (n < 2 && !broke) return null;
  return (
    <span key={n < 2 ? `b${broke}` : `c${n}`} className="combo" data-broke={n < 2} aria-live="polite">
      {n < 2 ? 'Combo lost' : <>Combo <strong className="tnum">x{n}</strong></>}
    </span>
  );
}

/** The reticle closing on the sandbox as the last check turns green. */
export function LockOn() {
  return (
    <div className="lockon" aria-hidden="true">
      <span className="lockon-flash" />
      <span className="lockon-ring">
        <Scope size={180} cleared filled />
      </span>
    </div>
  );
}
