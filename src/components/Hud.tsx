import { Link, useRouterState } from '@tanstack/react-router';
import { useStore } from '../state/store';
import { levelProgress, rankForLevel, levelFromXp } from '../engine/progress';
import { Scope } from './Scope';

const RANK_COLOUR: Record<string, string> = {
  Recruit: 'var(--rank-recruit)',
  Analyst: 'var(--rank-analyst)',
  Hunter: 'var(--rank-hunter)',
  Master: 'var(--rank-master)',
};

export function TopBar() {
  const { save, toggleMute } = useStore();
  const level = levelFromXp(save.xp);
  const rank = rankForLevel(level);
  const { location } = useRouterState();
  const path = location.pathname;
  const is = (p: string) => (p === '/' ? path === '/' : path.startsWith(p));

  return (
    <header className="topbar">
      <div className="wrap topbar-inner">
        <Link to="/" className="brand" style={{ color: 'var(--ink)' }}>
          <Scope size={30} filled spin />
          <span className="brand-name">CyberMaster</span>
        </Link>
        <nav className="navlinks" aria-label="Main">
          <Link to="/" className="navlink" data-active={is('/') && path === '/'}>
            Zones
          </Link>
          <Link to="/case" className="navlink" data-active={is('/case')}>
            Case
          </Link>
          <Link to="/arcade" className="navlink" data-active={is('/arcade')}>
            Arcade
          </Link>
          <Link to="/codex" className="navlink" data-active={is('/codex')}>
            Codex
          </Link>
          <Link to="/study" className="navlink" data-active={is('/study')}>
            Study
          </Link>
          <Link to="/profile" className="navlink" data-active={is('/profile')}>
            Profile
          </Link>
          <span
            className="tnum rank-pill"
            style={{
              marginLeft: 8,
              padding: '6px 12px',
              borderRadius: 999,
              background: 'var(--surface-2)',
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '0.82rem',
              color: RANK_COLOUR[rank],
              whiteSpace: 'nowrap',
            }}
            title={`${rank} · Level ${level}`}
          >
            {rank} · L{level}
          </span>
          <button
            type="button"
            onClick={toggleMute}
            className="navlink"
            aria-label={save.settings.muted ? 'Unmute sound' : 'Mute sound'}
            title={save.settings.muted ? 'Sound off' : 'Sound on'}
            style={{ background: 'transparent' }}
          >
            <MuteIcon muted={save.settings.muted} />
          </button>
        </nav>
      </div>
    </header>
  );
}

export function MuteIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      {muted ? (
        <path d="M17 9l4 6M21 9l-4 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M16 8a5 5 0 010 8M18.5 6a8 8 0 010 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function XpBar() {
  const { save } = useStore();
  const { level, into, span } = levelProgress(save.xp);
  const pct = span > 0 ? (into / span) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }} className="tnum">
        L{level}
      </span>
      <div className="meter" style={{ flex: 1 }} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <span className="tnum" style={{ color: 'var(--muted)', fontSize: 'var(--step-small)', whiteSpace: 'nowrap' }}>
        {into} / {span} XP
      </span>
    </div>
  );
}
