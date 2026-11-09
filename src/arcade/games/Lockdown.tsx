import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ARCADE_BY_ID } from '../../content/arcade';
import { OPTIONS, PUZZLES, SLOT_NAME, type LNode, type OptionId, type Puzzle, type Source } from '../../content/arcade/lockdown';
import { actLockdown, judge, lockSecondsLeft, puzzleStars, reach, startLockdown, stepLockdown, type Config, type LockAction, type LockState } from '../lockdown';
import { ArcadeShell, PadButton, score } from '../ui/Shell';
import { useGameKeys, useLoop, usePrefersReducedMotion, useRun } from '../ui/useRun';
import { Stars } from '../../components/Stars';
import { play } from '../../engine/audio';

const game = ARCADE_BY_ID.lockdown;

export function LockdownPage() {
  const reduced = usePrefersReducedMotion();
  const [s, setS] = useState<LockState>(() => startLockdown(reduced ? 0.8 : 1));
  const run = useRun('lockdown', undefined, () => setS(startLockdown(reduced ? 0.8 : 1)));


  useLoop(run.phase === 'play', (dt) => setS((x) => stepLockdown(x, dt)));
  const act = useCallback(
    (a: LockAction) => {
      if (run.phase === 'play') setS((x) => actLockdown(x, a));
    },
    [run.phase],
  );

  const nonce = useRef(0);
  useEffect(() => {
    if (!s.event || s.event.nonce === nonce.current) return;
    nonce.current = s.event.nonce;
    play(s.event.tone === 'good' ? 'lock' : s.event.tone === 'bad' ? 'miss' : 'blip');
  }, [s.event]);
  useEffect(() => {
    if (s.over && run.phase === 'play') run.finish(s.score, s.won);
  }, [s.over, s.score, s.won, run]);

  const p = PUZZLES[s.index]!;
  useGameKeys(run.phase === 'play', (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 4 && s.selected) {
      const slot = p.slots.find((x) => x.id === s.selected);
      const o = slot?.options[n - 1];
      if (slot && o) act({ t: 'set', slot: slot.id, option: o });
      return true;
    }
    if (e.key === 'r' || e.key === 'R') {
      act({ t: 'reset' });
      return true;
    }
    return false;
  });

  const hud = [
    { label: 'Score', value: score(s.score) },
    { label: 'Diagram', value: `${Math.min(s.index + 1, PUZZLES.length)} of ${PUZZLES.length}` },
    { label: 'Changes', value: `${s.moves} · par ${p.par}`, tone: s.moves > p.par ? ('warn' as const) : undefined },
    { label: 'Time', value: `${lockSecondsLeft(s)}s`, tone: lockSecondsLeft(s) <= 15 ? ('warn' as const) : undefined },
  ];

  return (
    <ArcadeShell
      game={game}
      run={run}
      hud={hud}
      overTitle={run.won ? 'Every diagram locked down' : 'Out of time'}
      overLine={`${s.results.filter((r) => r.solved).length} of ${PUZZLES.length} diagrams locked down, ${s.results.filter((r) => r.solved && r.moves <= r.par).length} of them at par.`}
      overExtra={
        <section className="ar-review" aria-labelledby="ld-review">
          <h3 id="ld-review">Diagram by diagram</h3>
          <ul>
            {PUZZLES.map((q) => {
              const r = s.results.find((x) => x.id === q.id);
              return (
                <li key={q.id} className="ld-result">
                  <span className="row">
                    <strong className="grow">{q.title}</strong>
                    {r?.solved ? <Stars count={puzzleStars(r)} size={13} /> : <span className="small muted">{r ? 'Skipped' : 'Not reached'}</span>}
                  </span>
                  <span className="why">{r?.solved ? `${r.moves} change${r.moves === 1 ? '' : 's'}, par ${r.par}. ${q.lesson}` : q.lesson}</span>
                </li>
              );
            })}
          </ul>
        </section>
      }
    >
      <section className="ld-head" aria-live="polite">
        <h2>{p.title}</h2>
        <p>{p.brief}</p>
      </section>
      <Diagram key={p.id} p={p} cfg={s.config} selected={s.selected} act={act} />
      <Tray p={p} s={s} act={act} />
      <p className="ar-msg" data-tone={s.event?.tone === 'info' ? undefined : s.event?.tone} aria-live="polite">
        {s.event?.text ?? 'Tap a rule on a server or a bucket to change it.'}
      </p>
      <div className="ar-pads" style={{ ['--pads' as string]: 2 }}>
        <PadButton label="Undo all" keyHint="R" onPress={() => act({ t: 'reset' })} />
        <PadButton label="Skip diagram" onPress={() => act({ t: 'skip' })} />
      </div>
      {s.cleared ? (
        <div className="ld-cleared" role="status">
          <p className="ar-kicker">Locked down</p>
          <p className="ld-cleared-line">
            {s.cleared.result.moves} change{s.cleared.result.moves === 1 ? '' : 's'}, par {s.cleared.result.par} <Stars count={puzzleStars(s.cleared.result)} size={16} />
          </p>
          <p className="ld-lesson">{s.cleared.lesson}</p>
        </div>
      ) : null}
    </ArcadeShell>
  );
}

