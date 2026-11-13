import { useEffect, useRef, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { ARCADE_BY_ID } from '../../content/arcade';
import type { CardLine } from '../../content/arcade/forgery';
import { FIX_BY_ID, FIX_PAIRS } from '../../content/arcade/fixfirst';
import { actForgery, LIVES, multiplier, ROUNDS, roundMs, secondsLeft, startForgery, stepForgery, type ForgeryAction, type ForgeryState, type Side } from '../forgery';
import { ArcadeShell, Lives, score, TimeBar } from '../ui/Shell';
import { useGameKeys, useLoop, useRun } from '../ui/useRun';
import { play, playCombo } from '../../engine/audio';

const game = ARCADE_BY_ID['fix-first'];

export function FixFirstPage() {
  const { seed: fixed } = useSearch({ strict: false }) as { seed?: number };
  const [s, setS] = useState<ForgeryState>(() => startForgery(fixed ?? 0, FIX_PAIRS));
  const run = useRun('fix-first', fixed, (seed) => setS(startForgery(seed, FIX_PAIRS)));

  // With reduced motion the clock runs a little slower, as in the other games.
  const pace = run.reduced ? 0.8 : 1;
  useLoop(run.phase === 'play', (dt) => setS((x) => stepForgery(x, dt * pace)));

  const act = (a: ForgeryAction) => {
    if (run.phase !== 'play') return;
    setS((x) => actForgery(x, a));
  };

  // A sound for each answer.
  const lastRound = useRef(-1);
  useEffect(() => {
    if (s.stage !== 'reveal' || lastRound.current === s.round) return;
    lastRound.current = s.round;
    if (s.gained > 0) {
      play('blip');
      playCombo(s.streak);
    } else play('miss');
  }, [s.stage, s.round, s.gained, s.streak]);
  useEffect(() => {
    if (s.round === 0 && s.stage === 'ask') lastRound.current = -1;
  }, [s.round, s.stage]);

  useEffect(() => {
    if (s.over && run.phase === 'play') run.finish(s.score, s.won);
  }, [s.over, s.score, s.won, run]);

  useGameKeys(run.phase === 'play', (e) => {
    switch (e.key) {
      case 'ArrowLeft':
      case '1':
        act({ t: 'pick', side: 'left' });
        return true;
      case 'ArrowRight':
      case '2':
        act({ t: 'pick', side: 'right' });
        return true;
      case 'Enter':
      case ' ':
        act({ t: 'next' });
        return true;
      default:
        return false;
    }
  });

  const hud = [
    { label: 'Score', value: score(s.score) },
    { label: 'Lives', value: <Lives left={s.lives} of={LIVES} />, aria: `${s.lives} of ${LIVES}`, tone: s.lives === 1 ? ('warn' as const) : undefined },
    { label: 'Round', value: `${Math.min(s.round + 1, ROUNDS)} / ${ROUNDS}` },
    { label: 'Streak', value: `${s.streak} · x${multiplier(s.streak)}` },
  ];

  return (
    <ArcadeShell
      game={game}
      run={run}
      hud={hud}
      overTitle={run.won ? 'All twelve calls made' : 'Out of lives'}
      overLine={`${s.correct} of ${s.round + 1} right calls, best streak ${s.bestStreak}.`}
      overExtra={
        s.mistakes.length ? (
          <section className="ar-review" aria-labelledby="sf-review">
            <h3 id="sf-review">The calls to look at again</h3>
            <ul>
              {s.mistakes.map((m, i) => {
                const p = FIX_BY_ID[m.pair]!;
                return (
                  <li key={i}>
                    <strong>
                      Fix first: {p.first[0]!.value} on {p.first[1]!.value}
                    </strong>
                    <span className="small muted"> {m.kind === 'slow' ? 'The clock ran out.' : 'You picked the other one.'}</span>
                    <span className="why">{p.why}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null
      }
    >
      <Board s={s} act={act} />
    </ArcadeShell>
  );
}

function Board({ s, act }: { s: ForgeryState; act: (a: ForgeryAction) => void }) {
  const pair = FIX_BY_ID[s.rounds[s.round]!]!;
  const forgedSide = s.sides[s.round]!;
  const cards: Record<Side, CardLine[]> = forgedSide === 'left' ? { left: pair.first, right: pair.later } : { left: pair.later, right: pair.first };
  const revealed = s.stage === 'reveal';
  const right = revealed && s.picked === forgedSide;
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (revealed) nextRef.current?.focus();
  }, [revealed]);
  const last = s.lives <= 0 || s.round + 1 >= ROUNDS;

  return (
    <div className="sf" data-stage={s.stage}>
      <div className="sf-ask">
        <p className="sf-topic">{pair.topic}.</p>
        <h2 className="sf-q">{revealed ? (right ? 'Right call.' : s.picked === null ? 'Out of time.' : 'The other one comes first.') : 'Which do you fix first?'}</h2>
        {!revealed ? <TimeBar left={s.timeLeft / roundMs(s.round)} label={`${secondsLeft(s)} seconds left`} /> : null}
        {!revealed && s.round === 0 ? <p className="sf-tip">Two real results from Lantern's scans. Look at the score, how sure the scanner is (QoD) and who can reach the machine, then pick the one to fix first.</p> : null}
      </div>
      <div className="sf-cards">
        {(['left', 'right'] as const).map((side) => {
          const lines = cards[side];
          const isFake = side === forgedSide;
          const state = !revealed ? 'open' : isFake ? 'forged' : 'real';
          return (
            <button
              key={side}
              type="button"
              className="sf-card"
              data-side={side}
              data-state={state}
              data-picked={s.picked === side}
              data-testid={`card-${side}`}
              data-game="fix"
              data-forged={revealed ? isFake : undefined}
              disabled={revealed}
              onClick={() => act({ t: 'pick', side })}
              aria-label={revealed ? undefined : `${side === 'left' ? 'Left' : 'Right'} card: fix this one first`}
            >
              <span className="sf-tag">{revealed ? (isFake ? 'Fix first' : 'Can wait') : side === 'left' ? 'A' : 'B'}</span>
              <dl>
                {lines.map((l, i) => {
                  return (
                    <div key={i}>
                      <dt>{l.label}</dt>
                      <dd>
                        <code>{l.value}</code>
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </button>
          );
        })}
      </div>
      {revealed ? (
        <section className="sf-explain" data-ok={right} aria-live="polite" data-testid="sf-explain">
          <p>
            {right ? <strong className="sf-gain">+{s.gained}</strong> : <strong className="sf-lost">−1 life</strong>} {pair.why}
          </p>
          <p className="sf-rule">
            <strong>Rule:</strong> {pair.rule}
          </p>
          <div className="ar-actions">
            <button ref={nextRef} type="button" className="cbtn cbtn-go" onClick={() => act({ t: 'next' })}>
              {last ? 'See the results' : 'Next round'}
            </button>
            <span className="small muted hide-sm">or press Enter</span>
          </div>
        </section>
      ) : (
        <p className="sf-how small muted">
          Click or tap the one to fix first.<span className="hide-sm"> Keys: ← for A, → for B.</span>
        </p>
      )}
    </div>
  );
}
