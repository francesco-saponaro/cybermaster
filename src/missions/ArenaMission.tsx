import { useEffect, useRef, useState } from 'react';
import type { ArenaMission, Mistake } from '../content/types';
import { GameHud } from './GameHud';
import type { MissionProps } from './mission';
import { useHint } from './mission';
import { clampScore } from '../engine/scoring';
import { play } from '../engine/audio';

interface Enemy {
  id: number;
  attack: string;
  defence: string;
  explain: string;
  concept: string;
  x: number; // 0..1 lane position
  y: number; // 0..1, 1 = reached you
  speed: number;
  dead: boolean;
  hitFlash: number;
}

// A top-down lane defender on canvas. Enemies are labelled attacks drifting
// toward you; arm the matching defence and fire. The loop runs at the display
// refresh; all content comes from the mission data.
export function ArenaMissionView({ mission, onFinish }: MissionProps<ArenaMission>) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mistakesRef = useRef<Mistake[]>([]);
  const hint = useHint();
  const [armed, setArmed] = useState(mission.defences[0]!.id);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(mission.lives);
  const [combo, setCombo] = useState(0);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'good' | 'bad' } | null>(null);
  const [shakeOn, setShakeOn] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hintDefence, setHintDefence] = useState<string | null>(null);

  // when the hint is on, name the defence the nearest attack needs
  useEffect(() => {
    if (!hint.active) {
      setHintDefence(null);
      return;
    }
    const t = setInterval(() => {
      const live = enemies.current.filter((e) => !e.dead && e.y > -0.1).sort((a, b) => b.y - a.y);
      setHintDefence(live[0]?.defence ?? null);
    }, 250);
    return () => clearInterval(t);
  }, [hint.active]);

  // live refs the loop reads
  const armedRef = useRef(armed);
  const stateRef = useRef({ lives: mission.lives, score: 0, combo: 0 });
  const enemies = useRef<Enemy[]>([]);
  const particles = useRef<{ x: number; y: number; vx: number; vy: number; life: number; color: string }[]>([]);
  const queue = useRef<Enemy[]>([]);
  const nextId = useRef(1);
  const total = useRef(0);
  const cleared = useRef(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    armedRef.current = armed;
  }, [armed]);

  // Build the spawn queue once.
  useEffect(() => {
    const q: Enemy[] = [];
    mission.waves.forEach((wave, wi) => {
      wave.forEach((w, i) => {
        q.push({
          id: nextId.current++,
          attack: w.attack,
          defence: w.defence,
          explain: w.explain,
          concept: w.concept,
          x: 0.12 + ((i + wi) % 4) * 0.22,
          y: -0.15 - i * 0.18 - wi * 1.1,
          speed: 0.035 + wi * 0.012,
          dead: false,
          hitFlash: 0,
        });
      });
    });
    queue.current = q;
    total.current = q.length;
  }, [mission]);

  function finish(result: number) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setDone(true);
    onFinish({ score: clampScore(result), mistakes: mistakesRef.current });
  }

  function fire() {
    if (finishedRef.current) return;
    // target the lowest (closest) live enemy on screen
    const live = enemies.current.filter((e) => !e.dead && e.y > -0.1).sort((a, b) => b.y - a.y);
    const target = live[0];
    play('shoot');
    spawnParticles(0.5, 0.86, 'var(--accent)', 6);
    if (!target) return;
    if (target.defence === armedRef.current) {
      target.dead = true;
      cleared.current += 1;
      const s = stateRef.current;
      s.combo += 1;
      const mult = Math.min(4, 1 + Math.floor(s.combo / 3));
      s.score += 100 * mult;
      setScore(s.score);
      setCombo(s.combo);
      spawnParticles(target.x, target.y, 'var(--accent)', 14);
      setNote({ text: `${target.attack.split(':')[0]}: ${target.explain}`, tone: 'good' });
      play('hit');
      checkDone();
    } else {
      target.hitFlash = 1;
      mistakesRef.current.push({ concept: target.concept, what: `Wrong defence armed for ${target.attack}`, why: target.explain, correct: mission.defences.find((d) => d.id === target.defence)?.label ?? '' });
      damage(`Wrong defence for ${target.attack.split(':')[0]}. ${target.explain}`);
    }
  }

  function damage(message: string) {
    const s = stateRef.current;
    s.lives -= 1;
    s.combo = 0;
    setLives(s.lives);
    setCombo(0);
    setNote({ text: message, tone: 'bad' });
    setShakeOn(true);
    setTimeout(() => setShakeOn(false), 320);
    play('boom');
    if (s.lives <= 0) {
      const pct = total.current ? cleared.current / total.current : 0;
      finish(Math.round(pct * 70)); // a loss still scores for what you cleared
    }
  }

  function checkDone() {
    if (cleared.current >= total.current && queue.current.length === 0 && enemies.current.every((e) => e.dead || e.y < -0.1)) {
      const livesBonus = stateRef.current.lives * 8;
      const base = 60 + Math.round((cleared.current / Math.max(1, total.current)) * 32);
      setTimeout(() => finish(base + livesBonus), 300);
    }
  }

  function spawnParticles(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n + Math.random();
      particles.current.push({ x, y, vx: Math.cos(a) * (0.004 + Math.random() * 0.006), vy: Math.sin(a) * (0.004 + Math.random() * 0.006), life: 1, color });
    }
  }

  // The loop.
  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext('2d');
    if (!context) return;
    const canvas = canvasEl; // non-null locals keep their type inside the closures below
    const ctx = context;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    let spawnTimer = 0;

    const read = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#fff';
    const colAccent = read('--accent');
    const colInk = read('--ink');
    const colMuted = read('--muted-2');
    const colSurface = read('--surface');

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;

      if (!finishedRef.current) {
        spawnTimer += dt;
        // release queued enemies gradually as earlier ones advance
        const onScreen = enemies.current.filter((e) => !e.dead && e.y < 1).length;
        if (spawnTimer > 0.7 && onScreen < 4 && queue.current.length) {
          const e = queue.current.shift()!;
          e.y = -0.12;
          enemies.current.push(e);
          spawnTimer = 0;
        }
        for (const e of enemies.current) {
          if (e.dead) continue;
          e.y += e.speed * dt * (reduce ? 0.6 : 1) * 1.6;
          if (e.hitFlash > 0) e.hitFlash -= dt * 3;
          if (e.y >= 1) {
            e.dead = true;
            mistakesRef.current.push({ concept: e.concept, what: `${e.attack} reached you`, why: e.explain, correct: mission.defences.find((d) => d.id === e.defence)?.label ?? '' });
            damage(`${e.attack.split(':')[0]} reached you. ${e.explain}`);
          }
        }
        setProgress(total.current ? cleared.current / total.current : 0);
      }

      // draw
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = colSurface;
      ctx.fillRect(0, 0, W, H);
      // lane grid
      ctx.strokeStyle = colMuted;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 1;
      for (let gx = 0; gx <= 4; gx += 1) {
        ctx.beginPath();
        ctx.moveTo((gx / 4) * W, 0);
        ctx.lineTo((gx / 4) * W, H);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // the analyst (you), bottom centre
      ctx.fillStyle = colAccent;
      ctx.beginPath();
      ctx.arc(W / 2, H - 22, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colInk;
      ctx.beginPath();
      ctx.arc(W / 2, H - 22, 5, 0, Math.PI * 2);
      ctx.fill();

      // enemies
      for (const e of enemies.current) {
        if (e.dead) continue;
        const ex = e.x * W;
        const ey = e.y * (H - 60);
        const label = e.attack;
        ctx.font = '600 13px "Libre Franklin Variable", sans-serif';
        const w = ctx.measureText(label).width + 20;
        ctx.fillStyle = e.hitFlash > 0 ? colAccent : '#242424';
        ctx.strokeStyle = e.y > 0.72 ? colAccent : colMuted;
        ctx.lineWidth = e.y > 0.72 ? 2 : 1;
        roundRect(ctx, ex - w / 2, ey - 14, w, 28, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = colInk;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, ex, ey);
      }

      // particles
      for (const p of particles.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= dt * 2.2;
        if (p.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = colAccent;
        ctx.fillRect(p.x * W - 2, p.y * (H - 60) - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
      particles.current = particles.current.filter((p) => p.life > 0);

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard: number keys arm, space/enter fires
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (done) return;
      const d = mission.defences.find((x) => x.key === ev.key);
      if (d) {
        setArmed(d.id);
        play('blip');
        return;
      }
      if (ev.key === ' ' || ev.key === 'Enter') {
        ev.preventDefault();
        fire();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, mission.defences]);

  return (
    <div>
      <GameHud score={score} combo={combo} lives={{ current: lives, max: mission.lives }} />
      <div
        className={shakeOn ? 'shake' : undefined}
        style={{ position: 'relative', borderRadius: 'var(--r)', overflow: 'hidden', border: '1px solid var(--line)' }}
      >
        <canvas
          ref={canvasRef}
          onClick={fire}
          role="img"
          aria-label="Attack lane. Arm a defence, then fire at the nearest attack."
          style={{ display: 'block', width: '100%', height: 'min(56vh, 460px)', cursor: 'crosshair', touchAction: 'manipulation' }}
        />
      </div>

      <p style={{ color: 'var(--muted)', margin: '12px 0 8px', fontSize: 'var(--step-small)' }}>
        Arm the right defence, then tap the lane (or press space) to fire. The armed defence is highlighted.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {mission.defences.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              setArmed(d.id);
              play('blip');
            }}
            disabled={done}
            className="panel"
            aria-pressed={armed === d.id}
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--r-sm)',
              borderColor: armed === d.id ? 'var(--accent)' : hintDefence === d.id ? 'var(--good)' : 'var(--line)',
              background: armed === d.id ? 'color-mix(in srgb, var(--accent) 18%, var(--surface))' : hintDefence === d.id ? 'color-mix(in srgb, var(--good) 14%, var(--surface))' : 'var(--surface)',
              cursor: done ? 'default' : 'pointer',
              fontFamily: 'var(--font-text)',
              color: 'var(--ink)',
              textAlign: 'left',
            }}
          >
            <span className="tnum" style={{ color: 'var(--muted)', fontFamily: 'var(--font-display)', fontWeight: 700, marginRight: 8 }}>
              {d.key}
            </span>
            {d.label}
          </button>
        ))}
        <button type="button" className="btn btn-primary btn-sm" onClick={fire} disabled={done}>
          Fire
        </button>
      </div>

      {note && (
        <div
          className="panel pop"
          style={{ marginTop: 14, padding: '12px 16px', borderRadius: 'var(--r-sm)', borderColor: note.tone === 'good' ? 'var(--accent-dim)' : 'var(--line)' }}
        >
          {note.text}
        </div>
      )}
      <span className="sr-only" aria-live="assertive">
        {note?.text}
      </span>
      <span className="sr-only">{Math.round(progress * 100)}% cleared</span>
    </div>
  );
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
