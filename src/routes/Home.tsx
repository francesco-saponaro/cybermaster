import { Link } from '@tanstack/react-router';
import { useStore } from '../state/store';
import { ZONES } from '../content/zones';
import { playableMissions } from '../content/index';
import { CODEX } from '../content/codex';
import { Scope } from '../components/Scope';
import { XpBar } from '../components/Hud';
import { zoneUnlocked, missionUnlocked, rankForLevel, levelFromXp } from '../engine/progress';
import { Stars } from '../components/Stars';

const zoneShapes = ZONES.map((z) => ({ id: z.id, bossId: z.bossId }));

export function HomePage() {
  const { save } = useStore();
  const started = save.xp > 0 || Object.keys(save.missions).length > 0 || !!save.name;
  const level = levelFromXp(save.xp);

  return (
    <div>
      <Hero started={started} level={level} />
      <Board />
    </div>
  );
}

function Hero({ started, level }: { started: boolean; level: number }) {
  const { save } = useStore();
  const total = playableMissions().length;
  const cleared = playableMissions().filter((m) => (save.missions[m.id]?.best ?? 0) >= 50).length;
  return (
    <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--line)' }}>
      {/* The motif at enormous scale, cropped by the viewport */}
      <div aria-hidden="true" style={{ position: 'absolute', right: '-18vw', top: '50%', transform: 'translateY(-50%)', width: '70vw', maxWidth: 820, opacity: 0.9, pointerEvents: 'none' }}>
        <Scope size={820} spin />
      </div>
      <div className="wrap" style={{ position: 'relative', paddingBlock: 'clamp(48px, 9vw, 120px)', maxWidth: 'var(--maxw)' }}>
        <div style={{ maxWidth: 680 }}>
          <h1 className="rise" style={{ fontSize: 'var(--step-hero)', lineHeight: 0.92 }}>
            Join the Watch.
          </h1>
          <p className="rise" style={{ fontSize: 'var(--step-lead)', marginTop: 20, maxWidth: 540 }}>
            A security team of one, and you are the new analyst. Learn to read traffic, stop the OWASP Top 10,
            sweep a network, audit a cloud account and write a finding a client can act on.
          </p>
          <div className="rise" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
            <Link to="/zones/$zoneId" params={{ zoneId: 'wire' }} className="btn btn-primary">
              {started ? 'Continue' : 'Start the first mission'}
            </Link>
            <Link to="/codex" className="btn btn-ghost">
              Open the codex
            </Link>
          </div>
          <div className="rise" style={{ marginTop: 36, maxWidth: 420 }}>
            <XpBar />
            <p className="tnum" style={{ color: 'var(--muted)', fontSize: 'var(--step-small)', marginTop: 10 }}>
              {rankForLevel(level)} · {cleared} of {total} missions cleared · {save.codex.length} of {CODEX.length} codex entries
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Board() {
  const { save } = useStore();
  return (
    <section className="wrap" style={{ paddingBlock: 'clamp(40px, 7vw, 80px)' }}>
      <h2 style={{ fontSize: 'var(--step-head)', marginBottom: 6 }}>Mission board</h2>
      <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 32, maxWidth: 560 }}>
        Five zones, each a part of the job. Clear a zone&apos;s boss to unlock the next.
      </p>

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))' }}>
        {ZONES.map((zone, i) => {
          const unlocked = zoneUnlocked(save, zoneShapes, zone.id);
          const all = [...zone.missionIds, zone.bossId];
          const cleared = all.filter((id) => (save.missions[id]?.best ?? 0) >= 50).length;
          const pct = cleared / all.length;
          const bossCleared = (save.missions[zone.bossId]?.best ?? 0) >= 50;
          return (
            <Link
              key={zone.id}
              to="/zones/$zoneId"
              params={{ zoneId: zone.id }}
              className="panel rise"
              style={{
                textDecoration: 'none',
                color: 'inherit',
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                opacity: unlocked ? 1 : 0.55,
                animationDelay: `${i * 70}ms`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Scope size={56} progress={pct} cleared={bossCleared} locked={!unlocked} />
                <div>
                  <p style={{ margin: 0, color: 'var(--accent-text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.78rem' }}>
                    Zone {i + 1}
                  </p>
                  <h3 style={{ fontSize: '1.4rem' }}>{zone.name}</h3>
                </div>
              </div>
              <p style={{ margin: 0, color: 'var(--muted)' }}>{zone.tagline}</p>
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="tnum" style={{ color: 'var(--muted)', fontSize: 'var(--step-small)' }}>
                  {cleared} / {all.length} cleared
                </span>
                {unlocked ? (
                  <span className="tag" data-tone={bossCleared ? 'good' : 'accent'}>
                    {bossCleared ? 'Complete' : cleared > 0 ? 'In progress' : 'Open'}
                  </span>
                ) : (
                  <span className="tag">Locked</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// A small per-zone mission preview used elsewhere.
export function MissionStars({ missionId }: { missionId: string }) {
  const { save } = useStore();
  const run = save.missions[missionId];
  return <Stars count={run?.stars ?? 0} />;
}

// re-export the unlock helper bound to zone data for the zone page
export function isMissionOpen(save: ReturnType<typeof useStore>['save'], zoneId: string, missionId: string): boolean {
  const zone = ZONES.find((z) => z.id === zoneId);
  if (!zone) return false;
  if (!zoneUnlocked(save, zoneShapes, zoneId)) return false;
  return missionUnlocked(save, { missionIds: zone.missionIds, bossId: zone.bossId }, missionId);
}
