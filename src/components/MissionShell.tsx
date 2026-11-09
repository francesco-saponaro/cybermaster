import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { Mission } from '../content/types';
import { Stars } from './Stars';
import { Scope } from './Scope';
import { grade, stars as starsFor } from '../engine/scoring';
import { CODEX_BY_ID } from '../content/codex';
import type { MissionOutcome } from '../state/store';

/** The briefing card shown before a mission starts. */
export function Briefing({ mission, onStart }: { mission: Mission; onStart: () => void }) {
  return (
    <div className="panel rise" style={{ padding: 'clamp(20px, 4vw, 40px)', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <Scope size={48} />
        <div>
          <p style={{ margin: 0, color: 'var(--accent-text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem' }}>
            {mission.minutes}-minute mission · {mission.xp} XP
          </p>
          <h1 style={{ fontSize: 'var(--step-head)', marginTop: 4 }}>{mission.title}</h1>
        </div>
      </div>
      <p style={{ marginTop: 0 }}>{mission.brief}</p>
      <div className="panel-2" style={{ borderRadius: 'var(--r-sm)', padding: '14px 18px', margin: '18px 0' }}>
        <strong style={{ fontFamily: 'var(--font-display)' }}>Objective. </strong>
        {mission.objective}
      </div>
      <button type="button" className="btn btn-primary" onClick={onStart}>
        Begin mission
      </button>
    </div>
  );
}

/** A countdown that calls onExpire once. Returns the pill to render. */
export function useCountdown(seconds: number, running: boolean, onExpire: () => void) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!running) return;
    if (left <= 0) {
      onExpire();
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left, running, onExpire]);
  // reset when seconds changes (new stage)
  useEffect(() => setLeft(seconds), [seconds]);
  return left;
}

export function TimerPill({ left, danger }: { left: number; danger?: boolean }) {
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <span
      className="tnum"
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        padding: '6px 12px',
        borderRadius: 999,
        background: danger ? 'color-mix(in srgb, var(--bad) 28%, var(--surface))' : 'var(--surface-2)',
        color: danger ? '#f2a0a7' : 'var(--ink)',
      }}
      aria-live="off"
    >
      {m}:{s.toString().padStart(2, '0')}
    </span>
  );
}

/** The result screen shown at the end of every mission. */
export function Result({
  mission,
  score,
  outcome,
  onReplay,
}: {
  mission: Mission;
  score: number;
  outcome: MissionOutcome | null;
  onReplay: () => void;
}) {
  const st = starsFor(score);
  return (
    <div className="panel rise" style={{ padding: 'clamp(20px, 4vw, 40px)', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 10 }}>
        <Scope size={96} progress={score / 100} cleared={score >= 50} />
      </div>
      <h1 style={{ fontSize: 'var(--step-head)' }}>{grade(score)}</h1>
      <p className="tnum" style={{ fontSize: '2.4rem', fontFamily: 'var(--font-display)', fontWeight: 800, margin: '6px 0' }}>
        {score}
        <span style={{ fontSize: '1rem', color: 'var(--muted)' }}> / 100</span>
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 18px' }}>
        <Stars count={st} size={28} />
      </div>

      {outcome && outcome.xpGained > 0 && (
        <p style={{ color: 'var(--accent-text)', fontFamily: 'var(--font-display)', fontWeight: 700 }} className="pop">
          +{outcome.xpGained} XP{outcome.firstClear ? ' (first clear bonus)' : ''}
          {outcome.leveledUp ? ' · Level up!' : ''}
        </p>
      )}

      {outcome && outcome.unlockedCodex.length > 0 && (
        <div className="panel-2" style={{ borderRadius: 'var(--r-sm)', padding: 16, margin: '14px 0', textAlign: 'left' }}>
          <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>Codex unlocked</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {outcome.unlockedCodex.map((id) => (
              <li key={id}>{CODEX_BY_ID[id]?.title ?? id}</li>
            ))}
          </ul>
        </div>
      )}

      {outcome && outcome.newBadges.length > 0 && (
        <p className="tag" data-tone="accent" style={{ margin: '6px auto' }}>
          New badge earned
        </p>
      )}

      {mission.debrief && (
        <div className="panel-2" style={{ borderRadius: 'var(--r-sm)', padding: 16, margin: '14px 0', textAlign: 'left' }}>
          <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>What you learned</p>
          <p style={{ margin: 0 }}>{mission.debrief}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
        <button type="button" className="btn btn-ghost" onClick={onReplay}>
          {score >= 95 ? 'Play again' : 'Replay for a better grade'}
        </button>
        <Link to="/zones/$zoneId" params={{ zoneId: mission.zone }} className="btn btn-primary">
          Back to the board
        </Link>
      </div>
    </div>
  );
}

export function MissionFrame({ mission, children }: { mission: Mission; children: ReactNode }) {
  return (
    <div className="wrap" style={{ paddingBlock: 'clamp(20px, 4vw, 40px)' }}>
      <Link to="/zones/$zoneId" params={{ zoneId: mission.zone }} className="navlink" style={{ paddingLeft: 0, display: 'inline-block', marginBottom: 12 }}>
        &larr; Leave mission
      </Link>
      {children}
    </div>
  );
}
