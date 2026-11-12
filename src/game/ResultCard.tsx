import { useEffect, useRef, useState } from 'react';
import type { XpBreakdown } from '../engine/combo';
import { Link } from '@tanstack/react-router';
import type { Level } from '../content/types';
import type { LevelOutcome } from '../state/store';
import { CODEX_BY_ID } from '../content/codex';
import { EVIDENCE_BY_ID } from '../content/evidence';
import { BADGES } from '../engine/progress';
import { formatSeconds, starNotes } from '../engine/scoring';
import { ARCADE_BY_ZONE } from '../content/arcade';

export function ResultCard({
  level,
  outcome,
  nextId,
  zoneId,
  onReplay,
  finale,
}: {
  level: Level;
  outcome: LevelOutcome & { seconds: number; showMe: number; fails: number };
  nextId?: string;
  zoneId: string;
  onReplay: () => void;
  /** The last level of the game: the result leads to the end of the case. */
  finale?: boolean;
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
        <BigStars n={outcome.stars} />
        <p className="said">{level.didWhat}</p>
        <p className="named">
          In the real world this is called <strong>{level.realName}</strong>.
        </p>
        <dl className="result-stats">
          {outcome.breakdown ? null : (
            <div>
              <dt>XP</dt>
              <dd>+{outcome.xpGained}</dd>
            </div>
          )}
          <div>
            <dt>Time</dt>
            <dd>{formatSeconds(outcome.seconds)}</dd>
          </div>
          <div>
            <dt>Show me</dt>
            <dd>{outcome.showMe}</dd>
          </div>
        </dl>
        {outcome.breakdown ? <XpLines breakdown={outcome.breakdown} total={outcome.xpGained} /> : null}
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
          {finale ? (
            <Link ref={primary} to="/ending" className="cbtn cbtn-go">
              Close the case
            </Link>
          ) : nextId ? (
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
        {level.boss && ARCADE_BY_ZONE[level.zone] ? (
          <p className="result-bonus">
            <span>
              Bonus round open: <strong>{ARCADE_BY_ZONE[level.zone].title}</strong>, {ARCADE_BY_ZONE[level.zone].tagline.toLowerCase()}.
            </span>
            <Link to={`/arcade/${ARCADE_BY_ZONE[level.zone].id}` as '/arcade/spot-the-forgery'} search={{}} className="cbtn">
              Play the bonus round
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function BigStars({ n }: { n: number }) {
  return (
    <div className="big-stars" aria-label={`${n} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} width="30" height="30" viewBox="0 0 24 24" aria-hidden="true" data-on={i < n}>
          <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.8 5.9 21.2l1.5-6.8L2.2 9.8l6.9-.7z" fill={i < n ? 'var(--accent)' : 'none'} stroke={i < n ? 'var(--accent)' : '#555'} strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      ))}
    </div>
  );
}

/** XP that counts up, with the combo and clean-run bonuses on their own lines. */
export function XpLines({ breakdown, total }: { breakdown: XpBreakdown; total: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(total);
      return undefined;
    }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      setShown(Math.round(total * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [total]);
  return (
    <div className="xp-lines">
      <p className="xp-total tnum">
        +{shown} <span>XP</span>
      </p>
      <ul>
        <li>
          <span>Clear</span>
          <span className="tnum">+{breakdown.base}</span>
        </li>
        {breakdown.comboXp > 0 ? (
          <li>
            <span>Best combo, x{breakdown.multiplier.toFixed(1)}</span>
            <span className="tnum">+{breakdown.comboXp}</span>
          </li>
        ) : null}
        {breakdown.cleanXp > 0 ? (
          <li>
            <span>Clean run: no mistakes, no help</span>
            <span className="tnum">+{breakdown.cleanXp}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
