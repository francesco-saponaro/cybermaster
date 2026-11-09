import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useStore } from '../state/store';
import { CODEX } from '../content/codex';
import { ZONES } from '../content/zones';
import { Scope } from '../components/Scope';

export function CodexPage() {
  const { save } = useStore();
  const unlocked = new Set(save.codex);
  const [zoneFilter, setZoneFilter] = useState<string>('all');
  const [open, setOpen] = useState<string | null>(null);

  const entries = CODEX.filter((c) => zoneFilter === 'all' || c.zone === zoneFilter);

  return (
    <div className="wrap" style={{ paddingBlock: 'clamp(28px, 5vw, 56px)' }}>
      <header style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        <Scope size={60} progress={CODEX.length ? save.codex.length / CODEX.length : 0} />
        <div>
          <h1 style={{ fontSize: 'var(--step-head)' }}>The Codex</h1>
          <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>
            {save.codex.length} of {CODEX.length} entries unlocked. Each one is a thing you proved you understood.
          </p>
        </div>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '20px 0 24px' }}>
        <FilterButton label="All" active={zoneFilter === 'all'} onClick={() => setZoneFilter('all')} />
        {ZONES.map((z) => (
          <FilterButton key={z.id} label={z.name} active={zoneFilter === z.id} onClick={() => setZoneFilter(z.id)} />
        ))}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {entries.map((entry) => {
          const isUnlocked = unlocked.has(entry.id);
          const isOpen = open === entry.id;
          const zone = ZONES.find((z) => z.id === entry.zone);
          return (
            <div key={entry.id} className="panel" style={{ padding: 0, overflow: 'hidden', opacity: isUnlocked ? 1 : 0.55 }}>
              <button
                type="button"
                onClick={() => isUnlocked && setOpen(isOpen ? null : entry.id)}
                disabled={!isUnlocked}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  padding: '16px 20px',
                  cursor: isUnlocked ? 'pointer' : 'default',
                  color: 'var(--ink)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}
                aria-expanded={isOpen}
              >
                <Scope size={30} cleared={isUnlocked} locked={!isUnlocked} filled={isUnlocked} />
                <span style={{ flex: 1 }}>
                  <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>{isUnlocked ? entry.title : 'Locked entry'}</strong>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: 'var(--step-small)', marginTop: 2 }}>{zone?.name}</span>
                </span>
                {isUnlocked && <span style={{ color: 'var(--muted)', fontSize: '1.4rem', lineHeight: 1 }}>{isOpen ? '−' : '+'}</span>}
              </button>
              {isUnlocked && isOpen && (
                <div className="rise" style={{ padding: '0 20px 20px', borderTop: '1px solid var(--line)' }}>
                  {entry.body.map((p, i) => (
                    <p key={i} style={{ marginTop: 14 }}>
                      {p}
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {save.codex.length === 0 && (
        <div className="panel" style={{ padding: 24, marginTop: 20, textAlign: 'center' }}>
          <p style={{ margin: '0 0 12px' }}>Nothing unlocked yet. Clear a mission to fill the first entries.</p>
          <Link to="/zones/$zoneId" params={{ zoneId: 'wire' }} className="btn btn-primary">
            Start in The Wire
          </Link>
        </div>
      )}
    </div>
  );
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="panel"
      aria-pressed={active}
      style={{
        padding: '8px 16px',
        borderRadius: 999,
        borderColor: active ? 'var(--accent)' : 'var(--line)',
        background: active ? 'color-mix(in srgb, var(--accent) 18%, var(--surface))' : 'var(--surface)',
        color: 'var(--ink)',
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 'var(--step-small)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
