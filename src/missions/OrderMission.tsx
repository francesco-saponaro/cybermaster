import { useMemo, useRef, useState } from 'react';
import type { OrderMission, Mistake } from '../content/types';
import { TimerPill, useCountdown } from '../components/MissionShell';
import { GameHud } from './GameHud';
import type { MissionProps } from './mission';
import { clampScore } from '../engine/scoring';
import { play } from '../engine/audio';

type Step = 'order' | 'sort' | 'done';

// Six Phases: first put the phases in order (move up/down), then drop each
// activity on its phase. Tap-based so it works on a phone.
export function OrderMissionView({ mission, onFinish }: MissionProps<OrderMission>) {
  const mistakesRef = useRef<Mistake[]>([]);
  const [step, setStep] = useState<Step>('order');
  const [order, setOrder] = useState(() => shuffle(mission.phases.map((p) => p.id), mission.id));
  const [orderChecked, setOrderChecked] = useState(false);
  const activities = useMemo(() => shuffle(mission.activities.map((_, i) => i), mission.id + 'a'), [mission]);
  const [assign, setAssign] = useState<Record<number, string>>({});
  const [selectedActivity, setSelectedActivity] = useState<number | null>(null);
  const [orderScore, setOrderScore] = useState(0);

  const running = step !== 'done';
  const left = useCountdown(mission.seconds, running, () => finishAll());

  const correctOrder = mission.phases.map((p) => p.id);

  function move(i: number, dir: -1 | 1) {
    if (orderChecked) return;
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
    play('blip');
  }

  function checkOrder() {
    const right = order.filter((id, i) => id === correctOrder[i]).length;
    setOrderScore((right / correctOrder.length) * 40);
    setOrderChecked(true);
    play(right === correctOrder.length ? 'hit' : 'miss');
  }

  function assignActivity(phaseId: string) {
    if (selectedActivity === null) return;
    setAssign((a) => ({ ...a, [selectedActivity]: phaseId }));
    play('blip');
    setSelectedActivity(null);
  }

  function finishAll() {
    if (step === 'done') return;
    setStep('done');
    const right = mission.activities.filter((act, i) => assign[i] === act.phase).length;
    const sortScore = (right / mission.activities.length) * 60;
    if (order.some((id, i) => id !== correctOrder[i])) {
      mistakesRef.current.push({ concept: mission.concept, what: 'The phases were not all in the right order', why: 'An assessment runs scope, recon, scan, validation, report, remediation, in that order.', correct: mission.phases.map((p) => p.name).join(' → ') });
    }
    for (const [i, act] of mission.activities.entries()) {
      if (assign[i] !== act.phase) {
        mistakesRef.current.push({ concept: mission.concept, what: `"${act.text}" was placed in the wrong phase`, why: 'Each activity belongs to one phase of the assessment.', correct: mission.phases.find((p) => p.id === act.phase)?.name ?? '' });
      }
    }
    onFinish({ score: clampScore(orderScore + sortScore), mistakes: mistakesRef.current });
  }

  const unassigned = activities.filter((i) => assign[i] === undefined);

  return (
    <div>
      <GameHud right={<TimerPill left={left} danger={left <= 25} />} />

      {step === 'order' && (
        <div>
          <h2 style={{ fontSize: '1.15rem', marginBottom: 12 }}>Put the six phases in order</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {order.map((id, i) => {
              const phase = mission.phases.find((p) => p.id === id)!;
              const correct = orderChecked && id === correctOrder[i];
              return (
                <div
                  key={id}
                  className="panel"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderColor: orderChecked ? (correct ? 'var(--good)' : 'var(--accent)') : 'var(--line)',
                  }}
                >
                  <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--accent-text)', width: 24 }}>
                    {i + 1}
                  </span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ fontFamily: 'var(--font-display)' }}>{phase.name}</strong>
                  </span>
                  {!orderChecked && (
                    <span style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>
                        &uarr;
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === order.length - 1}>
                        &darr;
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {!orderChecked ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={checkOrder} style={{ marginTop: 14 }}>
              Lock the order
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setStep('sort')} style={{ marginTop: 14 }}>
              Now sort the activities
            </button>
          )}
        </div>
      )}

      {step === 'sort' && (
        <div>
          <h2 style={{ fontSize: '1.15rem', marginBottom: 6 }}>Drop each activity on its phase</h2>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>Tap an activity, then tap the phase it belongs to.</p>

          <div className="panel-2" style={{ borderRadius: 'var(--r-sm)', padding: 12, marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem', color: 'var(--muted)' }}>
              Activities ({unassigned.length} left)
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {unassigned.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelectedActivity(selectedActivity === i ? null : i)}
                  className="panel"
                  aria-pressed={selectedActivity === i}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--r-sm)',
                    borderColor: selectedActivity === i ? 'var(--accent)' : 'var(--line)',
                    background: selectedActivity === i ? 'color-mix(in srgb, var(--accent) 16%, var(--surface))' : 'var(--surface)',
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-text)',
                    textAlign: 'left',
                    fontSize: '0.9rem',
                  }}
                >
                  {mission.activities[i]!.text}
                </button>
              ))}
              {unassigned.length === 0 && <span style={{ color: 'var(--muted-2)' }}>All placed.</span>}
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {correctOrder.map((id, i) => {
              const phase = mission.phases.find((p) => p.id === id)!;
              const here = Object.entries(assign).filter(([, pid]) => pid === id).map(([ai]) => Number(ai));
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => assignActivity(id)}
                  disabled={selectedActivity === null}
                  className="panel"
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    cursor: selectedActivity === null ? 'default' : 'pointer',
                    borderColor: selectedActivity !== null ? 'var(--accent)' : 'var(--line)',
                  }}
                >
                  <span className="tnum" style={{ color: 'var(--accent-text)', fontFamily: 'var(--font-display)', fontWeight: 800, marginRight: 8 }}>
                    {i + 1}
                  </span>
                  <strong style={{ fontFamily: 'var(--font-display)' }}>{phase.name}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: '0.82rem', display: 'block', marginTop: 2 }}>{phase.result}</span>
                  {here.map((ai) => (
                    <span
                      key={ai}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAssign((a) => {
                          const n = { ...a };
                          delete n[ai];
                          return n;
                        });
                      }}
                      className="tag"
                      style={{ marginTop: 6, marginRight: 6, cursor: 'pointer' }}
                      title="Tap to remove"
                    >
                      {mission.activities[ai]!.text}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>

          <button type="button" className="btn btn-primary" onClick={finishAll} disabled={unassigned.length > 0} style={{ marginTop: 16 }}>
            Submit the assessment
          </button>
        </div>
      )}
    </div>
  );
}

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
