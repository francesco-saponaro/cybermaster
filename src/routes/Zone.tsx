import { Link, useParams } from '@tanstack/react-router';
import { useStore } from '../state/store';
import { ZONE_BY_ID } from '../content/zones';
import { MISSION_BY_ID } from '../content/index';
import { Scope } from '../components/Scope';
import { Stars } from '../components/Stars';
import { isMissionOpen } from './Home';

export function ZonePage() {
  const { zoneId } = useParams({ from: '/zones/$zoneId' });
  const { save } = useStore();
  const zone = ZONE_BY_ID[zoneId];

  if (!zone) {
    return (
      <div className="wrap" style={{ paddingBlock: 60 }}>
        <h1 style={{ fontSize: 'var(--step-head)' }}>Unknown zone</h1>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
          Back to the board
        </Link>
      </div>
    );
  }

  const missions = zone.missionIds.map((id) => MISSION_BY_ID[id]!);
  const boss = MISSION_BY_ID[zone.bossId]!;

  return (
    <div className="wrap" style={{ paddingBlock: 'clamp(28px, 5vw, 56px)' }}>
      <Link to="/" className="navlink" style={{ paddingLeft: 0, display: 'inline-block', marginBottom: 14 }}>
        &larr; Mission board
      </Link>

      <header style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <Scope size={72} />
        <div>
          <h1 style={{ fontSize: 'var(--step-head)' }}>{zone.name}</h1>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0', fontSize: 'var(--step-lead)' }}>{zone.tagline}</p>
        </div>
      </header>
      <div className="panel" style={{ padding: '16px 20px', margin: '18px 0 28px', maxWidth: 720 }}>
        {zone.intro.map((p, i) => (
          <p key={i} style={{ margin: i ? '10px 0 0' : 0 }}>
            {p}
          </p>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {missions.map((mission, i) => {
          const open = isMissionOpen(save, zone.id, mission.id);
          const run = save.missions[mission.id];
          void i;
          return (
            <MissionRow key={mission.id} missionId={mission.id} title={mission.title} brief={mission.brief} kind={kindLabel(mission.kind)} xp={mission.xp} open={open} best={run?.best} stars={run?.stars ?? 0} />
          );
        })}

        {/* boss */}
        <BossRow zoneId={zone.id} bossId={boss.id} title={boss.title} brief={boss.brief} xp={boss.xp} open={isMissionOpen(save, zone.id, boss.id)} best={save.missions[boss.id]?.best} stars={save.missions[boss.id]?.stars ?? 0} />
      </div>
    </div>
  );
}

function MissionRow({
  missionId,
  title,
  brief,
  kind,
  xp,
  open,
  best,
  stars,
}: {
  missionId: string;
  title: string;
  brief: string;
  kind: string;
  xp: number;
  open: boolean;
  best?: number;
  stars: number;
}) {
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Scope size={44} locked={!open} cleared={(best ?? 0) >= 50} progress={best ? best / 100 : undefined} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '1.15rem' }}>{title}</h3>
            <span className="tag">{kind}</span>
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 'var(--step-small)' }}>{brief}</p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        {(best ?? 0) >= 50 ? <Stars count={stars} /> : <span className="tnum" style={{ color: 'var(--muted)', fontSize: 'var(--step-small)' }}>{xp} XP</span>}
        {open ? (
          <span className="btn btn-primary btn-sm" style={{ pointerEvents: 'none' }}>
            {(best ?? 0) >= 50 ? 'Replay' : 'Play'}
          </span>
        ) : (
          <span className="tag">Locked</span>
        )}
      </div>
    </>
  );

  if (!open) {
    return (
      <div className="panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, opacity: 0.5, flexWrap: 'wrap' }}>
        {inner}
      </div>
    );
  }
  return (
    <Link
      to="/missions/$missionId"
      params={{ missionId }}
      className="panel"
      style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, textDecoration: 'none', color: 'inherit', flexWrap: 'wrap' }}
    >
      {inner}
    </Link>
  );
}

function BossRow({ zoneId, bossId, title, brief, xp, open, best, stars }: { zoneId: string; bossId: string; title: string; brief: string; xp: number; open: boolean; best?: number; stars: number }) {
  void zoneId;
  const content = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Scope size={52} locked={!open} cleared={(best ?? 0) >= 50} filled={(best ?? 0) >= 50} />
        <div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: '1.25rem' }}>{title}</h3>
            <span className="tag" data-tone="accent">
              Boss
            </span>
          </div>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 'var(--step-small)', maxWidth: 520 }}>{brief}</p>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {(best ?? 0) >= 50 ? <Stars count={stars} /> : <span className="tnum" style={{ color: 'var(--muted)', fontSize: 'var(--step-small)' }}>{xp} XP</span>}
        {open ? (
          <span className="btn btn-primary btn-sm" style={{ pointerEvents: 'none' }}>
            {(best ?? 0) >= 50 ? 'Replay' : 'Fight'}
          </span>
        ) : (
          <span className="tag">Clear the missions first</span>
        )}
      </div>
    </div>
  );
  if (!open) {
    return (
      <div className="panel" style={{ padding: '16px 18px', borderColor: 'var(--accent-dim)', opacity: 0.55 }}>
        {content}
      </div>
    );
  }
  return (
    <Link to="/missions/$missionId" params={{ missionId: bossId }} className="panel" style={{ padding: '16px 18px', borderColor: 'var(--accent)', textDecoration: 'none', color: 'inherit', display: 'block' }}>
      {content}
    </Link>
  );
}

function kindLabel(kind: string): string {
  const map: Record<string, string> = {
    inspect: 'Packet Inspector',
    intercept: 'Intercept',
    live: 'Live session',
    match: 'Fix & Match',
    cards: 'Card sort',
    arena: 'Arena',
    sweep: 'Port Sweep',
    cvss: 'CVSS Forge',
    triage: 'Triage',
    audit: 'Cloud Watch',
    sort: 'Sort',
    api: 'API Gate',
    order: 'Sequence',
    report: 'Report',
    boss: 'Boss',
  };
  return map[kind] ?? kind;
}
