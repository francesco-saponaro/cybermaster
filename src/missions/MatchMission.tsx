import { useMemo, useRef, useState } from 'react';
import type { MatchMission, Mistake } from '../content/types';
import { GameHud } from './GameHud';
import { TimerPill, useCountdown } from '../components/MissionShell';
import type { MissionProps } from './mission';
import { useHint } from './mission';
import { accuracyScore, clampScore, timeBonus } from '../engine/scoring';
import { play } from '../engine/audio';

// Match: tap a flaw, then tap a fix. Works with keyboard and touch (no native
// HTML5 drag, which fails on phones). Decoy fixes are in the belt.
export function MatchMissionView({ mission, onFinish }: MissionProps<MatchMission>) {
  const fixes = useMemo(() => shuffle(mission.fixes, mission.id), [mission]);
  const [placed, setPlaced] = useState<Record<string, string>>({}); // bugId -> fixId
  const [selectedBug, setSelectedBug] = useState<string | null>(null);
  const [misses, setMisses] = useState(0);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const hint = useHint();
  const mistakesRef = useRef<Mistake[]>([]);

  const solvedCount = Object.keys(placed).length;
  const running = !done;
  const left = useCountdown(mission.seconds, running, () => finish());

  function finish() {
    if (done) return;
    setDone(true);
    const correct = mission.bugs.filter((b) => placed[b.id] === b.fix).length;
    const base = accuracyScore(correct, mission.bugs.length, misses, 0.5);
    const bonus = correct === mission.bugs.length && misses === 0 ? timeBonus(mission.seconds - left, 40, mission.seconds) : 0;
    for (const b of mission.bugs) {
      if (placed[b.id] !== b.fix) {
        mistakesRef.current.push({ concept: b.concept, what: `"${b.text}" left unmatched`, why: b.explain, correct: mission.fixes.find((f) => f.id === b.fix)?.label ?? '' });
      }
    }
    onFinish({ score: clampScore(base + bonus), mistakes: mistakesRef.current });
  }

  function chooseFix(fixId: string) {
    if (done || !selectedBug) return;
    const bug = mission.bugs.find((b) => b.id === selectedBug)!;
    if (Object.values(placed).includes(fixId)) return; // already used
    const ok = bug.fix === fixId;
    if (ok) {
      const next = { ...placed, [bug.id]: fixId };
      setPlaced(next);
      setSelectedBug(null);
      setNote({ text: bug.explain, tone: 'good' });
      play('hit');
      if (Object.keys(next).length >= mission.bugs.length) setTimeout(finish, 400);
    } else {
      setMisses((n) => n + 1);
      mistakesRef.current.push({ concept: bug.concept, what: `Wrong fix tried for "${bug.text}"`, why: bug.explain, correct: mission.fixes.find((f) => f.id === bug.fix)?.label ?? '' });
      setNote({ text: 'That fix does not close this flaw. Try another.', tone: 'bad' });
      play('miss');
    }
  }

  const usedFixes = new Set(Object.values(placed));

  return (
    <div>
      <GameHud
        right={
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <span className="tnum" style={{ color: 'var(--muted)', fontWeight: 600, fontFamily: 'var(--font-display)' }}>
              {solvedCount} / {mission.bugs.length}
            </span>
            <TimerPill left={left} danger={left <= 20} />
          </span>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 22 }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: 10 }}>{mission.bugLabel}</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {mission.bugs.map((bug) => {
              const fix = placed[bug.id];
              const fixLabel = fix ? mission.fixes.find((f) => f.id === fix)?.label : null;
              const active = selectedBug === bug.id;
              return (
                <button
                  key={bug.id}
                  type="button"
                  disabled={done || !!fix}
                  onClick={() => setSelectedBug(active ? null : bug.id)}
                  className="panel"
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    cursor: fix || done ? 'default' : 'pointer',
                    borderColor: active ? 'var(--accent)' : fix ? 'var(--accent-dim)' : 'var(--line)',
                    background: fix ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface)',
                  }}
                >
                  <span style={{ display: 'block' }}>{bug.text}</span>
                  {fixLabel && (
                    <span style={{ display: 'block', marginTop: 6, color: '#f2a0a7', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.88rem' }}>
                      &rarr; {fixLabel}
                    </span>
                  )}
                  {!fix && active && (
                    <span style={{ display: 'block', marginTop: 6, color: 'var(--accent-text)', fontSize: '0.82rem', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
                      Now pick its fix below
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: '1.1rem', marginBottom: 10 }}>{mission.fixLabel}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {fixes.map((fix) => {
              const used = usedFixes.has(fix.id);
              const decoy = hint.active && !mission.bugs.some((b) => b.fix === fix.id);
              return (
                <button
                  key={fix.id}
                  type="button"
                  disabled={done || used || !selectedBug}
                  onClick={() => chooseFix(fix.id)}
                  className="panel-2"
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--r-sm)',
                    border: decoy ? '1px dashed var(--muted-2)' : '1px solid var(--line)',
                    opacity: used ? 0.35 : decoy ? 0.4 : 1,
                    cursor: used || done || !selectedBug ? 'default' : 'pointer',
                    fontFamily: 'var(--font-text)',
                    textAlign: 'left',
                    color: 'var(--ink)',
                  }}
                >
                  {fix.label}
                </button>
              );
            })}
          </div>
          <p style={{ color: 'var(--muted-2)', fontSize: 'var(--step-small)', marginTop: 10 }}>
            Some of these fix nothing. Pick a flaw first, then its fix.
          </p>
        </div>
      </div>

      {note && (
        <div
          className="panel pop"
          style={{ marginTop: 16, padding: '12px 16px', borderRadius: 'var(--r-sm)', borderColor: note.tone === 'good' ? 'var(--accent-dim)' : 'var(--line)' }}
        >
          {note.text}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={finish} disabled={done}>
          Finish
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {note?.text}
      </span>
    </div>
  );
}

// Deterministic shuffle so a mission always lays out the same way (testable).
function shuffle<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
