import { useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useStore, type MissionOutcome } from '../state/store';
import { MISSION_BY_ID } from '../content/index';
import { Briefing, Result, MissionFrame } from '../components/MissionShell';
import { MissionView } from '../missions/MissionPlayer';

type Phase = 'brief' | 'play' | 'result';

export function MissionPage() {
  const { missionId } = useParams({ from: '/missions/$missionId' });
  const { completeMission } = useStore();
  const mission = MISSION_BY_ID[missionId];
  const [phase, setPhase] = useState<Phase>('brief');
  const [score, setScore] = useState(0);
  const [outcome, setOutcome] = useState<MissionOutcome | null>(null);
  const [runKey, setRunKey] = useState(0);

  if (!mission || mission.id.startsWith('stage-')) {
    return (
      <div className="wrap" style={{ paddingBlock: 60 }}>
        <h1 style={{ fontSize: 'var(--step-head)' }}>Mission not found</h1>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
          Back to the board
        </Link>
      </div>
    );
  }

  function handleFinish(s: number) {
    const result = completeMission(mission!.id, s);
    setScore(s);
    setOutcome(result);
    setPhase('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function replay() {
    setRunKey((k) => k + 1);
    setPhase('play');
    setScore(0);
    setOutcome(null);
  }

  return (
    <MissionFrame mission={mission}>
      {phase === 'brief' && <Briefing mission={mission} onStart={() => setPhase('play')} />}
      {phase === 'play' && (
        <div key={runKey}>
          <div style={{ marginBottom: 18 }}>
            <h1 style={{ fontSize: 'var(--step-lead)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>{mission.title}</h1>
          </div>
          <MissionView mission={mission} onFinish={handleFinish} />
        </div>
      )}
      {phase === 'result' && <Result mission={mission} score={score} outcome={outcome} onReplay={replay} />}
    </MissionFrame>
  );
}
