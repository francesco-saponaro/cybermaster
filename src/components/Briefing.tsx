import { useEffect, useRef, useState } from 'react';
import type { Briefing as BriefingData, BriefingBeat } from '../content/types';
import { startSteps, attempt, tokensOf, type BeatInput, type StepState } from '../engine/steps';
import { Scope } from './Scope';
import { CODEX_BY_ID } from '../content/codex';
import { play } from '../engine/audio';

// A guided walk-through: the mentor shows real material, you do one thing, the
// next beat appears. Pure state lives in the step engine; this is the view.
export function Briefing({
  briefing,
  mentor,
  onDone,
  onSkip,
}: {
  briefing: BriefingData;
  mentor: string;
  onDone: () => void;
  onSkip?: () => void;
}) {
  const [state, setState] = useState<StepState>(startSteps);
  const [feedback, setFeedback] = useState<string | null>(null);
  const liveRef = useRef<HTMLParagraphElement | null>(null);

  const beat = briefing.beats[state.index];

  useEffect(() => {
    if (state.done) {
      const t = setTimeout(onDone, 500);
      return () => clearTimeout(t);
    }
    return;
  }, [state.done, onDone]);

  function send(input: BeatInput) {
    if (state.done || !beat) return;
    const r = attempt(briefing, state, input);
    if (r.ok) {
      play(r.state.revealed.length > state.revealed.length ? 'unlock' : 'hit');
      setFeedback(beat.then);
    } else {
      play('miss');
      setFeedback(beat.wrong ?? 'Not that one. Look again, then tap what I described.');
    }
    setState(r.state);
  }

  if (state.done || !beat) {
    return (
      <div className="panel rise" style={{ padding: 'clamp(20px,4vw,36px)', maxWidth: 680, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ display: 'grid', placeItems: 'center', marginBottom: 10 }}>
          <Scope size={72} cleared />
        </div>
        <h2 style={{ fontSize: 'var(--step-head)' }}>Briefing done</h2>
        <p style={{ color: 'var(--muted)' }}>You have seen every idea this mission asks about. Time to prove it.</p>
      </div>
    );
  }

  const progress = (state.index) / briefing.beats.length;

  return (
    <div className="rise" style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', color: 'var(--accent-text)' }}>
          Briefing · {state.index + 1} of {briefing.beats.length}
        </span>
        <div className="meter" style={{ flex: 1, maxWidth: 220 }}>
          <span style={{ width: `${progress * 100}%` }} />
        </div>
        {onSkip && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSkip} style={{ marginLeft: 'auto' }}>
            I know this, skip
          </button>
        )}
      </div>

      <MentorLine mentor={mentor} text={beat.say} />

      <div style={{ marginTop: 16 }}>
        <BeatMaterialView beat={beat} onInput={send} />
      </div>

      {feedback && (
        <div
          className="panel pop"
          data-tone={feedback === beat.then ? 'good' : 'bad'}
          style={{ marginTop: 16, padding: '12px 16px', borderRadius: 'var(--r-sm)', borderColor: feedback === beat.then ? 'var(--accent-dim)' : 'var(--line)' }}
        >
          {feedback}
          {feedback === beat.then && beat.codex && CODEX_BY_ID[beat.codex] && (
            <span style={{ display: 'block', marginTop: 8, color: 'var(--accent-text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.85rem' }}>
              Codex: {CODEX_BY_ID[beat.codex]!.title}
            </span>
          )}
        </div>
      )}
      <p ref={liveRef} className="sr-only" aria-live="polite">
        {feedback}
      </p>
    </div>
  );
}

function MentorLine({ mentor, text }: { mentor: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <span style={{ flexShrink: 0 }}>
        <Scope size={42} filled />
      </span>
      <div className="panel" style={{ padding: '12px 16px', flex: 1 }}>
        <p style={{ margin: 0, color: 'var(--accent-text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.78rem' }}>{mentor}</p>
        <p style={{ margin: '4px 0 0' }}>{text}</p>
      </div>
    </div>
  );
}

