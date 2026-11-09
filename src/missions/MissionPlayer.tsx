import { useState } from 'react';
import type { Mission, BossMission } from '../content/types';
import { MISSION_BY_ID } from '../content/index';
import { InspectMissionView } from './InspectMission';
import { MatchMissionView } from './MatchMission';
import { ArenaMissionView } from './ArenaMission';
import { SweepMissionView } from './SweepMission';
import { CvssMissionView } from './CvssMission';
import { TriageMissionView } from './TriageMission';
import { AuditMissionView } from './AuditMission';
import { ApiMissionView } from './ApiMission';
import { OrderMissionView } from './OrderMission';
import { ReportMissionView } from './ReportMission';

// Renders one mission (not a boss) and calls onFinish with its 0..100 score.
export function MissionView({ mission, onFinish }: { mission: Mission; onFinish: (score: number) => void }) {
  switch (mission.kind) {
    case 'inspect':
      return <InspectMissionView mission={mission} onFinish={onFinish} />;
    case 'match':
      return <MatchMissionView mission={mission} onFinish={onFinish} />;
    case 'arena':
      return <ArenaMissionView mission={mission} onFinish={onFinish} />;
    case 'sweep':
      return <SweepMissionView mission={mission} onFinish={onFinish} />;
    case 'cvss':
      return <CvssMissionView mission={mission} onFinish={onFinish} />;
    case 'triage':
      return <TriageMissionView mission={mission} onFinish={onFinish} />;
    case 'audit':
      return <AuditMissionView mission={mission} onFinish={onFinish} />;
    case 'api':
      return <ApiMissionView mission={mission} onFinish={onFinish} />;
    case 'order':
      return <OrderMissionView mission={mission} onFinish={onFinish} />;
    case 'report':
      return <ReportMissionView mission={mission} onFinish={onFinish} />;
    case 'boss':
      return <BossView mission={mission} onFinish={onFinish} />;
    default:
      return null;
  }
}

// A boss runs its stages in order and averages their scores.
function BossView({ mission, onFinish }: { mission: BossMission; onFinish: (score: number) => void }) {
  const stages = mission.stages.map((id) => MISSION_BY_ID[id]).filter(Boolean) as Mission[];
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<number[]>([]);
  const [showIntro, setShowIntro] = useState(true);

  const stage = stages[index];
  if (!stage) return null;

  function handleStage(score: number) {
    const next = [...scores, score];
    setScores(next);
    if (index + 1 >= stages.length) {
      onFinish(Math.round(next.reduce((a, b) => a + b, 0) / next.length));
    } else {
      setIndex((i) => i + 1);
      setShowIntro(true);
    }
  }

  if (showIntro) {
    return (
      <div className="panel rise" style={{ padding: 'clamp(20px,4vw,36px)', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
        <p style={{ color: 'var(--accent-text)', fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0 }}>
          Boss · Stage {index + 1} of {stages.length}
        </p>
        <h2 style={{ fontSize: 'var(--step-head)', margin: '8px 0' }}>{stage.title}</h2>
        <p>{stage.brief}</p>
        {scores.length > 0 && (
          <p className="tnum" style={{ color: 'var(--muted)' }}>
            So far: {scores.join(' · ')}
          </p>
        )}
        <button type="button" className="btn btn-primary" onClick={() => setShowIntro(false)}>
          Start stage {index + 1}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {stages.map((_, i) => (
          <span
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 999,
              background: i < scores.length ? 'var(--accent)' : i === index ? 'var(--muted)' : 'var(--surface-2)',
            }}
          />
        ))}
      </div>
      <MissionView mission={stage} onFinish={handleStage} />
    </div>
  );
}
