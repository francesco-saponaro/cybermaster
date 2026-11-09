import { useEffect, useState } from 'react';
import type { TriageMission, Verdict } from '../content/types';
import { GameHud } from './GameHud';
import { TimerPill } from '../components/MissionShell';
import { clampScore } from '../engine/scoring';
import { play } from '../engine/audio';

const VERDICTS: { id: Verdict; label: string; tone: 'good' | 'bad' | 'warn' }[] = [
  { id: 'true', label: 'True positive', tone: 'good' },
  { id: 'false', label: 'False positive', tone: 'bad' },
  { id: 'validate', label: 'Needs validation', tone: 'warn' },
];

// Scanner vs Analyst: a stream of findings with evidence. Judge each against a
// per-item clock. Accuracy is most of the score; speed is a small bonus.
export function TriageMissionView({ mission, onFinish }: { mission: TriageMission; onFinish: (score: number) => void }) {
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [combo, setCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(mission.secondsPerItem);
  const [answered, setAnswered] = useState<Verdict | null>(null);
  const [speedBonus, setSpeedBonus] = useState(0);

  const item = mission.items[index]!;
  const isLast = index + 1 >= mission.items.length;

  useEffect(() => {
    if (answered) return;
    if (left <= 0) {
      answer(null);
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, answered]);

  function answer(verdict: Verdict | null) {
    if (answered) return;
    const v = verdict ?? ('timeout' as Verdict);
    setAnswered(verdict ?? 'validate');
    const ok = verdict === item.answer;
    if (ok) {
      const nc = combo + 1;
      const mult = Math.min(4, 1 + Math.floor(nc / 3));
      const quick = left > mission.secondsPerItem / 2 ? 20 : 10;
      setSpeedBonus(quick);
      setCorrect((c) => c + 1);
      setCombo(nc);
      setScore((s) => s + 80 * mult + quick);
      play('hit');
    } else {
      setSpeedBonus(0);
      setCombo(0);
      play('miss');
    }
    void v;
  }

  function next() {
    if (isLast) {
      const base = (correct / mission.items.length) * 90;
      const bonus = Math.min(10, (score / (mission.items.length * 160)) * 10);
      onFinish(clampScore(base + bonus));
      return;
    }
    setIndex((i) => i + 1);
    setAnswered(null);
    setLeft(mission.secondsPerItem);
    setSpeedBonus(0);
  }

  return (
    <div>
      <GameHud
        score={score}
        combo={combo}
        right={
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <span className="tnum" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              {index + 1} / {mission.items.length}
            </span>
            <TimerPill left={left} danger={left <= 8} />
          </span>
        }
      />

      <div className="panel" style={{ padding: 'clamp(16px, 3vw, 24px)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <span className="tag">{item.tool}</span>
        </div>
        <h2 style={{ fontSize: '1.2rem', marginBottom: 6 }}>{item.title}</h2>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>Scanner says: {item.scannerSays}</p>
        <div className="panel-2" style={{ borderRadius: 'var(--r-sm)', padding: '12px 16px', margin: '12px 0' }}>
          <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem' }}>Your evidence</p>
          <ul className="raw" style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem', lineHeight: 1.7 }}>
            {item.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>

        {!answered ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {VERDICTS.map((v) => (
              <button key={v.id} type="button" className="btn btn-ghost" onClick={() => answer(v.id)}>
                {v.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="pop">
            <div
              className="panel-2"
              style={{
                borderRadius: 'var(--r-sm)',
                padding: '12px 16px',
                borderLeft: `3px solid ${answered === item.answer ? 'var(--good)' : 'var(--accent)'}`,
              }}
            >
              <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                {answered === item.answer ? 'Correct' : `The call was: ${VERDICTS.find((v) => v.id === item.answer)?.label}`}
                {speedBonus > 0 ? ` · +${speedBonus} speed` : ''}
              </p>
              <p style={{ margin: 0 }}>{item.explain}</p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={next} style={{ marginTop: 12 }}>
              {isLast ? 'Finish' : 'Next finding'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
