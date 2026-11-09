import { useState } from 'react';
import { useStore } from '../state/store';
import { ZONES } from '../content/zones';
import { CODEX } from '../content/codex';
import { ALL_LEVELS } from '../content/index';
import { BADGES, levelProgress, rankForLevel, levelFromXp, RANKS } from '../engine/progress';
import { Scope } from '../components/Scope';
import { XpBar } from '../components/Hud';

export function ProfilePage() {
  const { save, rename, reset } = useStore();
  const [nameDraft, setNameDraft] = useState(save.name);
  const [confirmReset, setConfirmReset] = useState(false);

  const level = levelFromExp();
  function levelFromExp() {
    return levelFromXp(save.xp);
  }
  const rank = rankForLevel(level);
  const { level: lvl } = levelProgress(save.xp);
  const earned = new Set(save.badges);
  const playable = ALL_LEVELS;
  const cleared = playable.filter((l) => (save.levels[l.id]?.stars ?? 0) >= 1).length;
  const flawless = playable.filter((l) => (save.levels[l.id]?.stars ?? 0) >= 3).length;

  const nextRank = RANKS.find((r) => r.minLevel > level);

  return (
    <div className="wrap" style={{ paddingBlock: 'clamp(28px, 5vw, 56px)' }}>
      <header style={{ display: 'flex', gap: 20, alignItems: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
        <Scope size={88} filled spin />
        <div style={{ flex: 1, minWidth: 260 }}>
          <p style={{ margin: 0, color: 'var(--accent-text)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            {rank} · Level {lvl}
          </p>
          <h1 style={{ fontSize: 'var(--step-head)' }}>{save.name || 'Analyst'}</h1>
          <div style={{ maxWidth: 420, marginTop: 12 }}>
            <XpBar />
          </div>
          {nextRank && (
            <p className="tnum" style={{ color: 'var(--muted)', fontSize: 'var(--step-small)', marginTop: 8 }}>
              {nextRank.minLevel - level} level{nextRank.minLevel - level === 1 ? '' : 's'} to {nextRank.name}
            </p>
          )}
        </div>
      </header>

      {/* Stat row */}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', marginBottom: 28 }}>
        <Stat label="Levels cleared" value={`${cleared} / ${playable.length}`} />
        <Stat label="Three-star clears" value={String(flawless)} />
        <Stat label="Codex unlocked" value={`${save.codex.length} / ${CODEX.length}`} />
        <Stat label="Evidence collected" value={String(save.evidence.length)} />
        <Stat label="Day streak" value={String(save.streak.count)} />
      </div>

      {/* Zones */}
      <h2 style={{ fontSize: '1.4rem', marginBottom: 12 }}>Zones</h2>
      <div style={{ display: 'grid', gap: 10, marginBottom: 32 }}>
        {ZONES.map((zone) => {
          const all = zone.levelIds;
          const done = all.filter((id) => (save.levels[id]?.stars ?? 0) >= 1).length;
          const pct = (done / all.length) * 100;
          return (
            <div key={zone.id} className="panel" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <Scope size={36} progress={done / all.length} cleared={done === all.length} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontFamily: 'var(--font-display)' }}>{zone.name}</strong>
                <div className="meter" style={{ marginTop: 6 }}>
                  <span style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="tnum" style={{ color: 'var(--muted)', fontSize: 'var(--step-small)', whiteSpace: 'nowrap' }}>
                {done} / {all.length}
              </span>
            </div>
          );
        })}
      </div>

      {/* Badges */}
      <h2 style={{ fontSize: '1.4rem', marginBottom: 12 }}>Badges</h2>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', marginBottom: 32 }}>
        {BADGES.map((badge) => {
          const has = earned.has(badge.id);
          return (
            <div key={badge.id} className="panel" style={{ padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center', opacity: has ? 1 : 0.45 }}>
              <Scope size={34} cleared={has} filled={has} locked={!has} />
              <div>
                <strong style={{ fontFamily: 'var(--font-display)', fontSize: '0.98rem' }}>{badge.name}</strong>
                <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 'var(--step-small)' }}>{badge.how}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Settings */}
      <h2 style={{ fontSize: '1.4rem', marginBottom: 12 }}>Your analyst</h2>
      <div className="panel" style={{ padding: 20, maxWidth: 520 }}>
        <label style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 600, marginBottom: 6 }} htmlFor="callsign">
          Call sign
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id="callsign"
            value={nameDraft}
            maxLength={24}
            placeholder="Analyst"
            onChange={(e) => setNameDraft(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 14px',
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--r-sm)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-text)',
              fontSize: 'var(--step-body)',
            }}
          />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => rename(nameDraft)}>
            Save
          </button>
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
          {!confirmReset ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(true)}>
              Reset all progress
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--muted)', fontSize: 'var(--step-small)' }}>This clears your save. Sure?</span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  reset();
                  setNameDraft('');
                  setConfirmReset(false);
                }}
              >
                Yes, reset
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>
                Keep it
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel" style={{ padding: '16px 18px' }}>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 'var(--step-small)', fontFamily: 'var(--font-display)', fontWeight: 600 }}>{label}</p>
      <p className="tnum" style={{ margin: '4px 0 0', fontSize: '1.8rem', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
        {value}
      </p>
    </div>
  );
}
