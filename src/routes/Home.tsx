import { Link } from '@tanstack/react-router';
import { useStore, zoneShapes } from '../state/store';
import { ZONES } from '../content/zones';
import { ALL_LEVELS, LEVEL_BY_ID } from '../content/index';
import { CODEX } from '../content/codex';
import { Scope } from '../components/Scope';
import { XpBar } from '../components/Hud';
import { zoneUnlocked, nextLevelIn, rankForLevel, levelFromXp } from '../engine/progress';

export function HomePage() {
  const { save } = useStore();
  const cleared = ALL_LEVELS.filter((l) => (save.levels[l.id]?.stars ?? 0) >= 1).length;
  const started = cleared > 0 || save.xp > 0;
  // The next level: the first not cleared in the furthest open zone that still has one.
  const openZones = ZONES.filter((z) => zoneUnlocked(save, zoneShapes, z.id));
  const zoneForNext = openZones.find((z) => z.levelIds.some((id) => (save.levels[id]?.stars ?? 0) < 1)) ?? openZones[openZones.length - 1]!;
  const nextId = nextLevelIn(save, zoneForNext)!;
  const next = LEVEL_BY_ID[nextId]!;

  return (
    <div>
      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--line)' }}>
        <div aria-hidden="true" className="hero-scope">
          <Scope size={760} spin />
        </div>
        <div className="wrap" style={{ position: 'relative', paddingBlock: 'clamp(44px, 8vw, 104px)' }}>
          <div style={{ maxWidth: 660 }}>
            <h1 className="rise" style={{ fontSize: 'var(--step-hero)', lineHeight: 0.92 }}>Join the Watch.</h1>
            <p className="rise" style={{ fontSize: 'var(--step-lead)', marginTop: 20, maxWidth: 560 }}>
              Learn security by doing it in small sandboxes: edit raw HTTP, fix vulnerable code, sweep a network from a terminal, lock down a cloud account and write the finding.
            </p>
            <div className="rise" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
              <Link to="/play/$levelId" params={{ levelId: next.id }} className="btn btn-primary">
                {started ? `Continue: ${next.title}` : 'Play the first level'}
              </Link>
              <Link to="/codex" className="btn btn-ghost">Open the codex</Link>
            </div>
            <div className="rise" style={{ marginTop: 34, maxWidth: 420 }}>
              <XpBar />
              <p className="tnum" style={{ color: 'var(--muted)', fontSize: 'var(--step-small)', marginTop: 10 }}>
                {rankForLevel(levelFromXp(save.xp))} · {cleared} of {ALL_LEVELS.length} levels · {save.codex.length} of {CODEX.length} codex entries
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap" style={{ paddingBlock: 'clamp(40px, 6vw, 72px)' }}>
        <h2 style={{ fontSize: 'var(--step-head)', marginBottom: 8 }}>The route</h2>
        <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 32, maxWidth: 600 }}>
          Five zones, one sandbox each, in the order the job goes. Clear a zone's last level to open the next.
        </p>
        <ol className="route">
          {ZONES.map((zone, i) => {
            const open = zoneUnlocked(save, zoneShapes, zone.id);
            const done = zone.levelIds.filter((id) => (save.levels[id]?.stars ?? 0) >= 1).length;
            const complete = done === zone.levelIds.length;
            return (
              <li key={zone.id} className="route-stop" data-open={open}>
                <Link to="/zones/$zoneId" params={{ zoneId: zone.id }} className="route-link">
                  <span className="route-node">
                    <Scope size={64} progress={done / zone.levelIds.length} cleared={complete} locked={!open} />
                  </span>
                  <span className="route-text">
                    <span className="eyebrow">Zone {i + 1}</span>
                    <span className="route-name">{zone.name}</span>
                    <span className="route-tag">{zone.tagline}</span>
                    <span className="route-count tnum">{open ? `${done} of ${zone.levelIds.length} cleared` : 'Locked'}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
