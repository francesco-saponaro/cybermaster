import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useStore } from '../../state/store';
import { CAST } from '../../content/story';
import { ZONE_BY_ID } from '../../content/zones';
import type { ArcadeGame } from '../../content/arcade';
import { Scope } from '../../components/Scope';
import { MuteIcon } from '../../components/Hud';
import { Stars } from '../../components/Stars';
import { BigStars } from '../../game/ResultCard';
import { BADGES } from '../../engine/progress';
import { ARCADE_XP, arcadeUnlocked } from '../../engine/arcade';
import { LEVEL_BY_ID } from '../../content/index';
import { zoneShapes } from '../../state/store';
import type { RunApi } from './useRun';
import './arcade.css';

export interface HudItem {
  label: string;
  value: ReactNode;
  /** Text read by screen readers when the value is a picture. */
  aria?: string;
  tone?: 'warn' | 'good';
}

const fmt = new Intl.NumberFormat('en-GB');
export const score = (n: number) => fmt.format(Math.round(n));

/** Lives as small reticles, filled while you still have them. */
export function Lives({ left, of }: { left: number; of: number }) {
  return (
    <span className="ar-lives" aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <Scope key={i} size={20} filled={i < left} locked={i >= left} />
      ))}
    </span>
  );
}

/** A thin bar that empties as time runs out. */
export function TimeBar({ left, label }: { left: number; label: string }) {
  const k = Math.max(0, Math.min(1, left));
  return (
    <div className="ar-timebar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(k * 100)}>
      <span style={{ transform: `scaleX(${k})` }} data-low={k < 0.25} />
    </div>
  );
}

/**
 * The frame every arcade game runs in: the top bar, the HUD, the start screen,
 * pause and game over. The game draws its board as `children`.
 */
export function ArcadeShell({
  game,
  run,
  hud,
  children,
  overTitle,
  overLine,
  overExtra,
}: {
  game: ArcadeGame;
  run: RunApi;
  hud: HudItem[];
  children: ReactNode;
  overTitle: string;
  overLine?: string;
  overExtra?: ReactNode;
}) {
  const { save, toggleMute } = useStore();
  const zone = ZONE_BY_ID[game.zone]!;
  const record = save.arcade[game.id];
  const { phase } = run;
  const unlocked = arcadeUnlocked(save, zoneShapes, game.zone);
  const boss = LEVEL_BY_ID[zone.levelIds[zone.levelIds.length - 1]!]!;

  // P or Esc pauses and resumes; Enter starts and restarts.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if ((k === 'p' || k === 'P' || k === 'Escape') && (phase === 'play' || phase === 'paused')) {
        e.preventDefault();
        if (phase === 'play') run.pause();
        else run.resume();
      } else if (k === 'Enter' && unlocked && (phase === 'start' || phase === 'over')) {
        const t = e.target as HTMLElement | null;
        if (t && t.tagName === 'A') return;
        e.preventDefault();
        if (phase === 'start') run.start();
        else run.retry();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [phase, run, unlocked]);

  return (
    <div className="ar" data-phase={phase} data-game={game.id}>
      <header className="lv-top ar-top">
        <Link to="/arcade" className="lv-exit" aria-label="Back to the arcade">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hide-sm">Arcade</span>
        </Link>
        <div className="lv-title">
          <h1>{game.title}</h1>
          <span className="ar-zone hide-xs">{zone.name}</span>
        </div>
        <div className="lv-actions">
          <button type="button" className="lv-icon" onClick={toggleMute} aria-label={save.settings.muted ? 'Unmute sound' : 'Mute sound'} title={save.settings.muted ? 'Sound off' : 'Sound on'}>
            <MuteIcon muted={save.settings.muted} />
          </button>
          {phase === 'play' || phase === 'paused' ? (
            <button type="button" className="cbtn cbtn-sm" onClick={phase === 'play' ? run.pause : run.resume} aria-keyshortcuts="P">
              {phase === 'play' ? 'Pause' : 'Resume'}
            </button>
          ) : null}
        </div>
      </header>

      {!unlocked ? (
        <main className="ar-main ar-main-panel">
          <section className="ar-panel" aria-labelledby="ar-locked">
            <h2 id="ar-locked">{game.title} is still locked</h2>
            <p className="ar-overline">
              It opens when you beat {boss.title}, the boss of {zone.name}.
            </p>
            <div className="ar-actions">
              <Link to="/zones/$zoneId" params={{ zoneId: zone.id }} className="cbtn cbtn-go">
                Open {zone.name}
              </Link>
              <Link to="/arcade" className="cbtn">
                Back to the arcade
              </Link>
            </div>
          </section>
        </main>
      ) : phase === 'play' || phase === 'paused' ? (
        <>
          <dl className="ar-hud" aria-label="Score and state">
            {hud.map((h) => (
              <div key={h.label} data-tone={h.tone}>
                <dt>{h.label}</dt>
                <dd className="tnum" aria-label={h.aria}>
                  {h.value}
                </dd>
              </div>
            ))}
          </dl>
          <main className="ar-main" aria-label={`${game.title} board`}>
            {children}
            {phase === 'paused' ? <PauseVeil run={run} /> : null}
          </main>
        </>
      ) : phase === 'start' ? (
        <main className="ar-main ar-main-panel">
          <StartPanel game={game} best={record?.best} stars={record?.stars ?? 0} onStart={run.start} />
        </main>
      ) : (
        <main className="ar-main ar-main-panel">
          <OverPanel game={game} run={run} title={overTitle} line={overLine} best={record?.best ?? 0}>
            {overExtra}
          </OverPanel>
        </main>
      )}
    </div>
  );
}

