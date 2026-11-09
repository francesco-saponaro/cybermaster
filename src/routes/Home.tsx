import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useStore, zoneShapes } from '../state/store';
import { ZONES } from '../content/zones';
import { ALL_LEVELS, LEVEL_BY_ID } from '../content/index';
import { CODEX } from '../content/codex';
import { Scope } from '../components/Scope';
import { XpBar } from '../components/Hud';
import { zoneUnlocked, nextLevelIn, rankForLevel, levelFromXp, openLevels } from '../engine/progress';
import { dailyPick, nextUtcDay, shareText, utcDay } from '../engine/daily';
import { clock } from '../engine/scoring';
import { caseBoard } from '../engine/caseboard';
import { Stars } from '../components/Stars';
import type { SaveFile } from '../engine/save';

export function HomePage() {
  const { save } = useStore();
  const cleared = ALL_LEVELS.filter((l) => (save.levels[l.id]?.stars ?? 0) >= 1).length;
  const started = cleared > 0 || save.xp > 0;
  // The next level: the first not cleared in the furthest open zone that still has one.
  const openZones = ZONES.filter((z) => zoneUnlocked(save, zoneShapes, z.id));
  const zoneForNext = openZones.find((z) => z.levelIds.some((id) => (save.levels[id]?.stars ?? 0) < 1)) ?? openZones[openZones.length - 1]!;
  const nextId = nextLevelIn(save, zoneForNext)!;
  const next = LEVEL_BY_ID[nextId]!;

  return (
    <div>
      <section style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--line)' }}>
        <div aria-hidden="true" className="hero-scope">
          <Scope size={760} spin />
        </div>
        <div className="wrap hero-grid" style={{ position: 'relative', paddingBlock: 'clamp(44px, 8vw, 104px)' }}>
          <div style={{ maxWidth: 660 }}>
            <h1 className="rise" style={{ fontSize: 'var(--step-hero)', lineHeight: 0.92 }}>Join the Watch.</h1>
            <p className="rise" style={{ fontSize: 'var(--step-lead)', marginTop: 20, maxWidth: 560 }}>
              Learn security by doing it in small sandboxes: edit raw HTTP, fix vulnerable code, sweep a network from a terminal, lock down a cloud account and write the finding.
            </p>
            <div className="rise" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 28 }}>
              <Link to="/play/$levelId" params={{ levelId: next.id }} className="btn btn-primary">
                {started ? `Continue: ${next.title}` : 'Play the first level'}
              </Link>
              <Link to="/codex" className="btn btn-ghost">Open the codex</Link>
            </div>
            <div className="rise" style={{ marginTop: 34, maxWidth: 420 }}>
              <XpBar />
              <p className="tnum" style={{ color: 'var(--muted)', fontSize: 'var(--step-small)', marginTop: 10 }}>
                {rankForLevel(levelFromXp(save.xp))} · {cleared} of {ALL_LEVELS.length} levels · {save.codex.length} of {CODEX.length} codex entries
              </p>
            </div>
          </div>
          <div className="rise hero-daily">
            <DailyCard save={save} />
          </div>
        </div>
      </section>

      <section className="wrap home-cards">
        <CaseCard save={save} />
      </section>

      <section className="wrap" style={{ paddingBlock: 'clamp(40px, 6vw, 72px)' }}>
        <h2 style={{ fontSize: 'var(--step-head)', marginBottom: 8 }}>The route</h2>
        <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 32, maxWidth: 600 }}>
          Five zones, one sandbox each, in the order the job goes. Clear a zone's last level to open the next.
        </p>
        <ol className="route">
          {ZONES.map((zone, i) => {
            const open = zoneUnlocked(save, zoneShapes, zone.id);
            const done = zone.levelIds.filter((id) => (save.levels[id]?.stars ?? 0) >= 1).length;
            const complete = done === zone.levelIds.length;
            return (
              <li key={zone.id} className="route-stop" data-open={open}>
                <Link to="/zones/$zoneId" params={{ zoneId: zone.id }} className="route-link">
                  <span className="route-node">
                    <Scope size={64} progress={done / zone.levelIds.length} cleared={complete} locked={!open} />
                  </span>
                  <span className="route-text">
                    <span className="eyebrow">Zone {i + 1}</span>
                    <span className="route-name">{zone.name}</span>
                    <span className="route-tag">{zone.tagline}</span>
                    <span className="route-count tnum">{open ? `${done} of ${zone.levelIds.length} cleared` : 'Locked'}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Today's case: one unguided puzzle a day from the open zones, the same for everyone on the same day. */
function DailyCard({ save }: { save: SaveFile }) {
  const day = utcDay();
  const pick = dailyPick(day, openLevels(save, zoneShapes));
  const zone = pick ? ZONES.find((z) => z.levelIds.includes(pick.levelId)) : undefined;
  const result = save.daily.days[day];
  const yesterday = utcDay(new Date(Date.now() - 86400000));
  const streak = save.daily.streak.lastDay === day || save.daily.streak.lastDay === yesterday ? save.daily.streak.count : 0;
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const copy = async () => {
    if (!result || !zone) return;
    try {
      await navigator.clipboard.writeText(shareText({ day, zone: zone.name, stars: result.stars, seconds: result.seconds, hints: result.hints, streak }));
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  };
  return (
    <section className="daily-card panel" aria-labelledby="daily-title" data-done={!!result}>
      <div className="row">
        <p className="eyebrow grow" style={{ margin: 0 }}>Today's case · {DAY_FORMAT.format(new Date(day + 'T00:00:00Z'))}</p>
        <span className="daily-streak tnum" title="Days in a row">
          Streak {streak}
        </span>
      </div>
      <h2 id="daily-title">{zone ? zone.name : 'No zone open'}</h2>
      {result ? (
        <>
          <p className="daily-line">
            Solved <Stars count={result.stars} size={16} /> in <span className="tnum">{clock(result.seconds)}</span>
            {result.hints ? `, ${result.hints} hint${result.hints === 1 ? '' : 's'}` : ', no hints'}. Come back tomorrow for a new one.
          </p>
          <div className="daily-actions">
            <button type="button" className="btn btn-primary" onClick={copy}>
              {copied === 'done' ? 'Copied' : 'Copy result'}
            </button>
            <Link to="/daily" className="btn btn-ghost">
              Beat your time
            </Link>
          </div>
          {copied === 'failed' ? <p className="small muted" style={{ margin: '8px 0 0' }}>The clipboard is blocked here.</p> : null}
          <p className="small muted daily-next tnum">Next case: {DAY_FORMAT.format(new Date(nextUtcDay(day) + 'T00:00:00Z'))}, midnight UTC</p>
        </>
      ) : (
        <>
          <p className="daily-line">One unguided puzzle from the zones you have open, the same for everyone today. No steps, a hint if you need one, and the clock running.</p>
          <div className="daily-actions">
            <Link to="/daily" className="btn btn-primary">
              Open today's case
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function CaseCard({ save }: { save: SaveFile }) {
  const board = caseBoard(save, ZONES);
  const latest = [...board.timeline].reverse().find((t) => t.found && t.time !== 'Mon 08:00');
  return (
    <section className="case-card panel" aria-labelledby="case-title">
      <p className="eyebrow" style={{ margin: 0 }}>The case</p>
      <h2 id="case-title">Lantern & Co.</h2>
      <p className="daily-line">{latest ? `Latest: ${latest.time}. ${latest.text}` : "Their customers' invoices are for sale online. Clear levels to pin the evidence."}</p>
      <div className="meter" role="progressbar" aria-label="Evidence found" aria-valuenow={board.found} aria-valuemin={0} aria-valuemax={board.total}>
        <span style={{ width: `${(board.found / board.total) * 100}%` }} />
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <span className="small muted tnum grow">
          {board.found} of {board.total} pieces of evidence
        </span>
        <Link to="/case" className="btn btn-ghost">
          Open the board
        </Link>
      </div>
    </section>
  );
}
