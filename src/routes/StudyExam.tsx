import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useStore } from '../state/store';
import { ROADMAP } from '../content/roadmap';
import { LEVEL_BY_ID } from '../content/index';
import { EXAM, EXAM_AREAS, EXAM_BY_ID, type ExamQuestion } from '../content/exam';
import { ACRONYMS } from '../content/acronyms';
import { randomSeed, makeRng } from '../engine/rng';
import { addMissed, answerCard, buildPaper, dueToday, isRight, loadDeck, loadExams, localDay, readiness, saveDeck, saveExams, scoreByArea, type PaperQuestion, type ReviewDeck } from '../engine/exam';

const AREA_NAME = Object.fromEntries(EXAM_AREAS.map((a) => [a.id, a.name])) as Record<string, string>;

/** How much of an area's levels are cleared, from the roadmap block of the same id. */
function playedPct(area: string, cleared: (id: string) => boolean): number {
  const block = ROADMAP.find((b) => b.id === area);
  const ids = [...new Set((block?.items ?? []).flatMap((i) => i.levels).filter((id) => LEVEL_BY_ID[id]))];
  if (!ids.length) return 0;
  return Math.round((ids.filter(cleared).length / ids.length) * 100);
}

// ---- One question ----------------------------------------------------------------------------

function QuestionCard({ q, order, onDone, label }: { q: ExamQuestion; order?: number[]; onDone: (right: boolean) => void; label: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<boolean | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (result !== null) nextRef.current?.focus();
  }, [result]);
  const answer = (a: string | number) => {
    if (result !== null) return;
    if (typeof a === 'number') setPicked(a);
    setResult(isRight(q, a));
  };
  const opts = order ?? q.options?.map((_, i) => i);
  return (
    <section className="ex-card" aria-label={label} data-result={result === null ? undefined : result ? 'right' : 'wrong'}>
      <p className="ex-area small">{AREA_NAME[q.area]}</p>
      <h3 className="ex-q">{q.q}</h3>
      {q.options && opts ? (
        <ul className="ex-opts">
          {opts.map((i) => (
            <li key={i}>
              <button
                type="button"
                className="ex-opt"
                data-picked={picked === i}
                data-right={result !== null && i === q.answer}
                disabled={result !== null}
                onClick={() => answer(i)}
              >
                {q.options![i]}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <form
          className="ex-type"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) answer(typed);
          }}
        >
          <input className="field mono grow" aria-label="Your answer" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={result !== null} spellCheck={false} autoCapitalize="off" autoComplete="off" />
          <button type="submit" className="btn btn-primary" disabled={result !== null}>
            Check
          </button>
        </form>
      )}
      {result !== null ? (
        <div className="ex-why" aria-live="polite">
          <p>
            <strong>{result ? 'Right.' : 'Not quite.'}</strong> {!result && q.accept ? <>One right answer: <code className="mono">{q.accept[0]}</code>. </> : null}
            {q.why}
          </p>
          <div className="row">
            <button ref={nextRef} type="button" className="btn btn-primary" onClick={() => onDone(result)}>
              Next
            </button>
            <Link to="/play/$levelId" params={{ levelId: q.level }} className="btn btn-ghost">
              Replay: {LEVEL_BY_ID[q.level]?.title ?? q.level}
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---- The exam ----------------------------------------------------------------------------------

export function Exam() {
  const { save } = useStore();
  const cleared = (id: string) => (save.levels[id]?.stars ?? 0) > 0;
  const [paper, setPaper] = useState<PaperQuestion[] | null>(null);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<{ id: string; right: boolean }[]>([]);
  const [past, setPast] = useState(loadExams);
  const finished = paper && i >= paper.length;

  const start = () => {
    setPaper(buildPaper(EXAM, EXAM_AREAS.map((a) => a.id), randomSeed(), 3));
    setI(0);
    setResults([]);
  };

  const done = (right: boolean) => {
    const id = paper![i]!.id;
    const next = [...results, { id, right }];
    setResults(next);
    setI(i + 1);
    if (i + 1 >= paper!.length) {
      const scores = scoreByArea(EXAM_BY_ID, next, EXAM_AREAS.map((a) => a.id));
      const pct = Math.round((next.filter((r) => r.right).length / next.length) * 100);
      const rec = { day: localDay(), pct, areas: Object.fromEntries(scores.map((s) => [s.area, s.asked ? Math.round((s.right / s.asked) * 100) : 0])) };
      const all = [...past, rec];
      setPast(all);
      saveExams(all);
      saveDeck(addMissed(loadDeck(), next.filter((r) => !r.right).map((r) => r.id), localDay()));
    }
  };

  const last = past[past.length - 1];

  if (paper && !finished) {
    const pq = paper[i]!;
    return (
      <section aria-label="Final exam">
        <div className="ex-progress">
          <span className="small muted">
            Question <span className="tnum">{i + 1}</span> of <span className="tnum">{paper.length}</span>
          </span>
          <span className="ex-bar" aria-hidden="true">
            <span style={{ width: `${(i / paper.length) * 100}%` }} />
          </span>
        </div>
        <QuestionCard key={pq.id} q={EXAM_BY_ID[pq.id]!} order={pq.order} onDone={done} label={`Question ${i + 1}`} />
      </section>
    );
  }

  const areas = EXAM_AREAS.map((a) => {
    const ex = last?.areas[a.id] ?? 0;
    const pl = playedPct(a.id, cleared);
    return { ...a, exam: ex, played: pl, ...readiness(ex, pl) };
  });
  const overall = readiness(last?.pct ?? 0, Math.round(areas.reduce((s, a) => s + a.played, 0) / areas.length));
  const weakest = [...areas].sort((x, y) => x.pct - y.pct).slice(0, 3);

  return (
    <section aria-label="Final exam" className="ex">
      {finished ? (
        <div className="ex-done" role="status">
          <p className="eyebrow">Exam finished</p>
          <h2 className="tnum">{last!.pct}%</h2>
          <p className="muted">{results.filter((r) => r.right).length} of {results.length} right. Every question you missed is now in Review, starting today.</p>
        </div>
      ) : (
        <div className="ex-intro">
          <p>
            {EXAM_AREAS.length * 3} questions, three from each block of the roadmap, no steps and no hints. Some ask you to type a filter or a command. It takes about twenty minutes, and every question you miss goes into your daily Review.
          </p>
          <p className="muted small">Readiness per area is 60% what the exam shows you remember and 40% how much of that area you have played. A real job also needs the real labs listed under each area.</p>
        </div>
      )}
      <div className="row" style={{ margin: '16px 0 24px' }}>
        <button type="button" className="btn btn-primary" onClick={start}>
          {last ? 'Take the exam again' : 'Start the exam'}
        </button>
        {last ? <span className="small muted">Last: {last.pct}% on {last.day}{past.length > 1 ? `, best ${Math.max(...past.map((p) => p.pct))}%` : ''}</span> : null}
      </div>
      <h2 className="ex-h">Readiness by area</h2>
      <p className="ex-overall">
        Overall: <strong data-label={overall.label}>{overall.label}</strong> <span className="tnum muted">({overall.pct}%)</span>
      </p>
      <ul className="ex-areas">
        {areas.map((a) => {
          const block = ROADMAP.find((b) => b.id === a.id);
          return (
            <li key={a.id} className="ex-area-row">
              <div className="ex-area-top">
                <strong>{a.name}</strong>
                <span className="ex-label" data-label={a.label}>
                  {a.label}
                </span>
              </div>
              <div className="ex-meters">
                <span className="small muted">Exam <b className="tnum">{a.exam}%</b></span>
                <span className="ex-bar" aria-label={`Exam ${a.exam}%`}>
                  <span style={{ width: `${a.exam}%` }} />
                </span>
                <span className="small muted">Played <b className="tnum">{a.played}%</b></span>
                <span className="ex-bar ex-bar-played" aria-label={`Played ${a.played}%`}>
                  <span style={{ width: `${a.played}%` }} />
                </span>
              </div>
              {weakest.some((w) => w.id === a.id) && block ? (
                <p className="small ex-next">
                  Next:{' '}
                  {block.practise.map((p, k) => (
                    <span key={p.url}>
                      {k ? ', ' : ''}
                      <a href={p.url} target="_blank" rel="noreferrer">
                        {p.label}
                      </a>
                    </span>
                  ))}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- The daily review ----------------------------------------------------------------------------

/** A few acronyms you have not marked as known, as cards too. */
function acronymCard(abbr: string, seed: number): ExamQuestion | null {
  const a = ACRONYMS.find((x) => x.abbr === abbr);
  if (!a) return null;
  const rng = makeRng(seed);
  const others = rng.sample(ACRONYMS.filter((x) => x.abbr !== abbr), 3).map((x) => x.full);
  return { id: `acr:${abbr}`, area: 'acronyms', q: `What does ${a.abbr} stand for?`, options: [a.full, ...others], answer: 0, why: a.meaning, level: 'net-subnet' };
}

function readKnownAcronyms(): string[] {
  try {
    return JSON.parse(localStorage.getItem('cybermaster.acronyms.known') ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function Review() {
  const today = localDay();
  const [deck, setDeck] = useState<ReviewDeck>(() => {
    // Seed the deck with five acronyms not yet known, once a day.
    const d = loadDeck();
    const known = new Set(readKnownAcronyms());
    const inDeck = Object.keys(d).filter((k) => k.startsWith('acr:')).length;
    if (inDeck < 5) {
      const fresh = ACRONYMS.filter((a) => !known.has(a.abbr) && !d[`acr:${a.abbr}`]).slice(0, 5 - inDeck);
      for (const a of fresh) d[`acr:${a.abbr}`] = { box: 1, due: today };
      saveDeck(d);
    }
    return d;
  });
  const [queue] = useState(() => dueToday(deck, today).filter((id) => (id.startsWith('acr:') ? ACRONYMS.some((a) => `acr:${a.abbr}` === id) : !!EXAM_BY_ID[id])));
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const seed = useMemo(() => randomSeed(), []);
  const card = (id: string): { q: ExamQuestion; order?: number[] } | null => {
    if (id.startsWith('acr:')) {
      const q = acronymCard(id.slice(4), seed + id.length);
      return q ? { q, order: makeRng(seed + i).shuffle([0, 1, 2, 3]) } : null;
    }
    const q = EXAM_BY_ID[id];
    return q ? { q, order: q.options ? makeRng(seed + i).shuffle(q.options.map((_, k) => k)) : undefined } : null;
  };
  const total = Object.keys(deck).length;

  if (i < queue.length) {
    const c = card(queue[i]!);
    if (!c) return null;
    return (
      <section aria-label="Review">
        <div className="ex-progress">
          <span className="small muted">
            Card <span className="tnum">{i + 1}</span> of <span className="tnum">{queue.length}</span> due today
          </span>
        </div>
        <QuestionCard
          key={queue[i]}
          q={c.q}
          order={c.order}
          label={`Card ${i + 1}`}
          onDone={(r) => {
            const next = answerCard(deck, queue[i]!, r, today);
            setDeck(next);
            saveDeck(next);
            if (r) setRight(right + 1);
            setI(i + 1);
          }}
        />
      </section>
    );
  }

  return (
    <section aria-label="Review" className="ex">
      <div className="ex-done" role="status">
        <p className="eyebrow">Review</p>
        <h2>{queue.length ? `Done for today: ${right} of ${queue.length}` : 'Nothing due today'}</h2>
        <p className="muted">
          {total} card{total === 1 ? '' : 's'} in your review. A card you get right comes back in 2, then 4, 8 and 16 days, then retires; one you miss comes back tomorrow. Exam mistakes and acronyms you have not marked as known land here.
        </p>
      </div>
    </section>
  );
}

/** How many review cards are due today, for the Study tab and the home page. */
export function reviewDueCount(): number {
  return dueToday(loadDeck(), localDay()).length;
}
