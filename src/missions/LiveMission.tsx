import { useEffect, useRef, useState } from 'react';
import type { LiveMission, Mistake } from '../content/types';
import type { MissionProps } from './mission';
import { useHint } from './mission';
import { GameHud } from './GameHud';
import { partyColour } from '../components/Briefing';
import { clampScore, freezeScore, liveRoundScore } from '../engine/scoring';
import { play } from '../engine/audio';

type Phase = 'playing' | 'frozen' | 'fix' | 'reveal' | 'done';

// Login Lab as a live session: messages play out between the browser, server and
// attacker. Freeze the moment something goes wrong, then pick the fix from the
// belt. Too early or too late costs; the wrong fix costs more.
export function LiveMissionView({ mission, onFinish }: MissionProps<LiveMission>) {
  const [roundIndex, setRoundIndex] = useState(0);
  const [shown, setShown] = useState(1);
  const [phase, setPhase] = useState<Phase>('playing');
  const [frozenAt, setFrozenAt] = useState<number | null>(null);
  const [fixPick, setFixPick] = useState<string | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const mistakesRef = useRef<Mistake[]>([]);
  const hint = useHint();

  const round = mission.rounds[roundIndex];

  // advance the messages on a timer while playing
  useEffect(() => {
    if (phase !== 'playing' || !round) return;
    if (shown >= round.messages.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), mission.secondsPerMessage * 1000);
    return () => clearTimeout(t);
  }, [phase, shown, round, mission.secondsPerMessage]);

  if (!round) return null;

  function freeze() {
    if (phase !== 'playing') return;
    setFrozenAt(shown - 1); // the latest revealed message
    setPhase('fix');
    play('tick');
  }

  function letPlay() {
    // if the player never froze and the flow ends, they must still choose where it went wrong
    if (shown < round!.messages.length) {
      setShown((n) => Math.min(round!.messages.length, n + 1));
      return;
    }
    setFrozenAt(null);
    setPhase('fix');
    play('miss');
  }

  function chooseFix(fixId: string) {
    if (phase !== 'fix') return;
    setFixPick(fixId);
  }

  function lockFix() {
    if (fixPick === null) return;
    const fz = freezeScore(frozenAt, round!.wrongAt);
    const fixOk = fixPick === round!.fix;
    const s = liveRoundScore(fz, fixOk);
    setScores((arr) => [...arr, s]);
    if (fz < 1 || !fixOk) {
      const where = mission.rounds[roundIndex]!;
      const froze = frozenAt === null ? 'You never froze the flow' : `You froze at message ${frozenAt + 1}`;
      mistakesRef.current.push({
        concept: where.concept,
        what: `${where.title}: ${froze}${!fixOk ? ', and the fix was wrong' : ''}`,
        why: where.explain,
        correct: `Freeze at message ${where.wrongAt + 1}; fix: ${mission.fixes.find((f) => f.id === where.fix)?.label}`,
      });
    }
    play(fz === 1 && fixOk ? 'clear' : 'miss');
    setPhase('reveal');
  }

  function next() {
    if (roundIndex + 1 >= mission.rounds.length) {
      const all = [...scores];
      onFinish({ score: clampScore(all.reduce((a, b) => a + b, 0) / all.length), mistakes: mistakesRef.current });
      setPhase('done');
      return;
    }
    setRoundIndex((i) => i + 1);
    setShown(1);
    setFrozenAt(null);
    setFixPick(null);
    setPhase('playing');
  }

  const visible = round.messages.slice(0, shown);

  return (
    <div>
      <GameHud
        right={
          <span className="tnum" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
            Session {roundIndex + 1} / {mission.rounds.length}
          </span>
        }
      />
      <h2 style={{ fontSize: '1.1rem', marginBottom: 4 }}>{round.title}</h2>
      <p style={{ color: 'var(--muted)', marginTop: 0, fontSize: 'var(--step-small)' }}>
        Watch the messages. Hit freeze the moment something goes wrong.
        {hint.active ? ` Hint: it goes wrong around message ${round.wrongAt + 1}.` : ''}
      </p>

      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {visible.map((m, i) => {
          const isWrong = phase !== 'playing' && i === round.wrongAt;
          const isFrozen = frozenAt === i;
          return (
            <div
              key={i}
              className="panel rise"
              style={{
                padding: '10px 14px',
                borderColor: phase === 'reveal' && isWrong ? 'var(--accent)' : isFrozen ? 'var(--info)' : 'var(--line)',
                background: phase === 'reveal' && isWrong ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface)',
              }}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.72rem', color: partyColour(m.from), textTransform: 'capitalize' }}>
                {m.from} &rarr; {m.to}
                {phase === 'reveal' && isWrong ? '  · this is where it broke' : isFrozen && phase !== 'reveal' ? '  · frozen here' : ''}
              </span>
              <span className="raw" style={{ display: 'block', marginTop: 4, fontSize: '0.82rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</span>
            </div>
          );
        })}
      </div>

      {phase === 'playing' && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={freeze}>
            Freeze: something is wrong
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={letPlay}>
            {shown < round.messages.length ? 'Let it play' : 'Nothing looked wrong'}
          </button>
        </div>
      )}

      {phase === 'fix' && (
        <div className="rise">
          <h3 style={{ fontSize: '1rem', margin: '4px 0 10px' }}>Pick the fix from your toolbelt</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {mission.fixes.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => chooseFix(f.id)}
                className="panel"
                aria-pressed={fixPick === f.id}
                style={{ textAlign: 'left', padding: '12px 14px', cursor: 'pointer', color: 'var(--ink)', borderColor: fixPick === f.id ? 'var(--accent)' : 'var(--line)' }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={lockFix} disabled={fixPick === null} style={{ marginTop: 12 }}>
            Apply the fix
          </button>
        </div>
      )}

      {phase === 'reveal' && (
        <div className="panel pop" style={{ padding: '14px 16px', borderRadius: 'var(--r-sm)' }}>
          <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            {freezeScore(frozenAt, round.wrongAt) === 1 && fixPick === round.fix ? 'Clean catch and the right fix.' : `It broke at message ${round.wrongAt + 1}.`}
          </p>
          <p style={{ margin: 0 }}>{round.explain}</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={next} style={{ marginTop: 12 }}>
            {roundIndex + 1 >= mission.rounds.length ? 'Finish' : 'Next session'}
          </button>
        </div>
      )}
    </div>
  );
}
