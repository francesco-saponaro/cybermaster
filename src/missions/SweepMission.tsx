import { useEffect, useRef, useState } from 'react';
import type { SweepMission, Mistake } from '../content/types';
import type { MissionProps } from './mission';
import { useHint } from './mission';
import { clampScore } from '../engine/scoring';
import { play } from '../engine/audio';

type Phase = 'scanning' | 'read' | 'q1' | 'q2' | 'done';

// Port Sweep: a radar sweep reveals the host's open ports, then you read the
// output and answer. The radar is a canvas; everything else is data.
export function SweepMissionView({ mission, onFinish }: MissionProps<SweepMission>) {
  const [phase, setPhase] = useState<Phase>('scanning');
  const [revealed, setRevealed] = useState(0);
  const [q1Pick, setQ1Pick] = useState<number | null>(null);
  const [q2Pick, setQ2Pick] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hint = useHint();

  // reveal ports one by one during the scan
  useEffect(() => {
    if (phase !== 'scanning') return;
    if (revealed >= mission.ports.length) {
      const t = setTimeout(() => setPhase('read'), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setRevealed((n) => n + 1);
      play('tick');
    }, 550);
    return () => clearTimeout(t);
  }, [phase, revealed, mission.ports.length]);

  // radar animation
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext('2d');
    if (!context) return;
    const canvas = canvasEl; // non-null locals keep their type inside the closures below
    const ctx = context;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let angle = 0;
    const read = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#fff';
    const accent = read('--accent');
    const ink = read('--ink');
    const muted = read('--muted-2');

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function frame() {
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) / 2 - 8;
      ctx.clearRect(0, 0, W, H);
      // rings
      ctx.strokeStyle = muted;
      ctx.globalAlpha = 0.4;
      for (let i = 1; i <= 3; i += 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, (R * i) / 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - R, cy);
      ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R);
      ctx.lineTo(cx, cy + R);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // sweep arm (only while scanning)
      if (phase === 'scanning' && !reduce) {
        angle += 0.05;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        const grad = ctx.createLinearGradient(0, 0, R, 0);
        grad.addColorStop(0, accent);
        grad.addColorStop(1, 'transparent');
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(R, 0);
        ctx.stroke();
        void grad;
        ctx.restore();
      }

      // port blips
      mission.ports.forEach((p, i) => {
        if (i >= revealed) return;
        const a = (i / mission.ports.length) * Math.PI * 2 - Math.PI / 2;
        const rr = R * (0.4 + ((i % 3) * 0.2 + 0.1));
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ink;
        ctx.font = '600 11px "Libre Franklin Variable", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(p.port), px, py - 9);
      });

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [phase, revealed, mission.ports]);

  function answerQ1() {
    if (q1Pick === null) return;
    play(q1Pick === mission.answer ? 'hit' : 'miss');
    if (mission.secondQuestion) setPhase('q2');
    else grade(q1Pick === mission.answer, true);
  }
  function answerQ2() {
    if (q2Pick === null || !mission.secondQuestion) return;
    play(q2Pick === mission.secondQuestion.answer ? 'hit' : 'miss');
    grade(q1Pick === mission.answer, q2Pick === mission.secondQuestion.answer);
  }
  function grade(q1ok: boolean, q2ok: boolean) {
    setPhase('done');
    let s = 0;
    if (mission.secondQuestion) {
      s = (q1ok ? 60 : 0) + (q2ok ? 40 : 0);
    } else {
      s = q1ok ? 100 : 20;
    }
    const mistakes: Mistake[] = [];
    if (!q1ok) {
      const p = mission.ports[mission.answer]!;
      mistakes.push({ concept: mission.concept, what: mission.question, why: mission.explain, correct: `${p.port}/${p.proto} ${p.service}` });
    }
    if (mission.secondQuestion && !q2ok) {
      mistakes.push({ concept: mission.secondQuestion.concept, what: mission.secondQuestion.prompt, why: mission.secondQuestion.explain, correct: mission.secondQuestion.options[mission.secondQuestion.answer] ?? '' });
    }
    onFinish({ score: clampScore(s), mistakes });
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 20 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 240px', minWidth: 220 }}>
            <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>Target: {mission.host}</p>
            <div className="panel" style={{ padding: 10, aspectRatio: '1', maxWidth: 320 }}>
              <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} aria-label="Radar sweep of the host" />
            </div>
            {phase === 'scanning' && (
              <p className="tnum pulse-ring" style={{ color: 'var(--accent-text)', fontFamily: 'var(--font-display)', fontWeight: 700, marginTop: 8 }}>
                Scanning... {revealed}/{mission.ports.length} ports
              </p>
            )}
          </div>

          <div style={{ flex: '2 1 320px', minWidth: 280 }}>
            <p style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontWeight: 700 }}>Scan output</p>
            <div className="panel raw" style={{ padding: 0, overflow: 'hidden' }}>
              {mission.ports.map((p, i) => (
                <div
                  key={p.port}
                  className={i < revealed ? 'rise' : undefined}
                  style={{
                    padding: '8px 14px',
                    borderBottom: i < mission.ports.length - 1 ? '1px solid var(--line)' : 'none',
                    opacity: i < revealed ? 1 : 0.12,
                    transition: 'opacity 0.3s',
                    boxShadow: hint.active && phase !== 'scanning' && i === mission.answer ? 'inset 3px 0 0 var(--accent)' : 'none',
                    background: hint.active && phase !== 'scanning' && i === mission.answer ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent',
                  }}
                >
                  <span style={{ color: 'var(--accent-text)' }}>
                    {p.port}/{p.proto}
                  </span>{' '}
                  open{'  '}
                  <span style={{ color: 'var(--ink)' }}>{p.service}</span>{' '}
                  <span style={{ color: 'var(--muted)' }}>{p.version}</span>
                  {(phase === 'read' || phase === 'q1' || phase === 'q2' || phase === 'done') && (
                    <div style={{ color: 'var(--muted-2)', fontSize: '0.8rem', fontFamily: 'var(--font-text)', marginTop: 2 }}>{p.note}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {phase === 'read' && (
          <button type="button" className="btn btn-primary" onClick={() => setPhase('q1')}>
            I have read the output
          </button>
        )}

        {(phase === 'q1' || (phase === 'q2' && false)) && (
          <Question
            prompt={mission.question}
            options={mission.ports.map((p) => `${p.port}/${p.proto} ${p.service} (${p.version})`)}
            pick={q1Pick}
            onPick={setQ1Pick}
            onSubmit={answerQ1}
          />
        )}

        {phase === 'q2' && mission.secondQuestion && (
          <div>
            <div className="panel pop" style={{ padding: '12px 16px', borderRadius: 'var(--r-sm)', borderColor: q1Pick === mission.answer ? 'var(--accent-dim)' : 'var(--line)', marginBottom: 14 }}>
              <strong style={{ fontFamily: 'var(--font-display)' }}>{q1Pick === mission.answer ? 'Correct. ' : 'Not quite. '}</strong>
              {mission.explain}
            </div>
            <Question
              prompt={mission.secondQuestion.prompt}
              options={mission.secondQuestion.options}
              pick={q2Pick}
              onPick={setQ2Pick}
              onSubmit={answerQ2}
            />
          </div>
        )}

        {phase === 'done' && (
          <div className="panel pop" style={{ padding: '12px 16px', borderRadius: 'var(--r-sm)' }}>
            <p style={{ margin: '0 0 6px' }}>
              <strong style={{ fontFamily: 'var(--font-display)' }}>{q1Pick === mission.answer ? 'Right call. ' : 'The risky service was the one above. '}</strong>
              {mission.explain}
            </p>
            {mission.secondQuestion && (
              <p style={{ margin: 0, color: 'var(--muted)' }}>{mission.secondQuestion.explain}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Question({
  prompt,
  options,
  pick,
  onPick,
  onSubmit,
}: {
  prompt: string;
  options: string[];
  pick: number | null;
  onPick: (i: number) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="rise">
      <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>{prompt}</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        {options.map((opt, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            className="panel"
            aria-pressed={pick === i}
            style={{
              textAlign: 'left',
              padding: '12px 14px',
              borderColor: pick === i ? 'var(--accent)' : 'var(--line)',
              background: pick === i ? 'color-mix(in srgb, var(--accent) 14%, var(--surface))' : 'var(--surface)',
              cursor: 'pointer',
              color: 'var(--ink)',
              fontFamily: 'var(--font-text)',
            }}
          >
            {opt}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary btn-sm" onClick={onSubmit} disabled={pick === null} style={{ marginTop: 14 }}>
        Submit
      </button>
    </div>
  );
}
