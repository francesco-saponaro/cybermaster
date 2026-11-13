import { useEffect, useRef, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { ARCADE_BY_ID, type GameId } from '../../content/arcade';
import type { CardLine } from '../../content/arcade/forgery';
import { FIX_BY_ID, FIX_PAIRS } from '../../content/arcade/fixfirst';
import { HARDEN_BY_ID, HARDEN_PAIRS } from '../../content/arcade/harden';
import { actForgery, LIVES, multiplier, ROUNDS, roundMs, secondsLeft, startForgery, stepForgery, type ForgeryAction, type ForgeryState, type Side } from '../forgery';
import { ArcadeShell, Lives, score, TimeBar } from '../ui/Shell';
import { useGameKeys, useLoop, useRun } from '../ui/useRun';
import { play, playCombo } from '../../engine/audio';

/** A pair of cards: the one to pick, the one to leave, and why. */
export interface PickPair {
  id: string;
  tier: 1 | 2 | 3;
  topic: string;
  first: CardLine[];
  later: CardLine[];
  why: string;
  rule: string;
}

/** The words that make one two-card game different from another. */
interface PairGameText {
  id: GameId;
  pairs: readonly PickPair[];
  byId: Record<string, PickPair>;
  /** data-game on the cards, for the tests. */
  tag: string;
  question: string;
  right: string;
  wrong: string;
  tip: string;
  pickTag: string;
  leaveTag: string;
  ariaPick: string;
  how: string;
  overWon: string;
  review: (p: PickPair) => string;
  wrongNote: string;
}

const FIX_TEXT: PairGameText = {
  id: 'fix-first',
  pairs: FIX_PAIRS,
  byId: FIX_BY_ID,
  tag: 'fix',
  question: 'Which do you fix first?',
  right: 'Right call.',
  wrong: 'The other one comes first.',
  tip: "Two real results from Lantern's scans. Look at the score, how sure the scanner is (QoD) and who can reach the machine, then pick the one to fix first.",
  pickTag: 'Fix first',
  leaveTag: 'Can wait',
  ariaPick: 'fix this one first',
  how: 'Click or tap the one to fix first.',
  overWon: 'All twelve calls made',
  review: (p) => `Fix first: ${p.first[0]!.value} on ${p.first[1]!.value}`,
  wrongNote: 'You picked the other one.',
};

const HARDEN_TEXT: PairGameText = {
  id: 'harden-up',
  pairs: HARDEN_PAIRS,
  byId: HARDEN_BY_ID,
  tag: 'harden',
  question: 'Which one is locked down?',
  right: 'Locked down.',
  wrong: 'That one is the open door.',
  tip: 'Two versions of the same thing on lab-01: a file, a port, a service or a firewall rule. Pick the safer one.',
  pickTag: 'Safer',
  leaveTag: 'Open door',
  ariaPick: 'this one is safer',
  how: 'Click or tap the safer one.',
  overWon: 'All twelve boxes hardened',
  review: (p) => p.topic,
  wrongNote: 'You picked the open one.',
};

export function FixFirstPage() {
  return <PairGame text={FIX_TEXT} />;
}

export function HardenUpPage() {
  return <PairGame text={HARDEN_TEXT} />;
}

function PairGame({ text }: { text: PairGameText }) {
  const game = ARCADE_BY_ID[text.id];
  const { seed: fixed } = useSearch({ strict: false }) as { seed?: number };
  const [s, setS] = useState<ForgeryState>(() => startForgery(fixed ?? 0, text.pairs));
  const run = useRun(text.id, fixed, (seed) => setS(startForgery(seed, text.pairs)));

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
      overTitle={run.won ? text.overWon : 'Out of lives'}
      overLine={`${s.correct} of ${s.round + 1} right calls, best streak ${s.bestStreak}.`}
      overExtra={
        s.mistakes.length ? (
          <section className="ar-review" aria-labelledby="sf-review">
            <h3 id="sf-review">The calls to look at again</h3>
            <ul>
              {s.mistakes.map((m, i) => {
                const p = text.byId[m.pair]!;
                return (
                  <li key={i}>
                    <strong>{text.review(p)}</strong>
                    <span className="small muted"> {m.kind === 'slow' ? 'The clock ran out.' : text.wrongNote}</span>
                    <span className="why">{p.why}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null
      }
    >
      <Board s={s} act={act} text={text} />
    </ArcadeShell>
  );
}

function Board({ s, act, text }: { s: ForgeryState; act: (a: ForgeryAction) => void; text: PairGameText }) {
  const pair = text.byId[s.rounds[s.round]!]!;
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
        <h2 className="sf-q">{revealed ? (right ? text.right : s.picked === null ? 'Out of time.' : text.wrong) : text.question}</h2>
        {!revealed ? <TimeBar left={s.timeLeft / roundMs(s.round)} label={`${secondsLeft(s)} seconds left`} /> : null}
        {!revealed && s.round === 0 ? <p className="sf-tip">{text.tip}</p> : null}
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
              data-game={text.tag}
              data-forged={revealed ? isFake : undefined}
              disabled={revealed}
              onClick={() => act({ t: 'pick', side })}
              aria-label={revealed ? undefined : `${side === 'left' ? 'Left' : 'Right'} card: ${text.ariaPick}`}
            >
              <span className="sf-tag">{revealed ? (isFake ? text.pickTag : text.leaveTag) : side === 'left' ? 'A' : 'B'}</span>
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
          {text.how}<span className="hide-sm"> Keys: ← for A, → for B.</span>
        </p>
      )}
    </div>
  );
}