function StartPanel({ game, best, stars, onStart }: { game: ArcadeGame; best?: number; stars: number; onStart: () => void }) {
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => go.current?.focus(), []);
  return (
    <section className="ar-panel" aria-labelledby="ar-start-title">
      <div className="ar-panel-head">
        <Scope size={56} spin />
        <div>
          <h2 id="ar-start-title">{game.tagline}</h2>
          <p className="ar-best tnum">
            {best !== undefined ? (
              <>
                Best {score(best)} <Stars count={stars} size={14} />
              </>
            ) : (
              'No runs yet'
            )}
            <span className="muted"> · about {Math.round(game.seconds / 10) * 10} seconds</span>
          </p>
        </div>
      </div>
      <blockquote className="ar-line">
        <p>{game.line}</p>
        <footer>
          {game.speaker}, {CAST[game.speaker].role.toLowerCase()}
        </footer>
      </blockquote>
      <div className="ar-how">
        <div>
          <h3>How to play</h3>
          <ul>
            {game.howTo.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Controls</h3>
          <table className="ar-keys">
            <tbody>
              {game.controls.map((c) => (
                <tr key={c.keys}>
                  <th scope="row">{c.keys}</th>
                  <td>{c.does}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted ar-touch">On a touch screen, use the buttons under the board.</p>
        </div>
      </div>
      <p className="ar-teaches">{game.teaches}</p>
      <div className="ar-actions">
        <button ref={go} type="button" className="cbtn cbtn-go ar-go" onClick={onStart} data-start="true">
          Start
        </button>
        <span className="small muted hide-sm">or press Enter</span>
      </div>
    </section>
  );
}

function PauseVeil({ run }: { run: RunApi }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="ar-veil" role="dialog" aria-modal="true" aria-labelledby="ar-pause-title">
      <div className="ar-pause">
        <h2 id="ar-pause-title">Paused</h2>
        <p className="small muted">The clock is stopped. Press P or Esc to carry on.</p>
        <div className="ar-actions">
          <button ref={ref} type="button" className="cbtn cbtn-go" onClick={run.resume}>
            Resume
          </button>
          <button type="button" className="cbtn" onClick={run.retry}>
            Restart
          </button>
          <Link to="/arcade" className="cbtn">
            Quit
          </Link>
        </div>
      </div>
    </div>
  );
}

function OverPanel({ game, run, title, line, best, children }: { game: ArcadeGame; run: RunApi; title: string; line?: string; best: number; children?: ReactNode }) {
  const o = run.outcome;
  const again = useRef<HTMLButtonElement>(null);
  useEffect(() => again.current?.focus(), []);
  if (!o) return null;
  const nextStar = game.stars.find((t) => t > o.score);
  return (
    <section className="ar-panel ar-over" aria-labelledby="ar-over-title" data-won={run.won}>
      <p className="ar-kicker">{run.won ? 'Run complete' : 'Run over'}</p>
      <h2 id="ar-over-title">{title}</h2>
      {line ? <p className="ar-overline">{line}</p> : null}
      <div className="ar-score-row">
        <div>
          <p className="ar-score tnum" data-testid="final-score">
            {score(o.score)}
          </p>
          <p className="small muted tnum">
            {o.best && o.priorBest > 0 ? `New best, up from ${score(o.priorBest)}` : o.best ? 'Your first score' : `Best ${score(best)}`}
          </p>
        </div>
        <BigStars n={o.stars} />
      </div>
      <dl className="result-stats">
        <div>
          <dt>Stars</dt>
          <dd>{o.stars} of 3</dd>
        </div>
        <div>
          <dt>Next star at</dt>
          <dd className="tnum">{nextStar ? score(nextStar) : 'All earned'}</dd>
        </div>
        <div>
          <dt>XP</dt>
          <dd className="tnum">+{o.xpGained}</dd>
        </div>
      </dl>
      <p className="small muted" style={{ margin: '8px 0 0' }}>
        XP comes from new stars only, up to {ARCADE_XP[3]} per game.
        {o.newBadges.length ? ` Badge: ${o.newBadges.map((b) => BADGES.find((x) => x.id === b)?.name ?? b).join(', ')}.` : ''}
        {o.leveledUp ? ' You levelled up.' : ''}
      </p>
      {children}
      <div className="ar-actions">
        <button ref={again} type="button" className="cbtn cbtn-go" onClick={run.retry}>
          Play again
        </button>
        <Link to="/arcade" className="cbtn">
          Back to the arcade
        </Link>
      </div>
    </section>
  );
}

/** A big touch button for the controls under a board. */
export function PadButton({ label, aria, keyHint, onPress, tone, disabled, wide, pressed }: { label: string; aria?: string; keyHint?: string; onPress: () => void; tone?: 'go' | 'stop'; disabled?: boolean; wide?: boolean; pressed?: boolean }) {
  return (
    <button
      type="button"
      className="ar-pad"
      aria-label={aria}
      aria-pressed={pressed}
      data-tone={tone}
      data-wide={wide}
      disabled={disabled}
      onPointerDown={(e) => {
        // Act on press, not release, so a quick tap never feels late.
        if (e.pointerType !== 'mouse') {
          e.preventDefault();
          onPress();
        }
      }}
      onClick={(e) => {
        // Touch and pen already acted on press; mouse and keyboard act here.
        const kind = (e.nativeEvent as Partial<PointerEvent>).pointerType;
        if (kind !== 'touch' && kind !== 'pen') onPress();
      }}
    >
      <span>{label}</span>
      {keyHint ? <kbd className="hide-sm">{keyHint}</kbd> : null}
    </button>
  );
}
