import { describe, expect, it } from 'vitest';
import { EXAM, EXAM_AREAS, EXAM_BY_ID } from '../src/content/exam';
import { LEVEL_BY_ID } from '../src/content/index';
import { ROADMAP } from '../src/content/roadmap';
import { addDays, addMissed, answerCard, buildPaper, dueToday, isRight, readiness, scoreByArea } from '../src/engine/exam';

describe('the question bank', () => {
  it('has unique ids, at least five questions per roadmap area, and every area is a roadmap block', () => {
    expect(new Set(EXAM.map((q) => q.id)).size).toBe(EXAM.length);
    for (const a of EXAM_AREAS) {
      expect(EXAM.filter((q) => q.area === a.id).length, a.id).toBeGreaterThanOrEqual(5);
      expect(ROADMAP.some((b) => b.id === a.id), a.id).toBe(true);
    }
  });
  it('every question is answerable, explains itself and points at a level that exists', () => {
    for (const q of EXAM) {
      expect(!!q.options !== !!q.accept, q.id).toBe(true);
      if (q.options) {
        expect(q.options.length, q.id).toBe(4);
        expect(new Set(q.options).size, q.id).toBe(4);
        expect(q.answer, q.id).toBeGreaterThanOrEqual(0);
        expect(q.answer, q.id).toBeLessThan(4);
      } else expect(q.accept!.length, q.id).toBeGreaterThan(0);
      expect(q.why.length, q.id).toBeGreaterThan(20);
      expect(LEVEL_BY_ID[q.level], `${q.id}: ${q.level}`).toBeDefined();
    }
  });
});

describe('marking', () => {
  it('typed answers ignore case and spacing around operators', () => {
    const q = EXAM_BY_ID['w1-filter']!;
    expect(isRight(q, 'http.request && ip.src == 10.0.0.5')).toBe(true);
    expect(isRight(q, '  HTTP.REQUEST&&ip.src==10.0.0.5 ')).toBe(true);
    expect(isRight(q, 'http && ip.src == 10.0.0.5')).toBe(false);
    expect(isRight(EXAM_BY_ID['w7-rhosts']!, 'set rhosts 10.0.9.9')).toBe(true);
  });
  it('a paper takes three per area, the same for the same seed, with shuffled options', () => {
    const areas = EXAM_AREAS.map((a) => a.id);
    const p = buildPaper(EXAM, areas, 42);
    expect(p).toHaveLength(areas.length * 3);
    expect(buildPaper(EXAM, areas, 42)).toEqual(p);
    for (const a of areas) expect(p.filter((x) => EXAM_BY_ID[x.id]!.area === a)).toHaveLength(3);
    for (const x of p) if (x.order) expect([...x.order].sort()).toEqual([0, 1, 2, 3]);
  });
  it('scores by area and turns exam and play into a readiness label', () => {
    const s = scoreByArea(EXAM_BY_ID, [{ id: 'w1-subnet', right: true }, { id: 'w1-nat', right: false }, { id: 'w3-idor', right: true }], ['w1', 'w3']);
    expect(s).toEqual([{ area: 'w1', right: 1, asked: 2 }, { area: 'w3', right: 1, asked: 1 }]);
    expect(readiness(100, 100)).toEqual({ pct: 100, label: 'Ready' });
    expect(readiness(67, 50).label).toBe('Getting there');
    expect(readiness(33, 0).label).toBe('Not yet');
  });
});

describe('the review', () => {
  it('missed questions are due today; right answers come back later and retire, wrong ones tomorrow', () => {
    const today = '2026-11-13';
    let d = addMissed({}, ['w1-nat', 'w3-idor'], today);
    expect(dueToday(d, today).sort()).toEqual(['w1-nat', 'w3-idor']);
    d = answerCard(d, 'w1-nat', true, today);
    expect(d['w1-nat']).toEqual({ box: 2, due: addDays(today, 2) });
    d = answerCard(d, 'w3-idor', false, today);
    expect(d['w3-idor']).toEqual({ box: 1, due: '2026-11-14' });
    expect(dueToday(d, today)).toEqual([]);
    let answers = 0;
    while (d['w1-nat'] && answers < 10) {
      d = answerCard(d, 'w1-nat', true, d['w1-nat'].due);
      answers++;
    }
    expect(answers).toBe(4);
    expect(d['w1-nat']).toBeUndefined();
  });
});
