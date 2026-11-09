import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { Level } from '../content/types';
import type { ChallengeOutcome } from '../state/store';
import { BADGES } from '../engine/progress';
import { clock } from '../engine/scoring';
import { nextUtcDay, shareText } from '../engine/daily';
import { BigStars, XpLines } from './ResultCard';

export function ChallengeResult({
  level,
  outcome,
  seconds,
  hints,
  zoneId,
  zoneName,
  onNew,
  onReplay,
}: {
  level: Level;
  outcome: ChallengeOutcome;
  seconds: number;
  hints: number;
  zoneId: string;
  zoneName: string;
  onNew?: () => void;
  onReplay: () => void;
}) {
  const primary = useRef<HTMLButtonElement & HTMLAnchorElement>(null);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  useEffect(() => {
    primary.current?.focus();
  }, []);
  const daily = outcome.daily;
  const text = daily ? shareText({ day: daily.day, zone: zoneName, stars: outcome.stars, seconds, hints, streak: daily.streak }) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };
  return (
    <div className="result-veil" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className="result">
        <p className="lv-label" style={{ margin: 0 }}>{daily ? "Today's case solved" : level.boss ? 'Challenge boss cleared' : 'Challenge cleared'}</p>
        <h2 id="result-title">{daily ? zoneName : level.title}</h2>
        <BigStars n={outcome.stars} />
        <dl className="result-stats">
          <div>
            <dt>Points</dt>
            <dd>{outcome.points}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>
              {clock(seconds)} <span className="muted small">/ {clock(level.par)}</span>
            </dd>
          </div>
          <div>
            <dt>Hints</dt>
            <dd>{hints}</dd>
          </div>
        </dl>
        <XpLines breakdown={outcome.breakdown} total={outcome.xpGained} />
        <div className="result-unlocks">
          {outcome.best && !daily && outcome.firstClear ? <span>Challenge medal earned for {level.title}.</span> : outcome.best && !daily ? <span>A new best for this challenge.</span> : null}
          {outcome.newBadges.length > 0 ? <span>Badge: {outcome.newBadges.map((b) => BADGES.find((x) => x.id === b)?.name ?? b).join(', ')}</span> : null}
          {outcome.leveledUp ? <span>You levelled up.</span> : null}
          {daily ? (
            <span>
              Daily streak {daily.streak}. {daily.first ? 'A new case opens at midnight UTC' : 'Your best for today is kept'} ({nextUtcDay(daily.day)}).
            </span>
          ) : null}
        </div>
        {daily ? <pre className="share-preview" aria-label="Your result to share">{text}</pre> : null}
        <div className="result-actions">
          {daily ? (
            <>
              <button ref={primary} type="button" className="cbtn cbtn-go" onClick={copy}>
                {copied === 'done' ? 'Copied' : 'Copy result'}
              </button>
              <Link to="/" className="cbtn">
                Back to the title
              </Link>
            </>
          ) : (
            <>
              <button ref={primary} type="button" className="cbtn cbtn-go" onClick={onNew}>
                New variant
              </button>
              <button type="button" className="cbtn" onClick={onReplay}>
                Same one again
              </button>
              <Link to="/zones/$zoneId" params={{ zoneId }} className="cbtn">
                Zone map
              </Link>
            </>
          )}
        </div>
        {copied === 'failed' ? <p className="small muted" style={{ margin: '10px 0 0' }}>The clipboard is blocked here. Select the text above and copy it.</p> : null}
      </div>
    </div>
  );
}
