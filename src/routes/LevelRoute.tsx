import { Link, useParams } from '@tanstack/react-router';
import { LEVEL_BY_ID } from '../content/index';
import type { Level } from '../content/types';
import { useStore, zoneShapes } from '../state/store';
import { levelUnlocked } from '../engine/progress';
import { LevelShell } from '../game/LevelShell';
import { WireSandbox } from '../game/sandboxes/WireSandbox';
import { ArenaSandbox } from '../game/sandboxes/ArenaSandbox';
import { TerminalSandbox } from '../game/sandboxes/TerminalSandbox';
import { CloudSandbox } from '../game/sandboxes/CloudSandbox';
import { ReportSandbox } from '../game/sandboxes/ReportSandbox';
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
  }
}

export function LevelPage() {
  const { levelId } = useParams({ from: '/play/$levelId' });
  const { save } = useStore();
  const level = LEVEL_BY_ID[levelId];
  if (!level) {
    return (
      <div className="wrap" style={{ paddingBlock: 60 }}>
        <h1 style={{ fontSize: 'var(--step-head)' }}>No such level</h1>
        <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
          Back to the zones
        </Link>
      </div>
    );
  }
  if (!levelUnlocked(save, zoneShapes, level.id)) {
    return (
      <div className="wrap" style={{ paddingBlock: 60, maxWidth: 640 }}>
        <h1 style={{ fontSize: 'var(--step-head)' }}>{level.title} is still locked</h1>
        <p style={{ color: 'var(--muted)' }}>Clear the level before it on the zone map first.</p>
        <Link to="/zones/$zoneId" params={{ zoneId: level.zone }} className="btn btn-primary" style={{ marginTop: 8 }}>
          Open the zone map
        </Link>
      </div>
    );
  }
  return (
    <LevelShell key={level.id} level={level}>
      {(api) => <Sandbox level={level} api={api} />}
    </LevelShell>
  );
}
