import { useEffect, useRef, useState } from 'react';
import type { SortMission, Mistake, AuditResource } from '../content/types';
import type { MissionProps } from './mission';
import { useHint } from './mission';
import { GameHud } from './GameHud';
import { TimerPill } from '../components/MissionShell';
import { streamScore, clampScore } from '../engine/scoring';
import { play } from '../engine/audio';

type Stage = 'sorting' | 'reason' | 'reveal' | 'done';

// Cookie Jar: items slide in one at a time under a clock. Flick each to fine or
// fix; when it needs fixing, pick the reason. Accuracy is most of the score,
// speed a small bonus.
export function SortMissionView({ mission, onFinish }: MissionProps<SortMission>) {
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<Stage>('sorting');
  const [verdict, setVerdict] = useState<boolean | null>(null);
  const [reason, setReason] = useState<number | null>(null);
  const [left, setLeft] = useState(mission.secondsPerItem);
  const [correct, setCorrect] = useState(0);
  const [quick, setQuick] = useState(0);
  const [score, setScore] = useState(0);
  const mistakesRef = useRef<Mistake[]>([]);
  const hint = useHint();

  const item = mission.items[index]!;
  const isLast = index + 1 >= mission.items.length;

  useEffect(() => {
    if (stage !== 'sorting') return;
    if (left <= 0) {
      decide(null);
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, stage]);

  function decide(flick: boolean | null) {
    if (stage !== 'sorting') return;
    setVerdict(flick);
    if (flick === true && item.exposed) {
      // needs a reason
      setStage('reason');
      return;
    }
    grade(flick, null);
  }

  function grade(flick: boolean | null, reasonIdx: number | null) {
    const verdictOk = flick === item.exposed;
    const reasonOk = !item.exposed || reasonIdx === item.answer;
    const ok = verdictOk && reasonOk;
    if (ok) {
      setCorrect((c) => c + 1);
      if (left > mission.secondsPerItem / 2) setQuick((q) => q + 1);
      setScore((s) => s + (left > mission.secondsPerItem / 2 ? 100 : 80));
      play('hit');
    } else {
      mistakesRef.current.push({
        concept: item.concept,
        what: `${item.name}: you said ${flick === null ? 'nothing in time' : flick ? mission.badLabel.toLowerCase() : mission.okLabel.toLowerCase()}`,
        why: item.explain,
        correct: item.exposed ? `${mission.badLabel}: ${item.reasons[item.answer]}` : `${mission.okLabel}`,
      });
      play('miss');
    }
    setReason(reasonIdx);
    setStage('reveal');
  }

  function next() {
    if (isLast) {
      onFinish({ score: clampScore(streamScore(correct, mission.items.length, quick)), mistakes: mistakesRef.current });
      setStage('done');
      return;
    }
    setIndex((i) => i + 1);
    setStage('sorting');
    setVerdict(null);
    setReason(null);
    setLeft(mission.secondsPerItem);
  }

  return (
    <div>
      <GameHud
        score={score}
        right={
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <span className="tnum" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>{index + 1} / {mission.items.length}</span>
            <TimerPill left={left} danger={left <= 5} />
          </span>
        }
      />

      <div key={index} className="panel rise" style={{ padding: 'clamp(16px,3vw,24px)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
          <span className="tag">{item.type}</span>
          <h2 style={{ fontSize: '1.1rem' }}>{item.name}</h2>
        </div>
        <div className="panel-2 raw" style={{ borderRadius: 'var(--r-sm)', padding: '12px 16px', margin: '10px 0', fontSize: '0.82rem', lineHeight: 1.7 }}>
          {item.config.map((line, i) => (
            <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: hint.active && item.exposed ? 'var(--accent-text)' : 'var(--ink)' }}>{line}</div>
          ))}
        </div>

        {stage === 'sorting' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={() => decide(false)}>
              &larr; {mission.okLabel}
            </button>
            <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => decide(true)}>
              {mission.badLabel} &rarr;
            </button>
          </div>
        )}

        {stage === 'reason' && (
          <div className="rise">
            <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.9rem' }}>Why does it need fixing?</p>
            <div style={{ display: 'grid', gap: 6 }}>
              {item.reasons.map((r, i) => (
                <button key={i} type="button" className="panel-2" onClick={() => grade(true, i)} style={{ textAlign: 'left', padding: '10px 14px', borderRadius: 'var(--r-sm)', border: '1px solid var(--line)', color: 'var(--ink)', cursor: 'pointer' }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === 'reveal' && (
          <div className="pop">
            <div className="panel-2" style={{ borderRadius: 'var(--r-sm)', padding: '12px 16px', borderLeft: `3px solid ${verdict === item.exposed && (!item.exposed || reason === item.answer) ? 'var(--good)' : 'var(--accent)'}` }}>
              <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                {verdict === item.exposed && (!item.exposed || reason === item.answer) ? 'Correct' : item.exposed ? `This one needs fixing` : 'This one is fine'}
              </p>
              <p style={{ margin: 0 }}>{item.explain}</p>
            </div>
            <button type="button" className="btn btn-primary btn-sm" onClick={next} style={{ marginTop: 12 }}>
              {isLast ? 'Finish' : 'Next'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export type { AuditResource };
