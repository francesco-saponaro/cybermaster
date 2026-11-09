import { useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useStore, type MissionOutcome } from '../state/store';
import { MISSION_BY_ID } from '../content/index';
import { BRIEFING_BY_MISSION } from '../content/briefings';
import type { Mistake } from '../content/types';
import { Result, MissionFrame } from '../components/MissionShell';
import { Briefing } from '../components/Briefing';
import { MissionView } from '../missions/MissionPlayer';
import { HintContext } from '../missions/mission';
import { HINT_COST } from '../engine/scoring';

type Phase = 'brief' | 'play' | 'result';

export function MissionPage() {
  const { missionId } = useParams({ from: '/missions/$missionId' });
  const { completeMission, save, spendHint } = useStore();
  const mission = MISSION_BY_ID[missionId];
  const briefing = BRIEFING_BY_MISSION[missionId];
  const clearedBefore = (save.missions[missionId]?.clears ?? 0) > 0;

  const startInPlay = (() => {
    try {
      return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('play');
    } catch {
      return false;
    }
  })();
  const [phase, setPhase] = useState<Phase>(briefing && !startInPlay ? 'brief' : 'play');
  const [score, setScore] = useState(0);
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [outcome, setOutcome] = useState<MissionOutcome | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [hintActive, setHintActive] = useState(false);

  const hintState = useMemo(
    () => ({
      active: hintActive,
      available: !hintActive && save.xp >= HINT_COST,
      use: () => {
        if (hintActive) return;
        if (spendHint()) setHintActive(true);
      },
    }),
    [hintActive, save.xp, spendHint],
  );

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

  function handleFinish(result: { score: number; mistakes: Mistake[] }) {
    const outc = completeMission(mission!.id, result.score);
    setScore(result.score);
    setMistakes(result.mistakes);
    setOutcome(outc);
    setPhase('result');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startPlay() {
    setHintActive(false);
    setPhase('play');
  }

  function replay() {
    setRunKey((k) => k + 1);
    setHintActive(false);
    setScore(0);
    setMistakes([]);
    setOutcome(null);
    setPhase(briefing ? 'brief' : 'play');
  }

  return (
    <MissionFrame mission={mission}>
      {phase === 'brief' && briefing && (
        <div>
          <div style={{ maxWidth: 760, margin: '0 auto 16px' }}>
            <p style={{ margin: 0, color: 'var(--accent-text)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.8rem' }}>
              Briefing · {mission.minutes}-minute mission · {mission.xp} XP
            </p>
            <h1 style={{ fontSize: 'var(--step-head)', marginTop: 4 }}>{mission.title}</h1>
            <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>{mission.brief}</p>
          </div>
          <Briefing
            briefing={briefing}
            mentor={briefing.mentor}
            onDone={startPlay}
            onSkip={clearedBefore ? startPlay : undefined}
          />
        </div>
      )}
      {phase === 'play' && (
        <div key={runKey}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <h1 style={{ fontSize: 'var(--step-lead)', fontFamily: 'var(--font-display)', fontWeight: 700, flex: 1, minWidth: 0 }}>{mission.title}</h1>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={hintState.use}
              disabled={!hintState.available && !hintState.active}
              aria-pressed={hintState.active}
              style={hintState.active ? { borderColor: 'var(--accent)', color: 'var(--accent-text)' } : undefined}
            >
              {hintState.active ? 'Hint on' : `Hint (${HINT_COST} XP)`}
            </button>
          </div>
          <HintContext.Provider value={hintState}>
            <MissionView mission={mission} onFinish={handleFinish} />
          </HintContext.Provider>
        </div>
      )}
      {phase === 'result' && <Result mission={mission} score={score} mistakes={mistakes} outcome={outcome} onReplay={replay} />}
    </MissionFrame>
  );
}
