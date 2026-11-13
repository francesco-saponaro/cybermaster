import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { LEVEL_BY_ID } from '../content/index';
import type { Level } from '../content/types';
import { generateChallenge } from '../content/challenges';
import { useStore, zoneShapes } from '../state/store';
import { levelUnlocked, challengeUnlocked, openLevels } from '../engine/progress';
import { randomSeed } from '../engine/rng';
import { dailyPick, utcDay } from '../engine/daily';
import { LevelShell } from '../game/LevelShell';
import { WireSandbox } from '../game/sandboxes/WireSandbox';
import { ArenaSandbox } from '../game/sandboxes/ArenaSandbox';
import { TerminalSandbox } from '../game/sandboxes/TerminalSandbox';
import { CloudSandbox } from '../game/sandboxes/CloudSandbox';
import { ReportSandbox } from '../game/sandboxes/ReportSandbox';
import { ScannerSandbox } from '../game/sandboxes/ScannerSandbox';
import type { ShellApi } from '../game/LevelShell';

function Sandbox({ level, api }: { level: Level; api: ShellApi }) {
  const props = { onChecks: api.onChecks, fail: api.fail };
  switch (level.kind) {
    case 'wire':
      return <WireSandbox level={level} {...props} act={api.act as never} />;
    case 'arena':
      return <ArenaSandbox level={level} {...props} act={api.act as never} />;
    case 'terminal':
      return <TerminalSandbox level={level} {...props} act={api.act as never} />;
    case 'cloud':
      return <CloudSandbox level={level} {...props} act={api.act as never} />;
    case 'report':
      return <ReportSandbox level={level} {...props} act={api.act as never} />;
    case 'scanner':
      return <ScannerSandbox level={level} {...props} act={api.act as never} />;
  }
}

function Blocked({ title, body, to }: { title: string; body: string; to: { zoneId: string } | null }) {
  return (
    <div className="wrap" style={{ paddingBlock: 60, maxWidth: 640 }}>
      <h1 style={{ fontSize: 'var(--step-head)' }}>{title}</h1>
      <p style={{ color: 'var(--muted)' }}>{body}</p>
      {to ? (
        <Link to="/zones/$zoneId" params={to} className="btn btn-primary" style={{ marginTop: 8 }}>
          Open the zone map
        </Link>
      ) : (
        <Link to="/" className="btn btn-primary" style={{ marginTop: 8 }}>
          Back to the zones
        </Link>
      )}
    </div>
  );
}

export function LevelPage() {
  const { levelId } = useParams({ from: '/play/$levelId' });
  const { save } = useStore();
  const level = LEVEL_BY_ID[levelId];
  if (!level) return <Blocked title="No such level" body="That level does not exist." to={null} />;
  if (!levelUnlocked(save, zoneShapes, level.id)) return <Blocked title={`${level.title} is still locked`} body="Clear the level before it on the zone map first." to={{ zoneId: level.zone }} />;
  return (
    <LevelShell key={level.id} level={level}>
      {(api) => <Sandbox level={level} api={api} />}
    </LevelShell>
  );
}

export function ChallengePage() {
  const { levelId } = useParams({ from: '/challenge/$levelId' });
  const { seed } = useSearch({ from: '/challenge/$levelId' });
  const navigate = useNavigate();
  const { save } = useStore();
  const guided = LEVEL_BY_ID[levelId];
  // A challenge without a seed gets a fresh one, kept in the address so a reload plays the same variant.
  useEffect(() => {
    if (guided && seed === undefined) void navigate({ to: '/challenge/$levelId', params: { levelId }, search: { seed: randomSeed() }, replace: true });
  }, [guided, seed, levelId, navigate]);
  const variant = useMemo(() => (seed === undefined ? null : generateChallenge(levelId, seed)), [levelId, seed]);
  if (!guided) return <Blocked title="No such level" body="That level does not exist." to={null} />;
  if (!challengeUnlocked(save, levelId)) return <Blocked title="Challenge locked" body={`Clear ${guided.title} with its steps first. Its challenge opens straight after.`} to={{ zoneId: guided.zone }} />;
  if (!variant) return null;
  const onNew = () => void navigate({ to: '/challenge/$levelId', params: { levelId }, search: { seed: randomSeed() } });
  return (
    <LevelShell key={`${levelId}:${seed}`} level={variant.level} mode={{ kind: 'challenge', seed: seed!, hints: variant.hints, onNew }}>
      {(api) => <Sandbox level={variant.level} api={api} />}
    </LevelShell>
  );
}

export function DailyPage() {
  const { save } = useStore();
  // Fixed for the visit: finishing the case changes the save, never the puzzle.
  const [{ day, pick, variant }] = useState(() => {
    const d = utcDay();
    const p = dailyPick(d, openLevels(save, zoneShapes));
    return { day: d, pick: p, variant: p ? generateChallenge(p.levelId, p.seed) : null };
  });
  if (!pick || !variant) return <Blocked title="No case today" body="Open a zone first." to={null} />;
  return (
    <LevelShell key={`daily:${day}`} level={variant.level} mode={{ kind: 'daily', day, seed: pick.seed, hints: variant.hints }}>
      {(api) => <Sandbox level={variant.level} api={api} />}
    </LevelShell>
  );
}
