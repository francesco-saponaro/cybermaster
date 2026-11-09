import { useMemo, useRef, useState } from 'react';
import type { InspectMission, Mistake } from '../content/types';
import { GameHud } from './GameHud';
import { TimerPill, useCountdown } from '../components/MissionShell';
import type { MissionProps } from './mission';
import { useHint } from './mission';
import { accuracyScore, clampScore, timeBonus } from '../engine/scoring';
import { play } from '../engine/audio';

type LineState = 'idle' | 'hit' | 'wrong';

export function InspectMissionView({ mission, onFinish }: MissionProps<InspectMission>) {
  const totalTargets = useMemo(() => mission.docs.reduce((n, d) => n + d.targets.length, 0), [mission.docs]);
  const [flags, setFlags] = useState<Record<string, LineState>>({});
  const [found, setFound] = useState(0);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const hint = useHint();
  const mistakesRef = useRef<Mistake[]>([]);

  // Refs so finish() always scores from the latest counts, even when fired from
  // a timeout or the countdown callback.
  const foundRef = useRef(0);
  const missRef = useRef(0);
  const leftRef = useRef(mission.seconds);
  const doneRef = useRef(false);

  const running = !done;
  const left = useCountdown(mission.seconds, running, () => finish());
  leftRef.current = left;

  function key(di: number, li: number) {
    return `${di}:${li}`;
  }

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    setDone(true);
    const elapsed = mission.seconds - leftRef.current;
    const base = accuracyScore(foundRef.current, totalTargets, missRef.current, 0.6);
    const bonus = foundRef.current === totalTargets && missRef.current === 0 ? timeBonus(elapsed, 30, mission.seconds) : 0;
    // any target not flagged is a mistake for the debrief
    for (const [di, doc] of mission.docs.entries()) {
      for (const t of doc.targets) {
        if (flags[key(di, t.line)] !== 'hit') {
          mistakesRef.current.push({ concept: t.concept, what: `${doc.name}, line ${t.line + 1} not flagged`, why: t.reason, correct: doc.lines[t.line] ?? '' });
        }
      }
    }
    onFinish({ score: clampScore(base + bonus), mistakes: mistakesRef.current });
  }

  function clickLine(di: number, li: number) {
    if (doneRef.current) return;
    const k = key(di, li);
    if (flags[k]) return;
    const doc = mission.docs[di]!;
    const target = doc.targets.find((t) => t.line === li);
    if (target) {
      setFlags((f) => ({ ...f, [k]: 'hit' }));
      foundRef.current += 1;
      setFound(foundRef.current);
      setNote({ text: target.reason, tone: 'good' });
      play('hit');
      if (foundRef.current >= totalTargets) setTimeout(finish, 400);
    } else {
      setFlags((f) => ({ ...f, [k]: 'wrong' }));
      missRef.current += 1;
      mistakesRef.current.push({ concept: 'http-anatomy', what: `${doc.name}, line ${li + 1} flagged by mistake`, why: 'This line carries no weakness.', correct: 'Leave clean lines unflagged.' });
      setNote({ text: 'That line is fine. Look again.', tone: 'bad' });
      play('miss');
    }
  }

  const danger = left <= 20;

  return (
    <div>
      <GameHud
        right={
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <span className="tnum" style={{ color: 'var(--muted)', fontWeight: 600, fontFamily: 'var(--font-display)' }}>
              {found} / {totalTargets} found
            </span>
            <TimerPill left={left} danger={danger} />
          </span>
        }
      />
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>{mission.hint}</p>

      <div style={{ display: 'grid', gap: 16 }}>
        {mission.docs.map((doc, di) => (
          <div key={di} className="panel" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem' }}>
              {doc.name}
            </div>
            <div className="raw" style={{ padding: '6px 0' }}>
              {doc.lines.map((line, li) => {
                const st = flags[key(di, li)];
                const hinted = hint.active && st !== 'hit' && doc.targets.some((t) => t.line === li);
                return (
                  <button
                    key={li}
                    type="button"
                    onClick={() => clickLine(di, li)}
                    disabled={done || st === 'hit'}
                    aria-label={`Line ${li + 1}: ${line || '(blank)'}`}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '2px 16px',
                      border: 'none',
                      cursor: done ? 'default' : 'pointer',
                      color: st === 'hit' ? '#f2a0a7' : st === 'wrong' ? 'var(--muted-2)' : 'var(--ink)',
                      background:
                        st === 'hit'
                          ? 'color-mix(in srgb, var(--accent) 22%, transparent)'
                          : st === 'wrong'
                            ? 'color-mix(in srgb, var(--muted-2) 16%, transparent)'
                            : hinted
                              ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                              : 'transparent',
                      boxShadow: hinted ? 'inset 3px 0 0 var(--accent)' : 'none',
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      textDecoration: st === 'wrong' ? 'line-through' : 'none',
                    }}
                  >
                    <span style={{ color: 'var(--muted-2)', userSelect: 'none' }}>{(li + 1).toString().padStart(2, ' ')}  </span>
                    {line || ' '}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {note && (
        <div
          className="panel pop"
          data-tone={note.tone}
          style={{
            marginTop: 16,
            padding: '12px 16px',
            borderColor: note.tone === 'good' ? 'var(--accent-dim)' : 'var(--line)',
            borderRadius: 'var(--r-sm)',
          }}
        >
          {note.text}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={finish} disabled={done}>
          Submit findings
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        {note?.text}
      </span>
    </div>
  );
}