function BeatMaterialView({ beat, onInput }: { beat: BriefingBeat; onInput: (i: BeatInput) => void }) {
  const action = beat.action;
  // The choice options render below whatever material the beat shows.
  const choices =
    action.kind === 'choose' ? (
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {action.options.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onInput({ kind: 'choice', index: i })}
            className="panel"
            style={{ textAlign: 'left', padding: '12px 14px', cursor: 'pointer', color: 'var(--ink)' }}
          >
            {opt}
          </button>
        ))}
      </div>
    ) : null;
  return (
    <>
      <MaterialBlock beat={beat} onInput={onInput} />
      {choices}
    </>
  );
}

function MaterialBlock({ beat, onInput }: { beat: BriefingBeat; onInput: (i: BeatInput) => void }) {
  const mat = beat.material;
  const action = beat.action;

  if (mat.kind === 'lines') {
    return (
      <div className="panel" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem' }}>{mat.title}</div>
        <div className="raw" style={{ padding: '6px 0' }}>
          {mat.lines.map((line, li) => {
            const tokenMode = action.kind === 'tap-token' && action.line === li;
            return (
              <div key={li} style={{ display: 'flex', padding: '2px 16px', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--muted-2)', userSelect: 'none', flexShrink: 0 }}>{(li + 1).toString().padStart(2, ' ')}&nbsp;&nbsp;</span>
                {tokenMode ? (
                  <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {tokensOf(line).map((tok, ti) => {
                      const tappable = /\S/.test(tok);
                      return tappable ? (
                        <button
                          key={ti}
                          type="button"
                          onClick={() => onInput({ kind: 'token', line: li, token: tok })}
                          className="token-tap"
                          style={{ font: 'inherit', color: 'inherit', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
                        >
                          {tok}
                        </button>
                      ) : (
                        <span key={ti}>{tok}</span>
                      );
                    })}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onInput({ kind: 'line', line: li })}
                    disabled={action.kind !== 'tap-line'}
                    aria-label={`Line ${li + 1}: ${line || '(blank)'}`}
                    style={{
                      font: 'inherit',
                      textAlign: 'left',
                      flex: 1,
                      color: 'var(--ink)',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      cursor: action.kind === 'tap-line' ? 'pointer' : 'default',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {line || ' '}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (mat.kind === 'cards') {
    return (
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {mat.cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onInput({ kind: 'card', card: card.id })}
            className="panel"
            style={{ textAlign: 'left', padding: '14px 16px', cursor: 'pointer', color: 'var(--ink)' }}
          >
            <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', color: 'var(--accent-text)' }}>{card.title}</p>
            <div className="raw" style={{ fontSize: '0.8rem' }}>
              {card.lines.map((l, i) => (
                <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{l}</div>
              ))}
            </div>
          </button>
        ))}
      </div>
    );
  }

  if (mat.kind === 'flow') {
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {mat.messages.map((m, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onInput({ kind: 'message', index: i })}
            disabled={action.kind !== 'tap-message'}
            className="panel"
            style={{
              textAlign: 'left',
              padding: '10px 14px',
              cursor: action.kind === 'tap-message' ? 'pointer' : 'default',
              color: 'var(--ink)',
              borderColor: 'var(--line)',
            }}
          >
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.72rem', color: partyColour(m.from), textTransform: 'capitalize' }}>
              {m.from} &rarr; {m.to}
            </span>
            <span className="raw" style={{ display: 'block', marginTop: 4, fontSize: '0.82rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</span>
          </button>
        ))}
      </div>
    );
  }

  return null;
}

export function partyColour(p: 'browser' | 'server' | 'attacker'): string {
  return p === 'attacker' ? 'var(--accent-text)' : p === 'server' ? 'var(--info)' : 'var(--muted)';
}
