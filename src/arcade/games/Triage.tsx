import { useEffect, useRef, useState } from 'react';
import { useSearch } from '@tanstack/react-router';
import { ARCADE_BY_ID } from '../../content/arcade';
import { DRIVERS, FINDING_BY_ID, SEVERITIES, type DriverId } from '../../content/arcade/findings';
import { actTriage, cardTime, current, DECK, startTriage, stepTriage, streakMultiplier, type TriageAction, type TriageState } from '../triage';
import { ArcadeShell, score, TimeBar } from '../ui/Shell';
import { useGameKeys, useLoop, usePrefersReducedMotion, useRun } from '../ui/useRun';
import { play, playCombo } from '../../engine/audio';

const game = ARCADE_BY_ID['triage-rush'];
const DRIVER_KEYS = ['q', 'w', 'e'];

export function TriagePage() {
  const { seed: fixed } = useSearch({ strict: false }) as { seed?: number };
  const reduced = usePrefersReducedMotion();
  const [s, setS] = useState<TriageState>(() => startTriage(fixed ?? 0, reduced ? 0.8 : 1));
  const run = useRun('triage-rush', fixed, (seed) => setS(startTriage(seed, reduced ? 0.8 : 1)));


  useLoop(run.phase === 'play', (dt) => setS((x) => stepTriage(x, dt)));
  const act = (a: TriageAction) => {
    if (run.phase === 'play') setS((x) => actTriage(x, a));
  };

  const answered = useRef(0);
  useEffect(() => {
    if (s.answers.length === answered.current) return;
    answered.current = s.answers.length;
    const last = s.answers.at(-1);
    if (!last) return;
    if (last.right) {
      play('hit');
      playCombo(s.streak);
    } else play(last.picked ? 'miss' : 'break');
  }, [s.answers, s.streak]);
  useEffect(() => {
    if (s.over && run.phase === 'play') run.finish(s.score, true);
  }, [s.over, s.score, run]);

  useGameKeys(run.phase === 'play', (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 4) {
      act({ t: 'severity', sev: SEVERITIES[n - 1]! });
      return true;
    }
    const d = DRIVER_KEYS.indexOf(e.key.toLowerCase());
    if (d >= 0) {
      const id = s.drivers[s.index]?.[d];
      if (id) act({ t: 'driver', id });
      return true;
    }
    return false;
  });

  const f = current(s);
  const ans = s.phase === 'reveal' ? s.answers.at(-1) : undefined;
  const right = s.answers.filter((a) => a.right).length;
  const hud = [
    { label: 'Score', value: score(s.score) },
    { label: 'Streak', value: `x${streakMultiplier(s.streak)} · ${s.streak}` },
    { label: 'Right', value: `${right} of ${s.answers.length}` },
    { label: 'Card', value: `${Math.min(s.index + 1, DECK)} of ${DECK}` },
  ];
  const misjudged = s.answers.filter((a) => !a.right);

  return (
    <ArcadeShell
      game={game}
      run={run}
      hud={hud}
      overTitle={misjudged.length === 0 ? 'Every finding ranked right' : `${right} of ${DECK} ranked right`}
      overLine={`Best streak ${s.bestStreak}. ${s.answers.filter((a) => a.driverRight).length} of ${DECK} drivers spotted.`}
      overExtra={
        misjudged.length ? (
          <section className="ar-review" aria-labelledby="tr-review">
            <h3 id="tr-review">The ones to look at again</h3>
            <ul data-testid="scorecard">
              {misjudged.map((a) => {
                const x = FINDING_BY_ID[a.id]!;
                return (
                  <li key={a.id}>
                    <strong>{x.title}</strong>
                    <span className="small muted">
                      {' '}
                      · you said {a.picked ?? 'nothing in time'}, it is <strong className="tr-right">{x.severity}</strong>
                    </span>
                    <span className="why">
                      {x.reason} The driver: {DRIVERS[x.driver]!.toLowerCase()}.
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null
      }
    >
      <div className="tr">
        <article className="tr-card" data-phase={s.phase} data-right={ans ? ans.right : undefined} aria-live="polite" data-testid="finding" data-id={f.id}>
          <p className="tr-count tnum">
            Finding {Math.min(s.index + 1, DECK)} of {DECK}
          </p>
          <h2>{f.title}</h2>
          <p className="tr-evidence">{f.evidence}</p>
          {ans ? (
            <p className="tr-verdict">
              <strong>{ans.right ? `Right: ${f.severity}.` : ans.picked ? `It is ${f.severity}, not ${ans.picked}.` : `Too slow. It is ${f.severity}.`}</strong> {f.reason}
            </p>
          ) : (
            <>
              <p className="tr-hint">Ask who can reach it, whether they need a login or a click, and what it exposes.</p>
              <TimeBar left={s.cardLeft / (cardTime(s.index) / s.pace)} label="Time left on this card" />
            </>
          )}
        </article>
        <section className="tr-drivers" aria-label="What drives the score (bonus)">
          <p className="tr-q">What drives the score? A bonus if you pick it first.</p>
          <div className="tr-chips">
            {s.drivers[s.index]!.map((d: DriverId, i) => (
              <button
                key={d}
                type="button"
                className="tr-chip"
                aria-pressed={s.driver === d}
                data-sel={s.driver === d}
                data-truth={ans ? d === f.driver : undefined}
                disabled={s.phase !== 'ask'}
                onClick={() => act({ t: 'driver', id: d })}
              >
                <kbd className="hide-sm">{DRIVER_KEYS[i]!.toUpperCase()}</kbd>
                {DRIVERS[d]}
              </button>
            ))}
          </div>
        </section>
        <div className="tr-sev" role="group" aria-label="Severity">
          {SEVERITIES.map((sev, i) => (
            <button
              key={sev}
              type="button"
              className="tr-sevbtn"
              data-sev={sev}
              data-truth={ans ? sev === f.severity : undefined}
              data-picked={ans ? sev === ans.picked : undefined}
              disabled={s.phase !== 'ask'}
              onClick={() => act({ t: 'severity', sev })}
            >
              <span>{sev}</span>
              <kbd className="hide-sm">{i + 1}</kbd>
            </button>
          ))}
        </div>
      </div>
    </ArcadeShell>
  );
}
