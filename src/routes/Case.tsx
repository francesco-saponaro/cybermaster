import { useEffect, useRef } from 'react';
import { Link } from '@tanstack/react-router';
import { useStore } from '../state/store';
import { ZONES } from '../content/zones';
import { ALL_LEVELS } from '../content/index';
import { CAST, CLIENT, ENDING } from '../content/story';
import { caseBoard } from '../engine/caseboard';
import { Scope } from '../components/Scope';

/** The incident board: the timeline of the attack and the evidence pinned so far, each with what it proved. */
export function CasePage() {
  const { save } = useStore();
  const board = caseBoard(save, ZONES);
  const shown = board.timeline.filter((t) => t.found).length;
  return (
    <div className="wrap case-page">
      <header className="case-head">
        <p className="eyebrow">The case</p>
        <h1>{CLIENT.name}</h1>
        <p className="case-sub">{CLIENT.what} On Monday their customers' invoices turned up for sale. This board fills in as you clear levels.</p>
        <div className="case-meter">
          <div className="meter" role="progressbar" aria-label="Evidence found" aria-valuenow={board.found} aria-valuemin={0} aria-valuemax={board.total}>
            <span style={{ width: `${(board.found / board.total) * 100}%` }} />
          </div>
          <span className="tnum small muted">
            {board.found} of {board.total} pieces of evidence
          </span>
        </div>
        {board.solved ? (
          <Link to="/ending" className="btn btn-primary" style={{ marginTop: 18 }}>
            {board.closed ? 'Read the ending again' : 'Close the case'}
          </Link>
        ) : null}
      </header>

      <div className="case-grid">
        <section aria-labelledby="timeline-title" className="case-timeline">
          <h2 id="timeline-title">Timeline</h2>
          <p className="small muted" style={{ margin: '4px 0 14px' }}>
            {shown} of {board.timeline.length} moments proved
          </p>
          <ol className="tl">
            {board.timeline.map((t) => (
              <li key={t.time} data-found={t.found}>
                <span className="tl-time tnum">{t.time}</span>
                <span className="tl-text">{t.found ? t.text : 'Not proved yet'}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="evidence-title">
          <h2 id="evidence-title">Evidence</h2>
          {ZONES.map((z) => {
            const pins = board.pins.filter((p) => p.zone === z.id);
            return (
              <div key={z.id} className="pin-zone">
                <h3>
                  {z.name} <span className="small muted tnum">{pins.filter((p) => p.found).length}/{pins.length}</span>
                </h3>
                <ul className="pins">
                  {pins.map((p) => (
                    <li key={p.levelId} className="pin" data-found={p.found}>
                      {p.found ? (
                        <>
                          <strong>{p.title}</strong>
                          <span>{p.proved}</span>
                        </>
                      ) : (
                        <>
                          <strong className="muted">Not found yet</strong>
                          <span className="muted">Clear {ALL_LEVELS.find((l) => l.id === p.levelId)?.title ?? 'its level'} to pin it.</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

export function EndingPage() {
  const { save, closeCase } = useStore();
  const board = caseBoard(save, ZONES);
  const closedOnce = useRef(false);
  useEffect(() => {
    if (board.solved && !board.closed && !closedOnce.current) {
      closedOnce.current = true;
      closeCase();
    }
  }, [board.solved, board.closed, closeCase]);

  if (!board.solved) {
    return (
      <div className="wrap" style={{ paddingBlock: 60, maxWidth: 640 }}>
        <h1 style={{ fontSize: 'var(--step-head)' }}>The case is still open</h1>
        <p className="muted">Clear the last level of The Report to close it.</p>
        <Link to="/case" className="btn btn-primary" style={{ marginTop: 8 }}>
          Open the case board
        </Link>
      </div>
    );
  }
  const stars = ALL_LEVELS.reduce((n, l) => n + (save.levels[l.id]?.stars ?? 0), 0);
  const challenges = ALL_LEVELS.filter((l) => (save.challenges[l.id]?.stars ?? 0) >= 1).length;
  return (
    <div className="ending">
      <div aria-hidden="true" className="ending-scope">
        <Scope size={520} cleared filled />
      </div>
      <div className="wrap ending-inner">
        <p className="eyebrow">Case closed</p>
        <h1>The Lantern & Co. case</h1>
        <ol className="ending-lines">
          {ENDING.map((l, i) => (
            <li key={i} style={{ animationDelay: `${0.25 + i * 0.5}s` }}>
              <span className="ending-who">
                {l.who}
                <span>{CAST[l.who].role}</span>
              </span>
              <p>{l.text}</p>
            </li>
          ))}
        </ol>
        <dl className="ending-stats">
          <div>
            <dt>Evidence</dt>
            <dd className="tnum">
              {board.found}/{board.total}
            </dd>
          </div>
          <div>
            <dt>Stars</dt>
            <dd className="tnum">
              {stars}/{ALL_LEVELS.length * 3}
            </dd>
          </div>
          <div>
            <dt>Challenges</dt>
            <dd className="tnum">
              {challenges}/{ALL_LEVELS.length}
            </dd>
          </div>
        </dl>
        <p className="ending-next">The challenges stay open: every level has an unguided version with new values each time, and there is a new case every day.</p>
        <div className="ending-actions">
          <Link to="/case" className="btn btn-primary">
            Look at the board
          </Link>
          <Link to="/" className="btn btn-ghost">
            Back to the title
          </Link>
        </div>
      </div>
    </div>
  );
}
