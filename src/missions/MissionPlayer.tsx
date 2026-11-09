import { useState } from 'react';
import type { Mission, BossMission, MissionResult } from '../content/types';
import { MISSION_BY_ID } from '../content/index';
import { InspectMissionView } from './InspectMission';
import { InterceptMissionView } from './InterceptMission';
import { LiveMissionView } from './LiveMission';
import { MatchMissionView } from './MatchMission';
import { CardsMissionView } from './CardsMission';
import { ArenaMissionView } from './ArenaMission';
import { SweepMissionView } from './SweepMission';
import { CvssMissionView } from './CvssMission';
import { TriageMissionView } from './TriageMission';
import { AuditMissionView } from './AuditMission';
import { SortMissionView } from './SortMission';
import { ApiMissionView } from './ApiMission';
import { OrderMissionView } from './OrderMission';
import { ReportMissionView } from './ReportMission';
import { Briefing } from '../components/Briefing';
import { BRIEFING_BY_MISSION } from '../content/briefings';

// Renders one mission (not a boss) and reports its result.
export function MissionView({ mission, onFinish }: { mission: Mission; onFinish: (r: MissionResult) => void }) {
  switch (mission.kind) {
    case 'inspect':
      return <InspectMissionView mission={mission} onFinish={onFinish} />;
    case 'intercept':
      return <InterceptMissionView mission={mission} onFinish={onFinish} />;
    case 'live':
      return <LiveMissionView mission={mission} onFinish={onFinish} />;
    case 'match':
      return <MatchMissionView mission={mission} onFinish={onFinish} />;
    case 'cards':
      return <CardsMissionView mission={mission} onFinish={onFinish} />;
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
    case 'sort':
      return <SortMissionView mission={mission} onFinish={onFinish} />;
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

// A boss runs its stages in order, each with its own briefing, and averages the scores.
function BossView({ mission, onFinish }: { mission: BossMission; onFinish: (r: MissionResult) => void }) {
  const stages = mission.stages.map((id) => MISSION_BY_ID[id]).filter(Boolean) as Mission[];
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<MissionResult[]>([]);
  const [phase, setPhase] = useState<'brief' | 'play'>('brief');

  const stage = stages[index];
  const briefing = stage ? BRIEFING_BY_MISSION[stage.id] : undefined;
  // The boss has its own briefing already; a stage only re-briefs when it has
  // one of its own, otherwise it goes straight to play.
  const effectivePhase = briefing ? phase : 'play';
  if (!stage) return null;

  function handleStage(r: MissionResult) {
    const next = [...results, r];
    setResults(next);
    if (index + 1 >= stages.length) {
      const score = Math.round(next.reduce((a, b) => a + b.score, 0) / next.length);
      onFinish({ score, mistakes: next.flatMap((x) => x.mistakes) });
    } else {
      setIndex((i) => i + 1);
      setPhase('brief');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {stages.map((_, i) => (
          <span key={i} style={{ flex: 1, height: 4, borderRadius: 999, background: i < results.length ? 'var(--accent)' : i === index ? 'var(--muted)' : 'var(--surface-2)' }} />
        ))}
      </div>
      {effectivePhase === 'brief' && briefing ? (
        <div>
          <p style={{ color: 'var(--accent-text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', textAlign: 'center' }}>
            Boss · Stage {index + 1} of {stages.length} · {stage.title}
          </p>
          <Briefing briefing={briefing} mentor={briefing.mentor} onDone={() => setPhase('play')} onSkip={() => setPhase('play')} />
        </div>
      ) : (
        <div>
          <p style={{ color: 'var(--accent-text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem', marginBottom: 8 }}>
            Boss · Stage {index + 1} of {stages.length} · {stage.title}
          </p>
          <MissionView mission={stage} onFinish={handleStage} />
        </div>
      )}
    </div>
  );
}
