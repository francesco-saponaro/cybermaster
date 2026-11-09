import { useState } from 'react';
import type { ApiMission, Mistake } from '../content/types';
import type { MissionProps } from './mission';
import { useHint } from './mission';
import { clampScore } from '../engine/scoring';
import { play } from '../engine/audio';

type Phase = 'probe' | 'fix' | 'done';

// API Gate: change the id in a request and send it. When you have seen a leak,
// pick the fix that actually enforces ownership.
export function ApiMissionView({ mission, onFinish }: MissionProps<ApiMission>) {
  const hint = useHint();
  const [phase, setPhase] = useState<Phase>('probe');
  const [current, setCurrent] = useState(mission.you.id);
  const [sent, setSent] = useState<string | null>(null);
  const [seenLeak, setSeenLeak] = useState(false);
  const [requests, setRequests] = useState(0);
  const [fixPick, setFixPick] = useState<number | null>(null);
  const [fixChecked, setFixChecked] = useState(false);

  const active = mission.ids.find((x) => x.id === sent) ?? null;

  function send() {
    const hit = mission.ids.find((x) => x.id === current);
    setSent(current);
    setRequests((n) => n + 1);
    if (hit?.leaks) {
      setSeenLeak(true);
      play('hit');
    } else {
      play('blip');
    }
  }

  function chooseFix(i: number) {
    if (fixChecked) return;
    setFixPick(i);
  }
  function submitFix() {
    if (fixPick === null) return;
    setFixChecked(true);
    const opt = mission.fixOptions[fixPick]!;
    play(opt.correct ? 'clear' : 'miss');
    // score: finding the leak is 55, the right fix is 45, with a small penalty for lots of blind requests
    const foundPts = seenLeak ? 55 : 15;
    const fixPts = opt.correct ? 45 : 0;
    const penalty = Math.max(0, requests - 4) * 3;
    const mistakes: Mistake[] = [];
    if (!seenLeak) mistakes.push({ concept: mission.concept, what: 'You filed without proving the leak', why: 'Changing the id to another owner\'s should have returned data that is not yours.', correct: 'Send the request for an id you do not own and read the response.' });
    if (!opt.correct) {
      const right = mission.fixOptions.find((f) => f.correct)!;
      mistakes.push({ concept: mission.fixConcept, what: 'The fix you shipped does not enforce ownership', why: opt.explain, correct: right.explain });
    }
    setTimeout(() => onFinish({ score: clampScore(foundPts + fixPts - penalty), mistakes }), 50);
    setPhase('done');
  }

  return (
    <div>
      <div className="panel" style={{ padding: 'clamp(16px, 3vw, 24px)', marginBottom: 16 }}>
        <p style={{ margin: '0 0 4px', fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--accent-text)' }}>{mission.you.label}</p>
        <div className="raw" style={{ background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', padding: '12px 16px', fontSize: '0.85rem' }}>
          <div>
            <span style={{ color: 'var(--accent-text)' }}>{mission.request.method}</span>{' '}
            {mission.request.path.replace('{id}', '')}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
              <input
                value={current}
                onChange={(e) => setCurrent(e.target.value.replace(/[^0-9a-zA-Z-]/g, ''))}
                disabled={phase !== 'probe'}
                aria-label="Object id"
                style={{
                  width: 90,
                  background: 'var(--surface)',
                  border: '1px solid var(--accent)',
                  borderRadius: 4,
                  color: 'var(--ink)',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  padding: '2px 6px',
                }}
              />
            </span>
          </div>
          {mission.request.headers.map((h, i) => (
            <div key={i} style={{ color: 'var(--muted)' }}>
              {h}
            </div>
          ))}
        </div>
        {phase === 'probe' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={send}>
              Send request
            </button>
            {mission.ids
              .filter((x) => x.id !== mission.you.id)
              .slice(0, 3)
              .map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCurrent(x.id)}
                  style={hint.active && x.leaks ? { borderColor: 'var(--good)', color: '#8fe0ad' } : undefined}
                >
                  Try id {x.id}
                </button>
              ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCurrent(mission.you.id)}>
              Reset to yours
            </button>
          </div>
        )}
      </div>

      {active && (
        <div className="panel pop" style={{ padding: '14px 16px', marginBottom: 16, borderLeft: `3px solid ${active.leaks ? 'var(--accent)' : 'var(--muted-2)'}` }}>
          <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            Response for id {active.id} {active.owner === 'you' ? '(yours)' : active.owner === 'nobody' ? '' : `(belongs to ${active.owner})`}
          </p>
          <div className="raw" style={{ fontSize: '0.82rem', color: active.leaks ? '#f2a0a7' : 'var(--muted)' }}>
            {active.response.map((l, i) => (
              <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {l}
              </div>
            ))}
          </div>
          {active.leaks && <p className="tag" data-tone="accent" style={{ marginTop: 10 }}>You just read another customer&apos;s data. That is the bug.</p>}
        </div>
      )}

      {phase === 'probe' && seenLeak && (
        <button type="button" className="btn btn-primary" onClick={() => setPhase('fix')}>
          I have proven the leak. Now fix it.
        </button>
      )}
      {phase === 'probe' && !seenLeak && (
        <p style={{ color: 'var(--muted)' }}>Change the id to another customer&apos;s and send, until you see data that is not yours.</p>
      )}

      {(phase === 'fix' || phase === 'done') && (
        <div className="rise">
          <h2 style={{ fontSize: '1.15rem', margin: '4px 0 12px' }}>Pick the change that closes the hole</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {mission.fixOptions.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => chooseFix(i)}
                disabled={fixChecked}
                className="panel"
                aria-pressed={fixPick === i}
                style={{
                  textAlign: 'left',
                  padding: 0,
                  overflow: 'hidden',
                  borderColor: (fixChecked || hint.active) && opt.correct ? 'var(--good)' : fixPick === i ? 'var(--accent)' : 'var(--line)',
                  cursor: fixChecked ? 'default' : 'pointer',
                }}
              >
                <pre className="raw" style={{ margin: 0, padding: '12px 16px', fontSize: '0.8rem', whiteSpace: 'pre-wrap', color: 'var(--ink)' }}>
                  {opt.code.join('\n')}
                </pre>
                {fixChecked && (
                  <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', color: opt.correct ? '#8fe0ad' : 'var(--muted)', fontFamily: 'var(--font-text)' }}>
                    {opt.explain}
                  </div>
                )}
              </button>
            ))}
          </div>
          {!fixChecked && (
            <button type="button" className="btn btn-primary btn-sm" onClick={submitFix} disabled={fixPick === null} style={{ marginTop: 14 }}>
              Ship the fix
            </button>
          )}
        </div>
      )}
    </div>
  );
}
