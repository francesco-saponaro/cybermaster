// The final exam and the daily review, as pure functions over the question
// bank. A paper draws the same number of questions from every roadmap area
// and shuffles their options from a seed. Readiness per area mixes what the
// exam shows you remember with how much of that area you have played. Missed
// questions go into a Leitner review: a right answer moves a card to a box
// seen less often, a wrong one sends it back to the first box.

import { makeRng } from './rng';
import type { ExamQuestion } from '../content/exam';

export interface PaperQuestion {
  id: string;
  /** For a choice question: the original option indexes in the order shown. */
  order?: number[];
}

export function buildPaper(bank: ExamQuestion[], areas: string[], seed: number, perArea = 3): PaperQuestion[] {
  const rng = makeRng(seed);
  const out: PaperQuestion[] = [];
  for (const a of areas) {
    const pool = bank.filter((q) => q.area === a);
    for (const q of rng.sample(pool, Math.min(perArea, pool.length))) {
      out.push(q.options ? { id: q.id, order: rng.shuffle(q.options.map((_, i) => i)) } : { id: q.id });
    }
  }
  return out;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[“”]/g, '"').replace(/\s*(==|&&|\|\|)\s*/g, ' $1 ');

/** Is this answer right? For a choice question, `answer` is the original option index. */
export function isRight(q: ExamQuestion, answer: string | number): boolean {
  if (q.options) return answer === q.answer;
  const a = norm(String(answer));
  return (q.accept ?? []).some((x) => norm(x) === a);
}

export interface AreaScore {
  area: string;
  right: number;
  asked: number;
}

export function scoreByArea(bank: Record<string, ExamQuestion>, results: { id: string; right: boolean }[], areas: string[]): AreaScore[] {
  return areas.map((area) => {
    const mine = results.filter((r) => bank[r.id]?.area === area);
    return { area, right: mine.filter((r) => r.right).length, asked: mine.length };
  });
}

export type Readiness = 'Ready' | 'Getting there' | 'Not yet';

/** 60% what the exam shows, 40% how much of the area's levels you have cleared. */
export function readiness(examPct: number, playedPct: number): { pct: number; label: Readiness } {
  const pct = Math.round(examPct * 0.6 + playedPct * 0.4);
  return { pct, label: pct >= 80 ? 'Ready' : pct >= 55 ? 'Getting there' : 'Not yet' };
}

// ---- The daily review (Leitner boxes) ---------------------------------------------------

export interface ReviewCard {
  box: number;
  due: string;
}

export type ReviewDeck = Record<string, ReviewCard>;

/** Days until a card in each box comes back. */
export const BOX_DAYS = [1, 2, 4, 8, 16];

export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Put missed questions in the first box, due today. Cards already there go back to box 1. */
export function addMissed(deck: ReviewDeck, ids: string[], today: string): ReviewDeck {
  const next = { ...deck };
  for (const id of ids) next[id] = { box: 1, due: today };
  return next;
}

export function dueToday(deck: ReviewDeck, today: string): string[] {
  return Object.entries(deck)
    .filter(([, c]) => c.due <= today)
    .sort((a, b) => a[1].due.localeCompare(b[1].due) || a[1].box - b[1].box)
    .map(([id]) => id);
}

/** Answer one card: right moves it up a box (and retires it after the last), wrong sends it back to box 1 for tomorrow. */
export function answerCard(deck: ReviewDeck, id: string, right: boolean, today: string): ReviewDeck {
  const c = deck[id] ?? { box: 1, due: today };
  const next = { ...deck };
  if (!right) {
    next[id] = { box: 1, due: addDays(today, BOX_DAYS[0]!) };
    return next;
  }
  const box = c.box + 1;
  if (box > BOX_DAYS.length) {
    delete next[id];
    return next;
  }
  next[id] = { box, due: addDays(today, BOX_DAYS[box - 1]!) };
  return next;
}

// ---- Storage (per browser, best effort) ----------------------------------------------------

export interface ExamRecord {
  day: string;
  pct: number;
  areas: Record<string, number>;
}

const EXAM_KEY = 'cybermaster.exam';
const REVIEW_KEY = 'cybermaster.review';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: the exam still works, it just is not remembered.
  }
}

export const loadExams = () => read<ExamRecord[]>(EXAM_KEY, []);
export const saveExams = (v: ExamRecord[]) => write(EXAM_KEY, v.slice(-20));
export const loadDeck = () => read<ReviewDeck>(REVIEW_KEY, {});
export const saveDeck = (v: ReviewDeck) => write(REVIEW_KEY, v);

/** Today as the review counts it: the reader's own calendar day. */
export function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
