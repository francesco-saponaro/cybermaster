import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardsMission, Mistake } from '../content/types';
import type { MissionProps } from './mission';
import { useHint } from './mission';
import { GameHud } from './GameHud';
import { TimerPill } from '../components/MissionShell';
import { streamScore, clampScore } from '../engine/scoring';
import { play } from '../engine/audio';

// A card flies in; four answers below; a clock and a streak. One tap sorts it.
// The light mechanic for what used to be a plain matching form.
export function CardsMissionView({ mission, onFinish }: MissionProps<CardsMission>) {
  const order = useMemo(() => shuffle(mission.cards.map((_, i) => i), mission.id), [mission]);
  const [pos, setPos] = useState(0);
  const [left, setLeft] = useState(mission.secondsPerCard);
  const [correct, setCorrect] = useState(0);
  const [quick, setQuick] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const mistakesRef = useRef<Mistake[]>([]);
  const hint = useHint();

  const cardIndex = order[pos]!;
  const card = mission.cards[cardIndex]!;
  const isLast = pos + 1 >= order.length;

  // four options: the right answer plus three distractors, shuffled per card
  const options = useMemo(() => {
    const right = mission.answers.find((a) => a.id === card.answer)!;
    const others = shuffle(mission.answers.filter((a) => a.id !== card.answer), mission.id + card.id).slice(0, 3);
    return shuffle([right, ...others], mission.id + card.id + 'o');
  }, [card, mission]);

  useEffect(() => {
    if (revealed) return;
    if (left <= 0) {
      answer(null);
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, revealed]);

  function answer(id: string | null) {
    if (revealed) return;
    setPicked(id);
    setRevealed(true);
    const ok = id === card.answer;
    if (ok) {
      const ns = streak + 1;
      setStreak(ns);
      setBest((b) => Math.max(b, ns));
      setCorrect((c) => c + 1);
      if (left > mission.secondsPerCard / 2) setQuick((q) => q + 1);
      setScore((s) => s + 80 + Math.min(40, ns * 10) + (left > mission.secondsPerCard / 2 ? 20 : 0));
      play('hit');
    } else {
      setStreak(0);
      mistakesRef.current.push({
        concept: card.concept,
        what: `${card.text}: you chose ${id === null ? 'nothing in time' : mission.answers.find((a) => a.id === id)?.label}`,
        why: card.explain,
        correct: mission.answers.find((a) => a.id === card.answer)!.label,
      });
      play('miss');
    }
  }

  function next() {
    if (isLast) {
      onFinish({ score: clampScore(streamScore(correct, mission.cards.length, quick)), mistakes: mistakesRef.current });
      return;
    }
    setPos((p) => p + 1);
    setLeft(mission.secondsPerCard);
    setPicked(null);
    setRevealed(false);
  }

  return (
    <div>
      <GameHud
        combo={streak + 1}
        score={score}
        right={
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <span className="tnum" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>{pos + 1} / {mission.cards.length}</span>
            <TimerPill left={left} danger={left <= 4} />
          </span>
        }
      />

      <div key={pos} className="panel rise" style={{ padding: 'clamp(18px,4vw,28px)', textAlign: 'center', marginBottom: 14 }}>
        <p style={{ margin: 0, color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.78rem' }}>{mission.promptLabel}</p>
        <p className="raw" style={{ margin: '8px 0 0', fontSize: '1.4rem', color: 'var(--ink)', wordBreak: 'break-word' }}>{card.text}</p>
      </div>

      <p style={{ margin: '0 0 8px', color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.82rem' }}>{mission.answerLabel}</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {options.map((opt) => {
          const isRight = opt.id === card.answer;
          const isPicked = picked === opt.id;
          const dim = hint.active && !revealed && !isRight && options.indexOf(opt) >= 2; // hint narrows: fade two distractors
          return (
            <button
              key={opt.id}
              type="button"
              disabled={revealed}
              onClick={() => answer(opt.id)}
              className="panel"
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                color: 'var(--ink)',
                cursor: revealed ? 'default' : 'pointer',
                opacity: dim ? 0.4 : 1,
                borderColor: revealed && isRight ? 'var(--good)' : revealed && isPicked ? 'var(--accent)' : 'var(--line)',
                background: isPicked ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface)',
              }}
            >
              {opt.label}
              {revealed && isRight ? '  (correct)' : ''}
            </button>
          );
        })}
      </div>

      {revealed && (
        <div className="panel pop" style={{ marginTop: 14, padding: '12px 16px', borderRadius: 'var(--r-sm)', borderLeft: `3px solid ${picked === card.answer ? 'var(--good)' : 'var(--accent)'}` }}>
          <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>{picked === card.answer ? `Correct${streak > 1 ? ` · ${streak} in a row` : ''}` : 'Not that one'}</p>
          <p style={{ margin: 0 }}>{card.explain}</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={next} style={{ marginTop: 12 }}>
            {isLast ? 'Finish' : 'Next'}
          </button>
        </div>
      )}
      <span className="sr-only">Best streak {best}</span>
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