type Line = { from: string; to: string; tone: 'red' | 'green' | 'grey' | 'start' };

function edgeTones(p: Puzzle, cfg: Config): Line[] {
  const r = reach(p, cfg);
  const red = new Set<string>();
  const green = new Set<string>();
  const crowns = p.nodes.filter((n) => n.crown).map((n) => n.id);
  for (const src of p.sources) {
    const paths = r.paths[src.id] ?? {};
    const goals = src.kind === 'attacker' ? crowns : src.needs ?? [];
    for (const g of goals) for (const [a, b] of paths[g] ?? []) (src.kind === 'attacker' ? red : green).add(`${a}>${b}`);
  }
  const lines: Line[] = [];
  for (const src of p.sources) if (src.startAt) lines.push({ from: src.id, to: src.startAt, tone: src.kind === 'attacker' ? 'red' : 'start' });
  for (const [a, b] of p.edges) {
    const k = `${a}>${b}`;
    if (red.has(k)) lines.push({ from: a, to: b, tone: 'red' });
    if (green.has(k)) lines.push({ from: a, to: b, tone: 'green' });
    if (!red.has(k) && !green.has(k)) lines.push({ from: a, to: b, tone: 'grey' });
  }
  return lines;
}

function Diagram({ p, cfg, selected, act }: { p: Puzzle; cfg: Config; selected: string | null; act: (a: LockAction) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<{ w: number; h: number; anchors: Record<string, DOMRect> }>({ w: 0, h: 0, anchors: {} });
  const lines = useMemo(() => edgeTones(p, cfg), [p, cfg]);
  const verdict = useMemo(() => judge(p, cfg), [p, cfg]);
  const r = useMemo(() => reach(p, cfg), [p, cfg]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const anchors: Record<string, DOMRect> = {};
      el.querySelectorAll<HTMLElement>('[data-node]').forEach((n) => {
        const rr = n.getBoundingClientRect();
        anchors[n.dataset.node!] = new DOMRect(rr.left - b.left, rr.top - b.top, rr.width, rr.height);
      });
      setGeo({ w: b.width, h: b.height, anchors });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [p, cfg]);

  // Lines between neighbouring columns are plain curves. A line that skips the middle column threads
  // through the nearest gap between its cards, so it never runs behind one.
  const middle = Object.entries(geo.anchors)
    .filter(([id]) => p.nodes.some((n) => n.id === id && n.col === 1))
    .map(([, r]) => r)
    .sort((a, b) => a.top - b.top);
  const colOf = (id: string) => (p.sources.some((x) => x.id === id) ? 0 : (p.nodes.find((n) => n.id === id)?.col ?? 1));
  const pathFor = (l: Line, offset: number) => {
    const a = geo.anchors[l.from];
    const b = geo.anchors[l.to];
    if (!a || !b) return '';
    const x1 = a.right;
    const y1 = a.top + a.height / 2 + offset;
    const x2 = b.left;
    const y2 = b.top + b.height / 2 + offset;
    if (colOf(l.from) === 0 && colOf(l.to) === 2 && middle.length) {
      const gaps = [middle[0]!.top - 8, ...middle.slice(1).map((r, i) => (middle[i]!.bottom + r.top) / 2), middle.at(-1)!.bottom + 10];
      const want = (y1 + y2) / 2;
      const gy = gaps.reduce((best, g) => (Math.abs(g - want) < Math.abs(best - want) ? g : best), gaps[0]!) + offset;
      const l1 = middle[0]!.left;
      const r1 = middle[0]!.right;
      const m1 = (x1 + l1) / 2;
      const m2 = (r1 + x2) / 2;
      return `M${x1},${y1} C${m1},${y1} ${m1},${gy} ${l1},${gy} L${r1},${gy} C${m2},${gy} ${m2},${y2} ${x2},${y2}`;
    }
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };
  const both = new Set(lines.filter((l) => l.tone === 'red').map((l) => `${l.from}>${l.to}`).filter((k) => lines.some((l) => l.tone === 'green' && `${l.from}>${l.to}` === k)));
  const cols: [string, (Source | LNode)[]][] = [
    ['Who', p.sources],
    ['Servers', p.nodes.filter((n) => n.col === 1)],
    ['Data', p.nodes.filter((n) => n.col === 2)],
  ];

  return (
    <div className="ld-diagram" ref={box}>
      <svg className="ld-lines" width={geo.w} height={geo.h} aria-hidden="true">
        {lines.map((l, i) => {
          const k = `${l.from}>${l.to}`;
          const off = both.has(k) ? (l.tone === 'red' ? -3 : 3) : 0;
          return <path key={i} d={pathFor(l, off)} className="ld-line" data-tone={l.tone} />;
        })}
      </svg>
      {cols.map(([name, items]) => (
        <div key={name} className="ld-col">
          <h3 className="ld-colname">{name}</h3>
          {items.map((it) =>
            'kind' in it && (it.kind === 'user' || it.kind === 'attacker') ? (
              <SourceCard key={it.id} src={it} ok={it.kind === 'user' ? !verdict.cut.some((c) => c.source === it.id) : !verdict.breaches.some((b) => b.source === it.id)} />
            ) : (
              <NodeCard key={it.id} p={p} n={it as LNode} cfg={cfg} selected={selected} act={act} breached={verdict.breaches.some((b) => b.node === it.id)} users={p.sources.filter((src) => src.kind === 'user' && r.reached[src.id]?.has(it.id)).length} />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

function SourceCard({ src, ok }: { src: Source; ok: boolean }) {
  const attacker = src.kind === 'attacker';
  return (
    <div className="ld-card" data-node={src.id} data-kind={attacker ? 'attacker' : 'user'} data-ok={ok}>
      <strong>{src.label}</strong>
      <span className="ld-sub">{src.sub}</span>
      <span className="ld-state">{attacker ? (ok ? 'Shut out' : 'Has a way in') : ok ? 'Has access' : 'Cut off'}</span>
    </div>
  );
}

function NodeCard({ p, n, cfg, selected, act, breached, users }: { p: Puzzle; n: LNode; cfg: Config; selected: string | null; act: (a: LockAction) => void; breached: boolean; users: number }) {
  const slots = p.slots.filter((x) => x.id === n.gate || x.id === n.runsAs);
  const fixedGate = n.gate && n.gate in OPTIONS ? OPTIONS[n.gate as OptionId] : null;
  const fixedRole = n.runsAs && n.runsAs in OPTIONS ? OPTIONS[n.runsAs as OptionId] : null;
  return (
    <div className="ld-card" data-node={n.id} data-kind="node" data-crown={!!n.crown} data-breached={breached}>
      <strong>{n.label}</strong>
      <span className="ld-sub">{n.sub}</span>
      {fixedGate ? (
        <span className="ld-fixed">
          {SLOT_NAME[fixedGate.kind]}: {fixedGate.label}
        </span>
      ) : null}
      {fixedRole ? <span className="ld-fixed">Runs as: {fixedRole.label}</span> : null}
      {slots.map((slot) => (
        <button
          key={slot.id}
          type="button"
          className="ld-slot"
          data-slot={slot.id}
          data-sel={selected === slot.id}
          aria-pressed={selected === slot.id}
          aria-label={`${SLOT_NAME[slot.kind]} on ${n.label}: ${OPTIONS[cfg[slot.id]!].label}. Change it.`}
          onClick={() => act({ t: 'select', slot: selected === slot.id ? null : slot.id })}
        >
          <span className="ld-slot-k">{SLOT_NAME[slot.kind]}</span>
          <span className="ld-slot-v">{OPTIONS[cfg[slot.id]!].label}</span>
        </button>
      ))}
      {n.crown ? <span className="ld-state">{breached ? 'Attacker reaches it' : 'Safe'}</span> : users ? <span className="ld-state ld-used">In use</span> : null}
    </div>
  );
}

function Tray({ p, s, act }: { p: Puzzle; s: LockState; act: (a: LockAction) => void }) {
  const slot = p.slots.find((x) => x.id === s.selected);
  const node = slot ? p.nodes.find((n) => n.gate === slot.id || n.runsAs === slot.id) : undefined;
  const [drag, setDrag] = useState<{ option: OptionId; x: number; y: number; moved: boolean } | null>(null);

  // Listeners go on the window as soon as the press starts, so even a very quick tap is caught.
  const startDrag = (option: OptionId, x0: number, y0: number) => {
    let moved = false;
    setDrag({ option, x: x0, y: y0, moved });
    const move = (e: PointerEvent) => {
      moved = moved || Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 6;
      setDrag({ option, x: e.clientX, y: e.clientY, moved });
    };
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      const target = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-slot]');
      const to = moved ? target?.dataset.slot : slot?.id;
      if (to) act({ t: 'set', slot: to, option });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <section className="ld-tray" aria-label="Settings for the chosen rule" data-open={!!slot}>
      {slot && node ? (
        <>
          <p className="ld-tray-title">
            {SLOT_NAME[slot.kind]} on {node.label}
            <span className="muted"> · tap a setting, or drag it onto the rule</span>
          </p>
          <div className="ld-options">
            {slot.options.map((o, i) => (
              <button
                key={o}
                type="button"
                className="ld-option"
                data-current={s.config[slot.id] === o}
                aria-keyshortcuts={String(i + 1)}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  startDrag(o, e.clientX, e.clientY);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    act({ t: 'set', slot: slot.id, option: o });
                  }
                }}
              >
                <kbd className="hide-sm">{i + 1}</kbd>
                {OPTIONS[o].label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="ld-tray-title muted">Pick a rule on a server or a bucket to see its settings here.</p>
      )}
      {drag && drag.moved ? (
        <span className="ld-ghost" style={{ transform: `translate(${drag.x + 10}px, ${drag.y + 10}px)` }} aria-hidden="true">
          {OPTIONS[drag.option].label}
        </span>
      ) : null}
    </section>
  );
}
