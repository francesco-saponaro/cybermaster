import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useStore } from '../state/store';
import { ROADMAP, type RoadmapItem } from '../content/roadmap';
import { ACRONYMS, AREA_NAMES, type Acronym, type AcronymArea } from '../content/acronyms';
import { LEVEL_BY_ID } from '../content/index';
import { makeRng, randomSeed } from '../engine/rng';
import { Exam, Review, reviewDueCount } from './StudyExam';
import '../styles/study.css';

type Tab = 'roadmap' | 'acronyms' | 'review' | 'exam';

export function StudyPage() {
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('tab');
    return t === 'acronyms' || t === 'review' || t === 'exam' ? t : 'roadmap';
  });
  const [due] = useState(reviewDueCount);
  return (
    <div className="wrap study" style={{ paddingBlock: 'clamp(28px, 5vw, 56px)' }}>
      <header className="study-head">
        <h1>Study</h1>
        <p className="muted">Your boss's roadmap line by line, every acronym in it, a daily review and the final exam.</p>
      </header>
      <div className="study-tabs" role="tablist" aria-label="Study sections">
        <button type="button" role="tab" aria-selected={tab === 'roadmap'} onClick={() => setTab('roadmap')}>
          Roadmap
        </button>
        <button type="button" role="tab" aria-selected={tab === 'acronyms'} onClick={() => setTab('acronyms')}>
          Acronyms
        </button>
        <button type="button" role="tab" aria-selected={tab === 'review'} onClick={() => setTab('review')}>
          Review{due ? <span className="study-due tnum">{due}</span> : null}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'exam'} onClick={() => setTab('exam')}>
          Exam
        </button>
      </div>
      {tab === 'roadmap' ? <Roadmap /> : tab === 'acronyms' ? <Acronyms /> : tab === 'review' ? <Review /> : <Exam />}
    </div>
  );
}

// ---- Roadmap ------------------------------------------------------------------------

function itemStatus(item: RoadmapItem, cleared: (id: string) => boolean) {
  const built = item.levels.filter((id) => LEVEL_BY_ID[id]);
  const done = built.filter(cleared);
  return { built, done, coming: item.levels.length - built.length };
}

