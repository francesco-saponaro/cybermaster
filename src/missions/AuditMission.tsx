import { useRef, useState } from 'react';
import type { AuditMission, Mistake } from '../content/types';
import { GameHud } from './GameHud';
import type { MissionProps } from './mission';
import { useHint } from './mission';
import { clampScore } from '../engine/scoring';
import { play } from '../engine/audio';

// Cloud Watch: for each resource decide ok vs bad, and if bad pick the reason.
// Scored on the verdict and the reason together.
export function AuditMissionView({ mission, onFinish }: MissionProps<AuditMission>) {
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [got, setGot] = useState(0); // points of correctness accumulated
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [reason, setReason] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const hint = useHint();
  const mistakesRef = useRef<Mistake[]>([]);

  const r = mission.resources[index]!;
  const isLast = index + 1 >= mission.resources.length;

  function submit() {
    if (checked || verdict === null) return;
    if (r.exposed && reason === null) return;
    setChecked(true);
    const verdictOk = verdict === r.exposed;
    const reasonOk = !r.exposed || reason === r.answer;
    let add = 0;
    if (r.exposed) add = (verdictOk ? 0.6 : 0) + (verdictOk && reasonOk ? 0.4 : 0);
    else add = verdictOk ? 1 : 0;
    setGot((g) => g + add);
    setScore((s) => s + Math.round(add * 100));
    if (!(verdictOk && reasonOk)) {
      mistakesRef.current.push({
        concept: r.concept,
        what: `${r.name}: you said ${verdict ? mission.badLabel.toLowerCase() : mission.okLabel.toLowerCase()}${r.exposed && !reasonOk ? ' (reason off)' : ''}`,
        why: r.explain,
        correct: r.exposed ? `${mission.badLabel}: ${r.reasons[r.answer]}` : mission.okLabel,
      });
    }
    play(verdictOk && reasonOk ? 'hit' : 'miss');
  }

  function next() {
    if (isLast) {
      onFinish({ score: clampScore(((got) / mission.resources.length) * 100), mistakes: mistakesRef.current });
      return;
    }
    setIndex((i) => i + 1);
    setVerdict(null);
    setReason(null);
    setChecked(false);
  }

  return (
    <div>
      <GameHud
        score={score}
        right={
          <span className="tnum" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            {index + 1} / {mission.resources.length}
          </span>
        }
      />

      <div className="panel" style={{ padding: 'clamp(16px, 3vw, 24px)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <span className="tag">{r.type}</span>
          <h2 style={{ fontSize: '1.15rem' }}>{r.name}</h2>
        </div>
        <div className="panel-2 raw" style={{ borderRadius: 'var(--r-sm)', padding: '12px 16px', margin: '10px 0', fontSize: '0.82rem', lineHeight: 1.7 }}>
          {r.config.map((line, i) => (
            <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: hint.active && r.exposed ? 'var(--accent-text)' : 'var(--ink)' }}>
              {line}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[false, true].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => !checked && setVerdict(val)}
              disabled={checked}
              className="panel"
              aria-pressed={verdict === val}
              style={{
                flex: 1,
                padding: '12px',
                borderColor: verdict === val ? 'var(--accent)' : hint.active && !checked && val === r.exposed ? 'var(--good)' : 'var(--line)',
                background: verdict === val ? 'color-mix(in srgb, var(--accent) 16%, var(--surface))' : hint.active && !checked && val === r.exposed ? 'color-mix(in srgb, var(--good) 12%, var(--surface))' : 'var(--surface)',
                cursor: checked ? 'default' : 'pointer',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                color: 'var(--ink)',
              }}
            >
              {val ? mission.badLabel : mission.okLabel}
            </button>
          ))}
        </div>

        {verdict === true && (
          <div className="rise" style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.9rem' }}>Why? Pick the real reason.</p>
            <div style={{ display: 'grid', gap: 6 }}>
              {r.reasons.map((reasonText, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => !checked && setReason(i)}
                  disabled={checked}
                  className="panel-2"
                  aria-pressed={reason === i}
                  style={{
                    textAlign: 'left',
                    padding: '10px 14px',
                    borderRadius: 'var(--r-sm)',
                    border: `1px solid ${checked && i === r.answer ? 'var(--good)' : reason === i ? 'var(--accent)' : 'var(--line)'}`,
                    background: reason === i ? 'color-mix(in srgb, var(--accent) 14%, var(--surface-2))' : 'var(--surface-2)',
                    color: 'var(--ink)',
                    cursor: checked ? 'default' : 'pointer',
                    fontFamily: 'var(--font-text)',
                  }}
                >
                  {reasonText}
                  {checked && i === r.answer ? ' (correct)' : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {!checked ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={verdict === null || (verdict === true && reason === null)}>
            Submit
          </button>
        ) : (
          <div className="pop">
            <div
              className="panel-2"
              style={{ borderRadius: 'var(--r-sm)', padding: '12px 16px', borderLeft: `3px solid ${verdict === r.exposed ? 'var(--good)' : 'var(--accent)'}` }}
            >
              <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                {verdict === r.exposed ? 'Correct' : r.exposed ? `This one is ${mission.badLabel.toLowerCase()}` : `This one is ${mission.okLabel.toLowerCase()}`}
              </p>
              <p style={{ margin: 0 }}>{r.explain}</p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={next} style={{ marginTop: 12 }}>
              {isLast ? 'Finish' : 'Next resource'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
