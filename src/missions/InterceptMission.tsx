import { useEffect, useRef, useState } from 'react';
import type { InterceptMission, Mistake, Packet } from '../content/types';
import { GameHud } from './GameHud';
import type { MissionProps } from './mission';
import { useHint } from './mission';
import { emptyTally, tallyCatch, tallyPass, catchPoints, interceptScore, packetSeconds, runIsOver, type InterceptTally } from '../engine/intercept';
import { play } from '../engine/audio';

interface Live extends Packet {
  spawnOrder: number;
  x: number; // 0..1 across the screen
  seconds: number;
  resolved: boolean;
  caught: boolean;
  flash: number;
}

// Requests and responses stream left to right through the proxy. Catch the ones
// that carry the problem (click or press space under the reticle); let the clean
// ones pass. Hold to slow time and read. A canvas scene, the reticle as the
// catch zone. The first mission in each zone is tutorial difficulty: a miss
// costs score, not the run.
export function InterceptMissionView({ mission, onFinish }: MissionProps<InterceptMission>) {
  const tutorial = isTutorial(mission.id);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [misses, setMisses] = useState(0);
  const [note, setNote] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const [done, setDone] = useState(false);
  const [slow, setSlow] = useState(false);
  const [caught, setCaught] = useState(0);

  const hint = useHint();
  const hintRef = useRef(hint.active);
  hintRef.current = hint.active;

  const totalBad = mission.packets.filter((p) => p.bad).length;

  const tallyRef = useRef<InterceptTally>(emptyTally());
  const mistakesRef = useRef<Mistake[]>([]);
  const liveRef = useRef<Live[]>([]);
  const queueRef = useRef<Live[]>([]);
  const spawnedRef = useRef(0);
  const finishedRef = useRef(false);
  const slowRef = useRef(false);
  slowRef.current = slow;

  // Build the stream once (deterministic order from the data).
  useEffect(() => {
    queueRef.current = mission.packets.map((p, i) => ({
      ...p,
      spawnOrder: i,
      x: -0.15,
      seconds: packetSeconds(i, mission.packets.length, mission.pace),
      resolved: false,
      caught: false,
      flash: 0,
    }));
  }, [mission]);

  function finish() {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setDone(true);
    const t = tallyRef.current;
    const s = interceptScore({ caught: t.caught, totalBad, falseCatches: t.falseCatches, missedBad: t.missedBad, bestCombo: t.bestCombo });
    play(s >= 50 ? 'clear' : 'boom');
    setTimeout(() => onFinish({ score: s, mistakes: mistakesRef.current }), 400);
  }

  function resolvePass(p: Live) {
    if (p.resolved) return;
    p.resolved = true;
    tallyRef.current = tallyPass(tallyRef.current, p.bad);
    if (p.bad) {
      setMisses(tallyRef.current.misses);
      setCombo(0);
      setNote({ text: `Missed it. ${p.title}: ${p.reason}`, tone: 'bad' });
      mistakesRef.current.push({ concept: p.concept, what: `${p.title} slipped past uncaught`, why: p.reason, correct: 'This packet should have been caught.' });
      play('boom');
      if (runIsOver(tallyRef.current.misses, mission.missLimit, tutorial)) finish();
    }
  }

  function catchPacket(p: Live) {
    if (p.resolved || finishedRef.current) return;
    p.resolved = true;
    p.caught = true;
    if (p.bad) {
      const points = catchPoints(tallyRef.current.combo);
      tallyRef.current = tallyCatch(tallyRef.current, true);
      p.flash = 1;
      setScore((s) => s + points);
      setCombo(tallyRef.current.combo);
      setCaught((c) => c + 1);
      setNote({ text: `Caught. ${p.title}: ${p.reason}`, tone: 'good' });
      play('hit');
      if (tallyRef.current.caught >= totalBad) finish();
    } else {
      tallyRef.current = tallyCatch(tallyRef.current, false);
      setMisses(tallyRef.current.misses);
      setCombo(0);
      setNote({ text: `That one was clean. ${p.title}: ${p.reason}`, tone: 'bad' });
      mistakesRef.current.push({ concept: p.concept, what: `You caught a clean packet: ${p.title}`, why: p.reason, correct: 'This packet was fine and should have passed.' });
      play('miss');
      if (runIsOver(tallyRef.current.misses, mission.missLimit, tutorial)) finish();
    }
  }

  // catch the packet nearest the centre reticle (keyboard / tap-anywhere path)
  function catchNearest() {
    const live = liveRef.current.filter((p) => !p.resolved && p.x > 0.15 && p.x < 0.85).sort((a, b) => Math.abs(a.x - 0.5) - Math.abs(b.x - 0.5));
    if (live[0]) catchPacket(live[0]);
    else play('shoot');
  }

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const canvas = el;
    const context = ctx;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    let spawnGap = 0;
    const read = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#fff';
    const accent = read('--accent');
    const ink = read('--ink');
    const muted = read('--muted-2');
    const surface = read('--surface');
    const surface2 = read('--surface-2');
    const info = read('--info');

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function laneY(p: Live, H: number): number {
      // three lanes by direction so cards do not overlap
      const lane = p.dir === 'request' ? 0 : p.dir === 'response' ? 1 : 2;
      return H * (0.22 + lane * 0.26);
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      const factor = (slowRef.current ? 0.32 : 1) * (reduce ? 0.7 : 1);

      if (!finishedRef.current) {
        spawnGap += dt;
        const onScreen = liveRef.current.filter((p) => !p.resolved).length;
        if (queueRef.current.length && spawnGap > 0.9 && onScreen < 3) {
          const next = queueRef.current.shift()!;
          next.x = -0.12;
          liveRef.current.push(next);
          spawnedRef.current += 1;
          spawnGap = 0;
        }
        for (const p of liveRef.current) {
          if (p.resolved && p.flash <= 0) continue;
          if (!p.resolved) {
            p.x += (dt / p.seconds) * factor;
            if (p.x >= 1.12) resolvePass(p);
          }
          if (p.flash > 0) p.flash -= dt * 2.5;
        }
        // all spawned and resolved -> finish
        if (queueRef.current.length === 0 && liveRef.current.every((p) => p.resolved) && spawnedRef.current > 0) {
          finish();
        }
      }

      // draw background and the reticle catch zone
      context.clearRect(0, 0, W, H);
      context.fillStyle = surface;
      context.fillRect(0, 0, W, H);
      // proxy centre band
      const cx = W / 2;
      context.strokeStyle = muted;
      context.globalAlpha = 0.3;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(cx, 0);
      context.lineTo(cx, H);
      context.stroke();
      context.globalAlpha = 1;
      // reticle
      drawReticle(context, cx, H / 2, Math.min(H, 180) * 0.42, accent, hintRef.current);

      // packets
      for (const p of liveRef.current) {
        if (p.resolved && p.flash <= 0 && !p.caught) continue;
        if (p.resolved && !p.caught) continue;
        const px = p.x * W;
        const py = laneY(p, H);
        const label = `${p.dir === 'log' ? 'LOG' : p.dir === 'request' ? 'REQ' : 'RES'}  ${p.title}`;
        context.font = '600 12px "Libre Franklin Variable", sans-serif';
        const wLabel = context.measureText(label).width;
        const firstLine = p.lines[0] ?? '';
        context.font = '11px ui-monospace, monospace';
        const wRaw = Math.min(260, context.measureText(firstLine).width);
        const w = Math.max(140, wLabel, wRaw) + 24;
        const h = 46;
        const inZone = p.x > 0.4 && p.x < 0.6;
        context.fillStyle = p.flash > 0 ? accent : surface2;
        context.strokeStyle = p.flash > 0 ? accent : inZone ? accent : p.dir === 'log' ? muted : p.dir === 'request' ? muted : info;
        context.lineWidth = inZone ? 2 : 1;
        roundRect(context, px - w / 2, py - h / 2, w, h, 6);
        context.fill();
        context.stroke();
        context.fillStyle = p.flash > 0 ? ink : 'var(--accent-text)';
        context.font = '700 11px "Libre Franklin Variable", sans-serif';
        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillStyle = accent;
        context.fillText(label, px - w / 2 + 12, py - h / 2 + 7);
        context.fillStyle = hintRef.current && p.bad ? accent : ink;
        context.font = '11px ui-monospace, monospace';
        const shown = firstLine.length > 40 ? firstLine.slice(0, 39) + '…' : firstLine;
        context.fillText(shown, px - w / 2 + 12, py - h / 2 + 24);
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // click: catch the packet under the pointer
  function onCanvasClick(ev: React.MouseEvent<HTMLCanvasElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    const hit = liveRef.current
      .filter((p) => !p.resolved)
      .map((p) => ({ p, lane: p.dir === 'request' ? 0 : p.dir === 'response' ? 1 : 2 }))
      .filter(({ p, lane }) => Math.abs(x - p.x) < 0.1 && Math.abs(y - (0.22 + lane * 0.26)) < 0.12);
    if (hit[0]) catchPacket(hit[0].p);
    else play('shoot');
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (done) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        catchNearest();
      } else if (e.key === 'Shift') {
        setSlow(true);
      }
    }
    function onUp(e: KeyboardEvent) {
      if (e.key === 'Shift') setSlow(false);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  return (
    <div>
      <GameHud
        score={score}
        combo={combo}
        right={
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <span className="tnum" style={{ color: 'var(--muted)', fontWeight: 600, fontFamily: 'var(--font-display)' }}>
              {caught} / {totalBad} caught
            </span>
            <span className="tnum" style={{ color: misses >= mission.missLimit - 1 && !tutorial ? '#f2a0a7' : 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>
              miss {misses}{tutorial ? '' : `/${mission.missLimit}`}
            </span>
          </span>
        }
      />
      <div style={{ position: 'relative', borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--line)' }}>
        <canvas
          ref={canvasRef}
          onClick={onCanvasClick}
          onPointerDown={() => setSlow(true)}
          onPointerUp={() => setSlow(false)}
          onPointerLeave={() => setSlow(false)}
          role="img"
          aria-label="Packet stream. Click a packet in the reticle to catch it, or press space for the nearest. Hold to slow time."
          style={{ display: 'block', width: '100%', height: 'min(52vh, 420px)', cursor: 'crosshair', touchAction: 'none' }}
        />
      </div>
      <p style={{ color: 'var(--muted)', margin: '12px 0 8px', fontSize: 'var(--step-small)' }}>
        Catch the packets that leak or weaken something; let clean ones pass. Click one in the centre reticle, or press space. Hold (or press Shift) to slow time and read.
        {tutorial ? ' Tutorial difficulty: a mistake costs score, not the run.' : ` Miss ${mission.missLimit} and the run ends.`}
        {hint.active ? ' Hint on: bad packets are marked in crimson.' : ''}
      </p>
      {note && (
        <div className="panel pop" style={{ padding: '12px 16px', borderRadius: 'var(--r-sm)', borderColor: note.tone === 'good' ? 'var(--accent-dim)' : 'var(--line)' }}>
          {note.text}
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={finish} disabled={done}>
          End the shift
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{note?.text}</span>
    </div>
  );
}

export function isTutorial(id: string): boolean {
  return ['wire-headers', 'arena-lineup', 'perimeter-first-scan', 'cloud-bucket', 'report-phases'].includes(id);
}

function drawReticle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, accent: string, bright: boolean) {
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.globalAlpha = bright ? 0.9 : 0.55;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
  ctx.stroke();
  for (const a of [0, 90, 180, 270]) {
    const rad = (a * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * (r - 8), cy + Math.sin(rad) * (r - 8));
    ctx.lineTo(cx + Math.cos(rad) * (r + 8), cy + Math.sin(rad) * (r + 8));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
