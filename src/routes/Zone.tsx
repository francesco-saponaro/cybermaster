import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useStore, zoneShapes } from '../state/store';
import { ZONE_BY_ID, ZONES } from '../content/zones';
import { LEVEL_BY_ID } from '../content/index';
import { Scope } from '../components/Scope';
import { Stars } from '../components/Stars';
import { levelUnlocked, nextLevelIn, zoneUnlocked, challengeUnlocked } from '../engine/progress';
import { BeatCard } from '../components/Beat';
import type { ZoneId } from '../content/types';
import { formatSeconds } from '../engine/scoring';
import { plain } from '../game/Rich';

/** The zone's levels as stations on a winding path. The line is drawn between the measured node centres, so it fits any width. */
export function ZonePage() {
  const { zoneId } = useParams({ strict: false }) as { zoneId: string };
  const { save, markBeat } = useStore();
  const zone = ZONE_BY_ID[zoneId];
  // The zone's briefing shows once on the first visit to an open zone, and again on request.
  const [beatOpen, setBeatOpen] = useState(() => !!zone && zoneUnlocked(save, zoneShapes, zone.id) && !save.story.beats.includes(zone.id));
  const closeBeat = useCallback(() => {
    setBeatOpen(false);
    if (zone) markBeat(zone.id);
  }, [zone, markBeat]);
  const mapRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [path, setPath] = useState<{ d: string; w: number; h: number; done: string }>({ d: '', w: 0, h: 0, done: '' });

  const cleared = (id: string) => (save.levels[id]?.stars ?? 0) >= 1;
  const levels = zone ? zone.levelIds.map((id) => LEVEL_BY_ID[id]!).filter(Boolean) : [];
  const doneCount = levels.filter((l) => cleared(l.id)).length;

  useLayoutEffect(() => {
    const draw = () => {
      const box = mapRef.current?.getBoundingClientRect();
      if (!box) return;
      const pts = nodeRefs.current.map((el) => {
        const r = el?.getBoundingClientRect();
        return r ? { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 } : null;
      });
      const seg = (from: number, to: number) => {
        let d = '';
        for (let i = from; i < to; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          if (!a || !b) continue;
          const my = (a.y + b.y) / 2;
          d += `${i === from ? `M${a.x},${a.y}` : ''} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`;
        }
        return d;
      };
      setPath({ d: seg(0, pts.length - 1), done: seg(0, Math.max(0, Math.min(doneCount, pts.length - 1))), w: box.width, h: box.height });
    };
    draw();
    const ro = new ResizeObserver(draw);
    if (mapRef.current) ro.observe(mapRef.current);
    return () => ro.disconnect();
  }, [zoneId, doneCount]);

  if (!zone) {
    return (
      <div className="wrap" style={{ paddingBlock: 60 }}>
        <h1 style={{ fontSize: 'var(--step-head)' }}>Unknown zone</h1>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>Back to the zones</Link>
      </div>
    );
  }

  const open = zoneUnlocked(save, zoneShapes, zone.id);
  const nextId = nextLevelIn(save, zone);
  const next = nextId ? LEVEL_BY_ID[nextId] : undefined;
  const zi = ZONES.findIndex((z) => z.id === zone.id);

  return (
    <div className="wrap zone-page">
      <Link to="/" className="navlink" style={{ paddingLeft: 0, display: 'inline-block', marginBottom: 10 }}>&larr; All zones</Link>
      <header style={{ marginBottom: 18 }}>
        <p className="eyebrow">Zone {zi + 1} of {ZONES.length}</p>
        <h1 style={{ fontSize: 'clamp(1.5rem, 1.2rem + 1vw, 2rem)' }}>{zone.name}</h1>
        <p style={{ color: 'var(--muted)', margin: '6px 0 0', fontSize: 'var(--step-lead)', lineHeight: 1.3 }}>{zone.tagline}</p>
      </header>
      {beatOpen && open ? <BeatCard zoneId={zone.id as ZoneId} onClose={closeBeat} /> : null}
      <div className="zone-grid">
        <div>
          <div className="zmap" ref={mapRef} aria-label={`${zone.name} levels`}>
            <svg className="zmap-line" width={path.w} height={path.h} aria-hidden="true">
              <path d={path.d} fill="none" stroke="#333" strokeWidth="2" strokeDasharray="4 6" />
              <path d={path.done} fill="none" stroke="var(--accent)" strokeWidth="2" />
            </svg>
            <ol className="zmap-list">
              {levels.map((l, i) => {
                const unlocked = open && levelUnlocked(save, zoneShapes, l.id);
                const run = save.levels[l.id];
                const isNext = unlocked && l.id === nextId && !cleared(l.id);
                const chal = save.challenges[l.id];
                const chalOpen = challengeUnlocked(save, l.id);
                const inner = (
                  <>
                    <span className="znode" ref={(el) => { nodeRefs.current[i] = el; }} data-next={isNext}>
                      <Scope size={l.boss ? 60 : 50} locked={!unlocked} cleared={cleared(l.id)} filled={cleared(l.id)} />
                    </span>
                    <span className="zlabel">
                      <span className="zmeta">{l.boss ? 'Boss' : `Level ${i + 1}`}{run ? ` · best ${formatSeconds(run.bestSeconds)}` : ''}</span>
                      <span className="ztitle">{l.title}</span>
                      {run ? null : <span className="zmeta">{unlocked ? l.goal : 'Locked'}</span>}
                    </span>
                  </>
                );
                return (
                  <li key={l.id} className="zstop" data-side={i % 2 ? 'right' : 'left'}>
                    <div className="zcard">
                      {unlocked ? (
                        <Link to="/play/$levelId" params={{ levelId: l.id }} className="zlink" data-locked="false">{inner}</Link>
                      ) : (
                        <span className="zlink" data-locked="true" aria-disabled="true">{inner}</span>
                      )}
                      {unlocked ? (
                        <div className="zmedals">
                          <span className="medal" data-earned={!!run}>
                            <span className="medal-k">Guided</span>
                            {run ? <Stars count={run.stars} size={12} /> : <span className="medal-v">to do</span>}
                          </span>
                          {chalOpen ? (
                            <Link to="/challenge/$levelId" params={{ levelId: l.id }} search={{}} className="medal medal-link" data-earned={!!chal} aria-label={`Challenge for ${l.title}${chal ? `, ${chal.stars} of 3 stars` : ', not cleared yet'}`}>
                              <span className="medal-k">Challenge</span>
                              {chal ? <Stars count={chal.stars} size={12} /> : <span className="medal-v">play</span>}
                            </Link>
                          ) : (
                            <span className="medal" data-earned="false" title="Clear the guided level to open its challenge">
                              <span className="medal-k">Challenge</span>
                              <span className="medal-v">after the steps</span>
                            </span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        <aside className="zone-side">
          <div className="panel" style={{ padding: 20 }}>
            <p className="eyebrow">How it plays</p>
            <p style={{ margin: '6px 0 0' }}>{plain(zone.intro)}</p>
            <div className="meter" style={{ marginTop: 16 }} role="progressbar" aria-label="Levels cleared" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={levels.length}>
              <span style={{ width: `${(doneCount / levels.length) * 100}%` }} />
            </div>
            <p className="tnum" style={{ color: 'var(--muted)', fontSize: 'var(--step-small)', margin: '8px 0 0' }}>
              {doneCount} of {levels.length} cleared · {levels.filter((l) => (save.challenges[l.id]?.stars ?? 0) >= 1).length} of {levels.length} challenges
            </p>
            {!open ? (
              <p style={{ margin: '16px 0 0', color: 'var(--muted)' }}>Clear the last level of {ZONES[zi - 1]?.name} to open this zone.</p>
            ) : next ? (
              <Link to="/play/$levelId" params={{ levelId: next.id }} className="btn btn-primary" style={{ marginTop: 18, width: '100%' }}>
                {cleared(next.id) ? `Replay ${next.title}` : `Play ${next.title}`}
              </Link>
            ) : null}
            {open ? (
              <button type="button" className="btn btn-ghost zone-beat" onClick={() => setBeatOpen(true)}>
                Replay the briefing
              </button>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
