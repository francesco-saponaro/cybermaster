import { describe, expect, it } from 'vitest';
import { GLOSSARY, GLOSS_BY_ID, termsIn } from '../src/content/glossary';
import { ALL_LEVELS } from '../src/content/index';
import { ARCADE } from '../src/content/arcade';
import { FORGERY_PAIRS, forgedLines } from '../src/content/arcade/forgery';

const levelTexts = (l: (typeof ALL_LEVELS)[number]) => [
  l.goal,
  l.instruction,
  ...l.checks.flatMap((c) => [c.label, c.do, c.learned, c.hint ?? '']),
  ...l.showMe.map((m) => m.say),
  l.didWhat,
];

describe('glossary', () => {
  it('has unique ids and a plain definition for each word', () => {
    const ids = GLOSSARY.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GLOSSARY) {
      expect(g.plain.length, g.id).toBeGreaterThan(20);
      expect(g.match.length, g.id).toBeGreaterThan(0);
    }
  });

  it('never gives one spelling two meanings', () => {
    const seen = new Map<string, string>();
    for (const g of GLOSSARY) for (const m of g.match) {
      expect(seen.get(m), `${m} is in ${seen.get(m)} and ${g.id}`).toBeUndefined();
      seen.set(m, g.id);
    }
  });

  it('explains the token words in the JWT level', () => {
    const jwt = ALL_LEVELS.find((l) => l.id === 'wire-jwt')!;
    const ids = termsIn(levelTexts(jwt)).map((g) => g.id);
    for (const id of ['jwt', 'alg', 'hs256', 'alg-none', 'payload', 'signature', '401']) expect(ids, id).toContain(id);
  });

  it('finds words for every level', () => {
    for (const l of ALL_LEVELS) expect(termsIn(levelTexts(l)).length, l.id).toBeGreaterThan(1);
  });

  it('reads words inside code and term markup but not inside other words', () => {
    expect(termsIn(['Set the header to `{"alg":"none"}`']).map((g) => g.id)).toEqual(expect.arrayContaining(['header', 'alg', 'alg-none']));
    expect(termsIn(['a [[cookies|cookie]] here']).map((g) => g.id)).toContain('cookie');
    expect(termsIn(['algebra and portable cookies-free']).map((g) => g.id)).not.toContain('alg');
  });
});

describe('arcade explanations', () => {
  it('every game explains its board, its rules and its words', () => {
    for (const g of ARCADE) {
      expect(g.board.length, g.id).toBeGreaterThan(2);
      expect(g.rules.length, g.id).toBeGreaterThan(0);
      for (const id of g.words) expect(GLOSS_BY_ID[id], `${g.id}: ${id}`).toBeDefined();
    }
  });

  it('every word printed on a Spot the Forgery card is in the glossary', () => {
    const texts = FORGERY_PAIRS.flatMap((p) => [...p.real, ...forgedLines(p)].flatMap((l) => [l.label, l.value]));
    const ids = termsIn(texts).map((g) => g.id);
    for (const id of ['get', 'post', 'delete', 'options', 'cookie', 'sid', 'alg', 'hs256', 'signature', 'origin', 'https']) expect(ids, id).toContain(id);
  });
});