function Roadmap() {
  const { save } = useStore();
  const cleared = (id: string) => (save.levels[id]?.stars ?? 0) > 0;
  const all = ROADMAP.flatMap((b) => b.items);
  const covered = all.filter((i) => itemStatus(i, cleared).built.length > 0).length;
  const mastered = all.filter((i) => {
    const s = itemStatus(i, cleared);
    return s.built.length > 0 && s.done.length === s.built.length;
  }).length;
  return (
    <section aria-label="Roadmap">
      <div className="study-sum">
        <div>
          <strong className="tnum">{covered} / {all.length}</strong>
          <span>roadmap lines the game teaches</span>
        </div>
        <div>
          <strong className="tnum">{mastered} / {all.length}</strong>
          <span>lines you have cleared every level of</span>
        </div>
      </div>
      <p className="study-note">
        The game teaches what each line means and lets you practise it on simulated systems. The roadmap's own labs, linked under each block, are where you then do it on real tools.
      </p>
      {ROADMAP.map((b) => (
        <section key={b.id} className="rm-block" aria-labelledby={`rm-${b.id}`}>
          <h2 id={`rm-${b.id}`}>{b.title}</h2>
          <p className="rm-it">{b.it}</p>
          <ul className="rm-items">
            {b.items.map((item) => {
              const st = itemStatus(item, cleared);
              const state = st.built.length === 0 ? 'coming' : st.done.length === st.built.length ? 'done' : st.done.length ? 'started' : 'todo';
              return (
                <li key={item.en} data-state={state} data-testid="rm-item">
                  <div className="rm-line">
                    <span className="rm-dot" aria-hidden="true" />
                    <span className="grow">
                      <strong>{item.en}</strong>
                      <span className="rm-it">{item.it}</span>
                    </span>
                    <span className="rm-state">
                      {state === 'coming' ? 'Coming soon' : `${st.done.length} of ${st.built.length} cleared${st.coming ? `, ${st.coming} more coming` : ''}`}
                    </span>
                  </div>
                  {st.built.length ? (
                    <div className="rm-levels">
                      {st.built.map((id) => {
                        const l = LEVEL_BY_ID[id]!;
                        return (
                          <Link key={id} to="/play/$levelId" params={{ levelId: id }} className="rm-level" data-done={cleared(id)}>
                            {l.title}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {b.lab ? (
            <p className="rm-lab">
              <strong>Lab for this block:</strong> {b.lab.en} <span className="rm-it">{b.lab.it}</span>
            </p>
          ) : null}
          <p className="rm-practise">
            Practise it for real:{' '}
            {b.practise.map((p, i) => (
              <span key={p.url}>
                {i ? ', ' : ''}
                <a href={p.url} target="_blank" rel="noopener noreferrer">
                  {p.label}
                </a>
              </span>
            ))}
          </p>
        </section>
      ))}
    </section>
  );
}

// ---- Acronyms ---------------------------------------------------------------------------

const KNOWN_KEY = 'cybermaster.acronyms.known';
function readKnown(): string[] {
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
function writeKnown(v: string[]) {
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify(v));
  } catch {
    /* storage blocked: progress lasts for this visit */
  }
}

type Mode = 'list' | 'cards' | 'quiz';

function Acronyms() {
  const [mode, setMode] = useState<Mode>('list');
  const [area, setArea] = useState<AcronymArea | 'all'>('all');
  const [q, setQ] = useState('');
  const [known, setKnown] = useState<string[]>(readKnown);
  const toggleKnown = (abbr: string, yes: boolean) => {
    const next = yes ? [...new Set([...known, abbr])] : known.filter((k) => k !== abbr);
    setKnown(next);
    writeKnown(next);
  };
  const pool = ACRONYMS.filter((a) => area === 'all' || a.area === area);
  const shown = pool.filter((a) => {
    const n = q.trim().toLowerCase();
    return !n || a.abbr.toLowerCase().includes(n) || a.full.toLowerCase().includes(n) || a.meaning.toLowerCase().includes(n);
  });
  return (
    <section aria-label="Acronyms">
      <div className="ac-bar">
        <div className="ac-modes" role="group" aria-label="How to study">
          {(['list', 'cards', 'quiz'] as const).map((m) => (
            <button key={m} type="button" className="cbtn cbtn-sm" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === 'list' ? 'List' : m === 'cards' ? 'Flashcards' : 'Quiz'}
            </button>
          ))}
        </div>
        <span className="small muted tnum">
          {known.length} of {ACRONYMS.length} marked as known
        </span>
      </div>
      <div className="ac-areas" role="group" aria-label="Area">
        <button type="button" className="chip" aria-pressed={area === 'all'} onClick={() => setArea('all')}>
          All {ACRONYMS.length}
        </button>
        {(Object.keys(AREA_NAMES) as AcronymArea[]).map((a) => (
          <button key={a} type="button" className="chip" aria-pressed={area === a} onClick={() => setArea(a)}>
            {AREA_NAMES[a]}
          </button>
        ))}
      </div>
      {mode === 'list' ? (
        <>
          <label className="sr-only" htmlFor="ac-q">Search acronyms</label>
          <input id="ac-q" className="field ac-search" placeholder="Search: CVE, scoring, firewall..." value={q} onChange={(e) => setQ(e.target.value)} />
          <dl className="ac-list" data-testid="acronym-list">
            {shown.map((a) => (
              <div key={a.abbr} data-known={known.includes(a.abbr)}>
                <dt>
                  <span className="ac-abbr">{a.abbr}</span>
                  <span className="ac-full">{a.full}</span>
                </dt>
                <dd>
                  {a.meaning}
                  {a.example ? <span className="ac-ex">{a.example}</span> : null}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : mode === 'cards' ? (
        <Flashcards pool={pool} known={known} onKnown={toggleKnown} />
      ) : (
        <Quiz pool={pool.length >= 4 ? pool : ACRONYMS} />
      )}
    </section>
  );
}

function Flashcards({ pool, known, onKnown }: { pool: Acronym[]; known: string[]; onKnown: (abbr: string, yes: boolean) => void }) {
  const [onlyNew, setOnlyNew] = useState(true);
  const deck = useMemo(() => {
    const rng = makeRng(randomSeed());
    const base = onlyNew ? pool.filter((a) => !known.includes(a.abbr)) : pool;
    return rng.shuffle(base.length ? base : pool);
    // The deck is dealt once per filter change, not on every mark.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, onlyNew]);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = deck[i % deck.length]!;
  const next = (isKnown: boolean) => {
    onKnown(card.abbr, isKnown);
    setFlipped(false);
    setI((x) => x + 1);
  };
  return (
    <div className="fc">
      <label className="gvm-check small">
        <input type="checkbox" checked={onlyNew} onChange={(e) => { setOnlyNew(e.target.checked); setI(0); }} />
        <span>Only the ones not marked as known</span>
      </label>
      <button type="button" className="fc-card" data-flipped={flipped} onClick={() => setFlipped((f) => !f)} data-testid="flashcard">
        {flipped ? (
          <>
            <span className="fc-abbr small">{card.abbr}</span>
            <span className="fc-full">{card.full}</span>
            <span className="fc-meaning">{card.meaning}</span>
            {card.example ? <span className="ac-ex">{card.example}</span> : null}
          </>
        ) : (
          <>
            <span className="fc-abbr">{card.abbr}</span>
            <span className="small muted">What does it stand for, and what is it? Tap to check.</span>
          </>
        )}
      </button>
      <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
        <button type="button" className="cbtn" onClick={() => next(false)} disabled={!flipped}>
          Still learning
        </button>
        <button type="button" className="cbtn cbtn-go" onClick={() => next(true)} disabled={!flipped}>
          I knew it
        </button>
      </div>
      <p className="small muted" style={{ textAlign: 'center' }}>
        Card {(i % deck.length) + 1} of {deck.length}
      </p>
    </div>
  );
}

interface Question {
  ask: string;
  options: string[];
  answer: string;
  about: Acronym;
}

function makeQuiz(pool: Acronym[], seed: number, n = 10): Question[] {
  const rng = makeRng(seed);
  return rng.sample(pool, Math.min(n, pool.length)).map((a, k) => {
    const others = rng.sample(pool.filter((x) => x.abbr !== a.abbr), 3);
    if (k % 2 === 0) {
      return { ask: `What does ${a.abbr} stand for?`, options: rng.shuffle([a.full, ...others.map((o) => o.full)]), answer: a.full, about: a };
    }
    return { ask: `Which acronym is this? "${a.meaning}"`, options: rng.shuffle([a.abbr, ...others.map((o) => o.abbr)]), answer: a.abbr, about: a };
  });
}

function Quiz({ pool }: { pool: Acronym[] }) {
  const [seed, setSeed] = useState(randomSeed);
  const qs = useMemo(() => makeQuiz(pool, seed), [pool, seed]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState<Acronym[]>([]);
  const restart = () => {
    setSeed(randomSeed());
    setI(0);
    setPicked(null);
    setScore(0);
    setMisses([]);
  };
  if (i >= qs.length) {
    return (
      <div className="quiz" data-testid="quiz-done">
        <h2 className="tnum">
          {score} / {qs.length}
        </h2>
        {misses.length ? (
          <>
            <p className="muted">Look at these again:</p>
            <dl className="ac-list">
              {misses.map((a) => (
                <div key={a.abbr}>
                  <dt>
                    <span className="ac-abbr">{a.abbr}</span>
                    <span className="ac-full">{a.full}</span>
                  </dt>
                  <dd>{a.meaning}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p>All right. Try another round, or another area.</p>
        )}
        <button type="button" className="cbtn cbtn-go" onClick={restart}>
          New quiz
        </button>
      </div>
    );
  }
  const q = qs[i]!;
  return (
    <div className="quiz" data-testid="quiz">
      <p className="small muted tnum">
        Question {i + 1} of {qs.length} · {score} right
      </p>
      <h2 className="quiz-q">{q.ask}</h2>
      <div className="quiz-options">
        {q.options.map((o) => (
          <button
            key={o}
            type="button"
            className="quiz-opt"
            data-state={picked === null ? undefined : o === q.answer ? 'right' : o === picked ? 'wrong' : undefined}
            disabled={picked !== null}
            onClick={() => {
              setPicked(o);
              if (o === q.answer) setScore((s) => s + 1);
              else setMisses((m) => [...m, q.about]);
            }}
          >
            {o}
          </button>
        ))}
      </div>
      {picked !== null ? (
        <div className="quiz-after">
          <p>
            <strong>{q.about.abbr}</strong>: {q.about.full}. {q.about.meaning}
          </p>
          <button
            type="button"
            className="cbtn cbtn-go"
            autoFocus
            onClick={() => {
              setPicked(null);
              setI((x) => x + 1);
            }}
          >
            {i + 1 < qs.length ? 'Next question' : 'See the score'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
