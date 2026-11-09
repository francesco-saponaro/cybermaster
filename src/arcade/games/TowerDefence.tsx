import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { ARCADE_BY_ID } from '../../content/arcade';
import { ATTACK_BY_ID, FIXES, FIX_BY_ID, type FixId } from '../../content/arcade/defence';
import {
  actTower, buildable, COLS, covers, DB, isRoute, ROUTES, ROWS, startTower, stepTower, UNIT_SIZE, unitXY, WAVE_COUNTS, wavePreview, type TowerAction, type TowerState,
} from '../tower';
import { ArcadeShell, PadButton, score } from '../ui/Shell';
import { useGameKeys, useLoop, usePrefersReducedMotion, useRun } from '../ui/useRun';
import { AttackGlyph, FixGlyph } from './glyphs';
import { play } from '../../engine/audio';

const game = ARCADE_BY_ID['tower-defence'];

function useTile(ref: React.RefObject<HTMLDivElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return Math.max(36, Math.min(68, Math.floor(w / COLS)));
}

export function TowerDefencePage() {
  const { seed: fixed } = useSearch({ strict: false }) as { seed?: number };
  const reduced = usePrefersReducedMotion();
  const [s, setS] = useState<TowerState>(() => startTower(fixed ?? 0, reduced ? 0.8 : 1));
  const [inspect, setInspect] = useState<number | null>(null);
  const run = useRun('tower-defence', fixed, (seed) => {
    setS(startTower(seed, reduced ? 0.8 : 1));
    setInspect(null);
  });


  useLoop(run.phase === 'play', (dt) => setS((x) => stepTower(x, dt)));
  const act = (a: TowerAction) => {
    if (run.phase === 'play') setS((x) => actTower(x, a));
  };

  const nonce = useRef(0);
  useEffect(() => {
    if (!s.event || s.event.nonce === nonce.current) return;
    nonce.current = s.event.nonce;
    if (s.event.text.includes('reached the database')) play('miss');
    else if (s.event.tone === 'good') play(s.event.text.startsWith('Wave') || s.event.text.startsWith('Every') ? 'contain' : 'blip');
    else if (s.event.tone === 'bad') play('tick');
  }, [s.event]);
  useEffect(() => {
    if (s.over && run.phase === 'play') run.finish(s.score, s.won);
  }, [s.over, s.score, s.won, run]);

  useGameKeys(run.phase === 'play', (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= FIXES.length) {
      act({ t: 'select', fix: FIXES[n - 1]!.id });
      return true;
    }
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const m = moves[e.key];
    if (m) {
      act({ t: 'cursor', dc: m[0], dr: m[1] });
      return true;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      act({ t: 'place' });
      return true;
    }
    if (e.key === 'n' || e.key === 'N') {
      act({ t: 'send' });
      return true;
    }
    return false;
  });

  const preview = wavePreview(s);
  const inspected = inspect !== null ? s.fixes.find((f) => f.id === inspect) : undefined;
  const hud = [
    { label: 'Score', value: score(s.score) },
    { label: 'Data leaked', value: `${s.leak}%`, tone: s.leak >= 60 ? ('warn' as const) : undefined },
    { label: 'Budget', value: score(s.budget) },
    { label: 'Wave', value: `${Math.min(s.wave + 1, WAVE_COUNTS.length)} of ${WAVE_COUNTS.length}` },
  ];
  const missed = s.fixes.flatMap((f) => Object.entries(f.passedBy).map(([a, n]) => ({ fix: f.fix, attack: a as keyof typeof ATTACK_BY_ID, n: n ?? 0 })));

  return (
    <ArcadeShell
      game={game}
      run={run}
      hud={hud}
      overTitle={run.won ? 'The database held' : 'Too much data leaked'}
      overLine={`${s.stops} attacks stopped, ${s.leaks} reached the database, over ${Math.min(s.wave + (run.won ? 0 : 1), WAVE_COUNTS.length)} wave${s.wave === 0 ? '' : 's'}.`}
      overExtra={
        missed.length ? (
          <section className="ar-review" aria-labelledby="td-review">
            <h3 id="td-review">Fixes that were in the wrong place</h3>
            <ul>
              {dedupe(missed).map((m) => (
                <li key={`${m.fix}-${m.attack}`}>
                  <strong>
                    {FIX_BY_ID[m.fix].name} against {ATTACK_BY_ID[m.attack].name.toLowerCase()}
                  </strong>
                  <span className="small muted"> · walked past {m.n} time{m.n === 1 ? '' : 's'}</span>
                  <span className="why">{ATTACK_BY_ID[m.attack].why}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null
      }
    >
      <div className="td">
        <Board s={s} act={act} onInspect={setInspect} />
        <aside className="td-side" aria-label="Fixes and the next wave">
          <section className="td-wave" aria-live="polite">
            <div className="row">
              <h2 className="grow">{s.phase === 'build' ? `Wave ${s.wave + 1} in ${Math.ceil(s.buildLeft / 1000)}s` : `Wave ${s.wave + 1} is on`}</h2>
              {s.phase === 'build' ? (
                <button type="button" className="cbtn cbtn-sm" onClick={() => act({ t: 'send' })} aria-keyshortcuts="N">
                  Send it now
                </button>
              ) : null}
            </div>
            <ul className="td-preview" aria-label="Attacks in this wave">
              {preview.map((p) => (
                <li key={p.type} title={ATTACK_BY_ID[p.type].name}>
                  <AttackGlyph type={p.type} size={16} />
                  <span>{ATTACK_BY_ID[p.type].short}</span>
                  <span className="tnum muted">×{p.count}</span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-label="Fixes you can place">
            <div className="td-palette" role="radiogroup" aria-label="Pick a fix">
              {FIXES.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={s.selected === f.id}
                  className="td-fix"
                  data-sel={s.selected === f.id}
                  disabled={s.budget < f.cost}
                  onClick={() => act({ t: 'select', fix: f.id })}
                  title={f.what}
                >
                  <FixGlyph fix={f.id} size={16} />
                  <span className="td-fix-name">
                    <span className="hide-sm">{f.name}</span>
                    <span className="show-sm">{f.short}</span>
                  </span>
                  <span className="td-fix-stops hide-sm">{f.stops ? `Stops ${ATTACK_BY_ID[f.stops].short}` : 'Slows all'}</span>
                  <span className="td-fix-cost tnum">{f.cost}</span>
                  <kbd className="hide-sm">{i + 1}</kbd>
                </button>
              ))}
            </div>
          </section>
          <p className="ar-msg td-msg" data-tone={s.event?.tone === 'info' ? undefined : s.event?.tone} aria-live="polite">
            {inspected ? (
              <>
                <strong>{FIX_BY_ID[inspected.fix].name}.</strong> {FIX_BY_ID[inspected.fix].what} Stopped {inspected.stopped}
                {Object.keys(inspected.passedBy).length ? `, let through ${Object.entries(inspected.passedBy).map(([a, n]) => `${ATTACK_BY_ID[a as keyof typeof ATTACK_BY_ID].short} ×${n}`).join(', ')}` : ''}.
              </>
            ) : (
              s.event?.text ?? 'Pick a fix, then a tile beside a route. A fix covers the route tiles around it.'
            )}
          </p>
          <div className="ar-pads td-pads" style={{ ['--pads' as string]: 2 }}>
            <PadButton label="Place on cursor" keyHint="Enter" onPress={() => act({ t: 'place' })} />
            <PadButton label="Send wave" keyHint="N" onPress={() => act({ t: 'send' })} disabled={s.phase !== 'build'} />
          </div>
        </aside>
      </div>
    </ArcadeShell>
  );
}

function dedupe<T extends { fix: FixId; attack: string; n: number }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    const k = `${r.fix}-${r.attack}`;
    const prev = m.get(k);
    m.set(k, prev ? { ...prev, n: prev.n + r.n } : r);
  }
  return [...m.values()].slice(0, 6);
}

function Board({ s, act, onInspect }: { s: TowerState; act: (a: TowerAction) => void; onInspect: (id: number | null) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const tile = useTile(wrap);
  const [hover, setHover] = useState<{ c: number; r: number } | null>(null);
  const aim = hover ?? s.cursor;
  const sel = s.selected ? FIX_BY_ID[s.selected] : null;
  const canAim = buildable(s, aim.c, aim.r);
  const covered = useMemo(() => {
    if (!sel || !canAim) return new Set<string>();
    const out = new Set<string>();
    for (const r of ROUTES) for (const t of r.tiles) if (covers(aim, t)) out.add(`${t.c},${t.r}`);
    return out;
  }, [sel, canAim, aim]);
  const flash = s.event?.at && s.event.tone !== 'info' ? { ...s.event.at, tone: s.event.tone, nonce: s.event.nonce } : null;
  const unitPx = tile * UNIT_SIZE;

  const cells = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const route = isRoute(c, r);
      const db = c === DB.c && r === DB.r;
      const fix = s.fixes.find((f) => f.c === c && f.r === r);
      const can = !route && !fix && buildable(s, c, r);
      const isCursor = s.cursor.c === c && s.cursor.r === r;
      cells.push(
        <button
          key={`${c},${r}`}
          type="button"
          className="td-tile"
          data-kind={db ? 'db' : route ? 'route' : fix ? 'fix' : can ? 'open' : 'far'}
          data-cover={covered.has(`${c},${r}`)}
          data-entry={r === 0 && ROUTES.some((rt) => rt.tiles[0]!.c === c && rt.tiles[0]!.r === r)}
          data-cursor={isCursor}
          data-flash={flash && flash.c === c && flash.r === r ? flash.tone : undefined}
          style={{ left: c * tile, top: r * tile, width: tile, height: tile }}
          tabIndex={-1}
          aria-label={db ? 'Database' : route ? 'Route' : fix ? `${FIX_BY_ID[fix.fix].name}, stopped ${fix.stopped}` : can ? `Empty tile, column ${c + 1}, row ${r + 1}` : 'Too far from a route'}
          title={fix ? `${FIX_BY_ID[fix.fix].name}: ${FIX_BY_ID[fix.fix].stops ? `stops ${ATTACK_BY_ID[FIX_BY_ID[fix.fix].stops!].name.toLowerCase()} only` : 'slows everything, stops nothing'}` : undefined}
          onPointerEnter={() => setHover({ c, r })}
          onPointerLeave={() => setHover(null)}
          onClick={() => {
            act({ t: 'cursor-set', c, r });
            if (fix) onInspect(fix.id);
            else {
              onInspect(null);
              if (!route) act({ t: 'place' });
            }
          }}
        >
          {db ? (
            <span className="td-db">
              <AttackGlyph type="sqli" size={Math.round(tile * 0.4)} />
              <span>Data</span>
            </span>
          ) : fix ? (
            <span className="td-placed" data-waf={fix.fix === 'waf'}>
              <FixGlyph fix={fix.fix} size={Math.round(tile * 0.32)} />
              <span>{FIX_BY_ID[fix.fix].short}</span>
            </span>
          ) : null}
        </button>,
      );
    }

  return (
    <div className="td-boardwrap" ref={wrap}>
      <div className="td-entries" style={{ width: tile * COLS }} aria-hidden="true">
        {ROUTES.map((rt) => (
          <span key={rt.name} style={{ left: rt.tiles[0]!.c * tile, width: tile * 2.6, textAlign: rt.tiles[0]!.c === 0 ? 'left' : 'right', transform: rt.tiles[0]!.c === 0 ? undefined : `translateX(${-tile * 1.6}px)` }}>
            {rt.name}
          </span>
        ))}
      </div>
      <div className="td-board" style={{ width: tile * COLS, height: tile * ROWS, ['--tile' as string]: `${tile}px` }} role="group" aria-label="The grid: two routes from the internet down to the database">
        {cells}
        {s.units.map((u) => {
          const { x, y } = unitXY(u);
          const a = ATTACK_BY_ID[u.type];
          return (
            <span
              key={u.id}
              className="td-unit"
              data-testid="unit"
              data-type={u.type}
              style={{ width: unitPx, height: unitPx, transform: `translate3d(${(x + (1 - UNIT_SIZE) / 2) * tile}px, ${(y + (1 - UNIT_SIZE) / 2) * tile}px, 0)` }}
              title={a.name}
            >
              <AttackGlyph type={u.type} size={Math.round(tile * 0.3)} />
              <span>{a.short}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
