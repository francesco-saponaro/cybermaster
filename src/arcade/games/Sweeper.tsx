import { useEffect, useRef, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { ARCADE_BY_ID } from '../../content/arcade';
import {
  actSweeper, attackSecondsLeft, bannerOf, COLS, guessOf, ROWS, SERVICES, startSweeper, stepSweeper, targets, USES, type Host, type Known, type SweepAction, type SweepState, type Tool,
} from '../sweeper';
import { ArcadeShell, PadButton, score } from '../ui/Shell';
import { useGameKeys, useLoop, usePrefersReducedMotion, useRun } from '../ui/useRun';
import { play } from '../../engine/audio';

const game = ARCADE_BY_ID['network-sweeper'];
const TOOLS: { tool: Tool; label: string; short: string; key: string }[] = [
  { tool: 'ping', label: 'Ping sweep', short: 'Ping', key: '1' },
  { tool: 'ports', label: 'Port scan', short: 'Ports', key: '2' },
  { tool: 'version', label: 'Version check', short: 'Version', key: '3' },
  { tool: 'lookup', label: 'CVE lookup', short: 'Look up', key: '4' },
];

/** What a cell shows, from what the tools have revealed. */
function cellState(h: Host, k: Known): { word: string; tone?: 'up' | 'down' | 'warn' | 'bad' | 'good' | 'flag' | 'wrong' } {
  if (k.flag === 'right') return { word: 'Flagged', tone: 'flag' };
  if (k.flag === 'wrong') return { word: 'Wrong flag', tone: 'wrong' };
  if (!k.seen) return { word: 'Unknown' };
  if (!h.live) return { word: 'No answer', tone: 'down' };
  if (k.lookup) return h.ports.some((p) => p.bannerVuln) ? { word: 'CVE match', tone: 'bad' } : { word: 'No CVE', tone: 'good' };
  if (k.version) return { word: 'Banner in', tone: 'up' };
  if (k.ports) return h.ports.some((p) => p.guessVuln) ? { word: 'Possible CVE', tone: 'warn' } : { word: `${h.ports.length} open`, tone: 'up' };
  return { word: 'Up', tone: 'up' };
}

export function SweeperPage() {
  const { seed: fixed } = useSearch({ strict: false }) as { seed?: number };
  const reduced = usePrefersReducedMotion();
  const [s, setS] = useState<SweepState>(() => startSweeper(fixed ?? 0, reduced ? 0.8 : 1));
  const run = useRun('network-sweeper', fixed, (seed) => setS(startSweeper(seed, reduced ? 0.8 : 1)));


  useLoop(run.phase === 'play', (dt) => setS((x) => stepSweeper(x, dt)));
  const act = (a: SweepAction) => {
    if (run.phase === 'play') setS((x) => actSweeper(x, a));
  };

  const nonce = useRef(0);
  useEffect(() => {
    if (!s.event || s.event.nonce === nonce.current) return;
    nonce.current = s.event.nonce;
    play(s.event.tone === 'good' ? 'hit' : s.event.tone === 'bad' ? 'miss' : 'blip');
  }, [s.event]);
  useEffect(() => {
    if (s.over && run.phase === 'play') run.finish(s.score, s.won);
  }, [s.over, s.score, s.won, run]);

  useGameKeys(run.phase === 'play', (e) => {
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const m = moves[e.key];
    if (m) {
      act({ t: 'move', dc: m[0], dr: m[1] });
      return true;
    }
    const t = TOOLS.find((x) => x.key === e.key);
    if (t) {
      act({ t: 'tool', tool: t.tool });
      return true;
    }
    if (e.key === 'f' || e.key === 'F') {
      act({ t: 'flag' });
      return true;
    }
    return false;
  });

  const h = s.hosts[s.selected]!;
  const k = s.known[s.selected]!;
  const hud = [
    { label: 'Score', value: score(s.score) },
    { label: 'Attacker', value: `${Math.floor(s.attack)}%`, tone: s.attack >= 70 ? ('warn' as const) : undefined },
    { label: 'Flagged', value: String(s.flags) },
    { label: 'Out of scope', value: String(s.outOfScope), tone: s.outOfScope ? ('warn' as const) : undefined },
  ];
  const missedTargets = targets(s).filter((t) => s.known[t.i]!.flag !== 'right');
  const wrong = s.hosts.filter((x) => s.known[x.i]!.flag === 'wrong');

  return (
    <ArcadeShell
      game={game}
      run={run}
      hud={hud}
      overTitle={run.won ? 'Found before the attacker' : 'The attacker got there first'}
      overLine={run.won ? `${s.flags} vulnerable host${s.flags === 1 ? '' : 's'} flagged with the attacker at ${Math.floor(s.attack)}%.` : (s.event?.text ?? '')}
      overExtra={
        missedTargets.length || wrong.length || s.outOfScope ? (
          <section className="ar-review" aria-labelledby="sw-review">
            <h3 id="sw-review">What to look at next time</h3>
            <ul>
              {missedTargets.map((t) => {
                const p = t.ports.find((x) => x.bannerVuln)!;
                const svc = SERVICES[p.svc]!;
                return (
                  <li key={`m${t.i}`}>
                    <strong>{t.ip} was the weak one</strong>
                    <span className="why">
                      {svc.product} {svc.vuln} on port {svc.port}, {svc.cve}. A port scan shows the guess, the version check proves it.
                    </span>
                  </li>
                );
              })}
              {wrong.map((t) => (
                <li key={`w${t.i}`}>
                  <strong>{t.ip} was a false flag</strong>
                  <span className="why">{t.ports.some((p) => p.guessVuln) ? `The scanner guessed ${guessOf(t.ports.find((p) => p.guessVuln)!)}, but the banner says ${bannerOf(t.ports.find((p) => p.guessVuln)!)}, which is patched.` : 'Nothing on it matched a CVE.'}</span>
                </li>
              ))}
              {s.outOfScope ? (
                <li>
                  <strong>
                    {s.outOfScope} probe{s.outOfScope === 1 ? '' : 's'} outside the scope
                  </strong>
                  <span className="why">The hatched hosts were not in the signed scope. Touching them is not allowed, and it gave the attacker time.</span>
                </li>
              ) : null}
            </ul>
          </section>
        ) : null
      }
    >
      <div className="sw">
        <div className="sw-left">
          <div className="sw-attack" role="progressbar" aria-label="Attacker progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(s.attack)}>
            <div className="row">
              <span className="grow">Attacker</span>
              <span className="tnum muted">about {attackSecondsLeft(s)}s left</span>
            </div>
            <div className="sw-track">
              <span style={{ transform: `scaleX(${s.attack / 100})` }} data-high={s.attack >= 70} />
            </div>
            <div className="sw-stages" aria-hidden="true">
              <span>Recon</span>
              <span>Scanning</span>
              <span>Exploit</span>
            </div>
          </div>
          <Grid s={s} act={act} />
          <p className="small muted sw-legend">Hatched hosts are outside the signed scope.</p>
        </div>
        <aside className="sw-side" aria-label="The selected host and your tools">
          <section className="sw-host" aria-live="polite">
            <div className="row">
              <h2 className="grow tnum">{h.ip}</h2>
              <span className="status" data-tone={h.inScope ? 'good' : 'bad'}>
                {h.inScope ? 'In scope' : 'Out of scope'}
              </span>
            </div>
            <HostFacts h={h} k={k} />
          </section>
          <div className="sw-tools">
            {TOOLS.map((t) => (
              <PadButton key={t.tool} label={`${t.label} · ${s.uses[t.tool]}`} aria={`${t.label}, ${s.uses[t.tool]} of ${USES[t.tool]} left`} keyHint={t.key} onPress={() => act({ t: 'tool', tool: t.tool })} disabled={s.uses[t.tool] <= 0} />
            ))}
            <PadButton label="Flag as vulnerable" keyHint="F" tone="stop" wide onPress={() => act({ t: 'flag' })} />
          </div>
          <p className="ar-msg" data-tone={s.event?.tone === 'info' ? undefined : s.event?.tone} aria-live="polite">
            {s.event?.text ?? 'Start with a ping sweep inside the scope to see which hosts are up.'}
          </p>
          <section className="sw-legendbox" aria-labelledby="sw-key">
            <h3 id="sw-key" className="sw-keyhead">Reading the grid</h3>
            <ul className="sw-key">
              <li><b>Up</b> answers a ping, not scanned yet</li>
              <li><b className="k-warn">Possible CVE</b> the scanner guesses a weak version</li>
              <li><b>Banner in</b> the real version is known</li>
              <li><b className="k-bad">CVE match</b> the lookup confirms it: flag it</li>
              <li><b className="k-good">No CVE</b> the banner shows a patched version</li>
              <li><b>No answer</b> nothing lives at that address</li>
            </ul>
          </section>
        </aside>
      </div>
    </ArcadeShell>
  );
}

function HostFacts({ h, k }: { h: Host; k: Known }) {
  if (!k.seen) return <p className="sw-fact muted">Not probed yet. A ping sweep or a port scan will tell you if it is up.</p>;
  if (!h.live) return <p className="sw-fact muted">Nothing answers at this address.</p>;
  return (
    <dl className="sw-facts">
      <div>
        <dt>Ports</dt>
        <dd>
          {k.ports
            ? h.ports.map((p) => (
                <span key={p.svc} className="sw-port">
                  <code>
                    {SERVICES[p.svc]!.port}/{SERVICES[p.svc]!.name}
                  </code>{' '}
                  scanner guess {guessOf(p)}
                  {p.guessVuln ? <span className="sw-possible"> · possible CVE</span> : null}
                </span>
              ))
            : 'Up. Run a port scan.'}
        </dd>
      </div>
      <div>
        <dt>Banner</dt>
        <dd>{k.version ? h.ports.map((p) => bannerOf(p)).join(', ') : k.ports ? 'Run a version check to read the real version.' : '—'}</dd>
      </div>
      <div>
        <dt>CVE lookup</dt>
        <dd>
          {k.lookup
            ? h.ports.some((p) => p.bannerVuln)
              ? h.ports.filter((p) => p.bannerVuln).map((p) => `${SERVICES[p.svc]!.cve} in ${SERVICES[p.svc]!.product} ${SERVICES[p.svc]!.vuln}`).join(', ')
              : 'No known CVE for these versions.'
            : '—'}
        </dd>
      </div>
    </dl>
  );
}

function Grid({ s, act }: { s: SweepState; act: (a: SweepAction) => void }) {
  const inside = s.hosts.filter((h) => h.inScope);
  const maxC = Math.max(...inside.map((h) => h.c));
  const maxR = Math.max(...inside.map((h) => h.r));
  return (
    <div className="sw-grid" role="grid" aria-label="Harbor network, 36 addresses" style={{ ['--cols' as string]: COLS, ['--rows' as string]: ROWS }}>
      <span className="sw-scope" aria-hidden="true" style={{ gridColumn: `1 / ${maxC + 2}`, gridRow: `1 / ${maxR + 2}` }} />
      {s.hosts.map((h) => {
        const k = s.known[h.i]!;
        const st = cellState(h, k);
        return (
          <button
            key={h.i}
            type="button"
            className="sw-cell"
            role="gridcell"
            data-scope={h.inScope}
            data-tone={st.tone}
            data-sel={s.selected === h.i}
            aria-selected={s.selected === h.i}
            aria-label={`${h.ip}, ${h.inScope ? 'in scope' : 'out of scope'}, ${st.word}`}
            style={{ gridColumn: h.c + 1, gridRow: h.r + 1 }}
            onClick={() => act({ t: 'select', i: h.i })}
            data-testid="host"
            data-ip={h.ip}
          >
            <span className="sw-ip tnum">.{h.ip.split('.').at(-1)}</span>
            <span className="sw-word">{st.word}</span>
          </button>
        );
      })}
    </div>
  );
}
