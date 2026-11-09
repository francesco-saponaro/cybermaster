import { useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import type { Level } from '../content/types';
import type { LevelOutcome } from '../state/store';
import { CODEX_BY_ID } from '../content/codex';
import { EVIDENCE_BY_ID } from '../content/evidence';
import { BADGES } from '../engine/progress';
import { formatSeconds, starNotes } from '../engine/scoring';

export function ResultCard({
  level,
  outcome,
  nextId,
  zoneId,
  onReplay,
}: {
  level: Level;
  outcome: LevelOutcome & { seconds: number; showMe: number; fails: number };
  nextId?: string;
  zoneId: string;
  onReplay: () => void;
}) {
  const primary = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    primary.current?.focus();
  }, []);
  const notes = starNotes({ showMe: outcome.showMe, fails: outcome.fails, seconds: outcome.seconds }, level.par);
  return (
    <div className="result-veil" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className="result">
        <p className="lv-label" style={{ margin: 0 }}>{level.boss ? 'Boss cleared' : 'Level cleared'}</p>
        <h2 id="result-title">{level.title}</h2>
        <div className="big-stars" aria-label={`${outcome.stars} of 3 stars`}>
          {[0, 1, 2].map((i) => (
            <svg key={i} width="30" height="30" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.8 5.9 21.2l1.5-6.8L2.2 9.8l6.9-.7z" fill={i < outcome.stars ? 'var(--accent)' : 'none'} stroke={i < outcome.stars ? 'var(--accent)' : '#555'} strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
          ))}
        </div>
        <p className="said">{level.didWhat}</p>
        <p className="named">
          In the real world this is called <strong>{level.realName}</strong>.
        </p>
        <dl className="result-stats">
          <div>
            <dt>XP</dt>
            <dd>+{outcome.xpGained}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>{formatSeconds(outcome.seconds)}</dd>
          </div>
          <div>
            <dt>Show me</dt>
            <dd>{outcome.showMe}</dd>
          </div>
        </dl>
        {notes.length > 0 && outcome.stars < 3 ? <p className="small muted" style={{ margin: '8px 0 0' }}>Stars lost to: {notes.join(', ')}.</p> : null}
        <div className="result-unlocks">
          {outcome.unlockedCodex.length > 0 ? (
            <span>
              Codex: {outcome.unlockedCodex.map((c) => CODEX_BY_ID[c]?.title ?? c).join(', ')}
            </span>
          ) : null}
          {outcome.newEvidence.length > 0 ? <span>Evidence for your report: {outcome.newEvidence.map((e) => EVIDENCE_BY_ID[e]?.title ?? e).join(', ')}</span> : null}
          {outcome.newBadges.length > 0 ? <span>Badge: {outcome.newBadges.map((b) => BADGES.find((x) => x.id === b)?.name ?? b).join(', ')}</span> : null}
          {outcome.leveledUp ? <span>You levelled up.</span> : null}
        </div>
        <div className="result-actions">
          {nextId ? (
            <Link ref={primary} to="/play/$levelId" params={{ levelId: nextId }} className="cbtn cbtn-go">
              Next level
            </Link>
          ) : (
            <Link ref={primary} to="/zones/$zoneId" params={{ zoneId }} className="cbtn cbtn-go">
              Back to the map
            </Link>
          )}
          <button type="button" className="cbtn" onClick={onReplay}>
            Play again
          </button>
          {nextId ? (
            <Link to="/zones/$zoneId" params={{ zoneId }} className="cbtn">
              Zone map
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
