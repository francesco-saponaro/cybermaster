import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { ARCADE_BY_ID } from '../../content/arcade';
import { PACKET_BY_ID } from '../../content/arcade/packets';
import { actPackets, difficulty, GATE, GATE_ZONE, LANES, LIVES, multiplier, packetSecondsLeft, startPackets, stepPackets, type PacketAction, type PacketState } from '../packet';
import { ArcadeShell, Lives, PadButton, score } from '../ui/Shell';
import { useGameKeys, useLoop, usePrefersReducedMotion, useRun } from '../ui/useRun';
import { Scope } from '../../components/Scope';
import { play, playCombo } from '../../engine/audio';

const game = ARCADE_BY_ID['packet-runner'];

/** Board geometry from its width: on a phone only the gate and the end of the approach are shown, so cards stay wide enough to read. */
function useGeometry(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  const phone = w > 0 && w < 600;
  const from = phone ? 1.6 : 0;
  const slot = w / (GATE + 1 - from);
  return { w, from, slot, phone, laneH: phone ? 92 : 132, fontPx: phone ? 13 : Math.max(12, Math.min(16, slot / 24)) };
}

export function PacketRunnerPage() {
  const { seed: fixed } = useSearch({ strict: false }) as { seed?: number };
  const reduced = usePrefersReducedMotion();
  const [s, setS] = useState<PacketState>(() => startPackets(fixed ?? 0, reduced ? 0.8 : 1));
  const run = useRun('packet-runner', fixed, (seed) => setS(startPackets(seed, reduced ? 0.8 : 1)));


  useLoop(run.phase === 'play', (dt) => setS((x) => stepPackets(x, dt)));

  const act = (a: PacketAction) => {
    if (run.phase !== 'play') return;
    setS((x) => actPackets(x, a));
  };

  // Sounds and the end of the run follow the state.
  const lastNonce = useRef(0);
  useEffect(() => {
    if (!s.last || s.last.nonce === lastNonce.current) return;
    lastNonce.current = s.last.nonce;
    if (s.last.ok) {
      play('blip');
      playCombo(s.combo);
    } else play(s.freeze > 0 ? 'miss' : 'break');
  }, [s.last, s.combo, s.freeze]);
  useEffect(() => {
    if (s.over && run.phase === 'play') run.finish(s.score, s.won);
  }, [s.over, s.score, s.won, run]);

  useGameKeys(run.phase === 'play', (e) => {
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        act({ t: 'lane', d: -1 });
        return true;
      case 'ArrowDown':
      case 's':
      case 'S':
        act({ t: 'lane', d: 1 });
        return true;
      case 'ArrowRight':
      case 'a':
      case 'A':
        act({ t: 'verdict', allow: true });
        return true;
      case 'ArrowLeft':
      case 'b':
      case 'B':
        act({ t: 'verdict', allow: false });
        return true;
      default:
        return false;
    }
  });

  const mult = multiplier(s.combo);
  const hud = [
    { label: 'Score', value: score(s.score) },
    { label: 'Lives', value: <Lives left={s.lives} of={LIVES} />, aria: `${s.lives} of ${LIVES}`, tone: s.lives === 1 ? ('warn' as const) : undefined },
    { label: 'Combo', value: `x${mult} · ${s.combo}` },
    { label: 'Time', value: `${packetSecondsLeft(s)}s`, tone: packetSecondsLeft(s) <= 10 ? ('warn' as const) : undefined },
  ];
  const caught = s.mistakes.length;

  return (
    <ArcadeShell
      game={game}
      run={run}
      hud={hud}
      overTitle={run.won ? 'You held the gate for 90 seconds' : 'Out of lives'}
      overLine={`${s.correct} right calls out of ${s.decided}, best combo ${s.bestCombo}${s.dropped ? `, ${s.dropped} customer${s.dropped === 1 ? '' : 's'} left waiting` : ''}.`}
      overExtra={
        caught ? (
          <section className="ar-review" aria-labelledby="pr-review">
            <h3 id="pr-review">What got past you</h3>
            <ul>
              {s.mistakes.slice(-6).map((m, i) => {
                const t = PACKET_BY_ID[m.template]!;
                return (
                  <li key={i}>
                    <strong>
                      <code>{t.req}</code> · <code>{t.header}</code>
                    </strong>
                    <span className="small muted"> {m.kind === 'blocked' ? 'You blocked a fine request.' : m.kind === 'allowed' ? 'You allowed a bad one.' : 'It slipped through while it waited.'}</span>
                    <span className="why">{t.why}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null
      }
    >
      <Board s={s} act={act} />
      <p className="ar-msg" data-tone={s.last ? (s.last.ok ? 'good' : 'bad') : undefined} aria-live="polite" data-testid="pr-msg">
        {s.last ? s.last.text : 'Pick a lane, then allow or block the request in its gate.'}
      </p>
      <div className="ar-pads" style={{ ['--pads' as string]: 4 }}>
        <PadButton label="Up" aria="Lane up" keyHint="↑" onPress={() => act({ t: 'lane', d: -1 })} />
        <PadButton label="Down" aria="Lane down" keyHint="↓" onPress={() => act({ t: 'lane', d: 1 })} />
        <PadButton label="Block" keyHint="←" tone="stop" onPress={() => act({ t: 'verdict', allow: false })} />
        <PadButton label="Allow" keyHint="→" tone="go" onPress={() => act({ t: 'verdict', allow: true })} />
      </div>
    </ArcadeShell>
  );
}

function Board({ s, act }: { s: PacketState; act: (a: PacketAction) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const g = useGeometry(ref);
  const patience = difficulty(s.elapsed).patience / s.pace;
  const down = useRef<{ x: number; y: number; lane: number } | null>(null);
  const flash = useMemo(() => (s.last ? { lane: s.last.lane, tone: s.last.ok ? 'good' : 'bad', nonce: s.last.nonce } : null), [s.last]);
  const [flashOn, setFlashOn] = useState<typeof flash>(null);
  useEffect(() => {
    if (!flash) return undefined;
    setFlashOn(flash);
    const t = window.setTimeout(() => setFlashOn(null), 260);
    return () => window.clearTimeout(t);
  }, [flash]);

  return (
    <div
      ref={ref}
      className="pr-board"
      style={{ ['--slot' as string]: `${g.slot}px`, ['--card-w' as string]: `${g.slot * 0.94}px`, ['--lane-h' as string]: `${g.laneH}px`, ['--card-fs' as string]: `${g.fontPx}px` }}
      onPointerDown={(e) => {
        const lane = Number((e.target as HTMLElement).closest('[data-lane]')?.getAttribute('data-lane') ?? s.lane);
        down.current = { x: e.clientX, y: e.clientY, lane };
      }}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        // A swipe sideways decides the lane it started on; up or down changes lane; a tap picks the lane.
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          act({ t: 'lane-set', lane: d.lane });
          act({ t: 'verdict', allow: dx > 0 });
        } else if (Math.abs(dy) > 36) act({ t: 'lane', d: dy > 0 ? 1 : -1 });
        else act({ t: 'lane-set', lane: d.lane });
      }}
    >
      {Array.from({ length: LANES }, (_, lane) => (
        <div key={lane} className="pr-lane" data-lane={lane} data-sel={s.lane === lane} aria-label={`Lane ${lane + 1}${s.lane === lane ? ', selected' : ''}`} role="group">
          <div className="pr-gate" data-flash={flashOn && flashOn.lane === lane ? flashOn.tone : undefined}>
            <span className="pr-mark">
              <Scope size={Math.min(56, g.laneH - 30)} />
            </span>
          </div>
          {g.w > 0
            ? s.live
                .filter((p) => p.lane === lane)
                .map((p) => {
                  const t = PACKET_BY_ID[p.template]!;
                  const x = (p.pos - g.from) * g.slot + g.slot * 0.03;
                  const gate = p.pos >= GATE_ZONE;
                  return (
                    <div
                      key={p.id}
                      className="pr-card"
                      data-gate={gate}
                      data-template={t.id}
                      data-testid="packet"
                      // A card still sliding in from the left edge fades in, so half-cut text is never shown at full strength.
                      style={{ transform: `translate3d(${x}px,0,0)`, opacity: x >= 0 ? 1 : Math.max(0.08, 1 + x / (g.slot * 0.5)) }}
                    >
                      <code className="pr-req">{t.req}</code>
                      <code className="pr-head">{t.header}</code>
                      <span className="pr-note">{t.note}</span>
                      {p.waited > 0 ? <span className="pr-wait" style={{ transform: `scaleX(${Math.max(0, 1 - p.waited / patience)})` }} /> : null}
                    </div>
                  );
                })
            : null}
        </div>
      ))}
    </div>
  );
}
