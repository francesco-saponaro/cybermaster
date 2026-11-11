import { describe, expect, it } from 'vitest';
import { GLOSSARY, GLOSS_BY_ID, termsIn } from '../src/content/glossary';
import { ALL_LEVELS } from '../src/content/index';
import { ARCADE } from '../src/content/arcade';
import { PACKET_PRACTICE } from '../src/content/arcade/packetPractice';
import { PACKETS, PACKET_BY_ID } from '../src/content/arcade/packets';

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

  it('the Packet Runner practice covers every kind of bad request and uses real cards', () => {
    for (const c of PACKET_PRACTICE) expect(PACKET_BY_ID[c.template], c.template).toBeDefined();
    const kinds = new Set(PACKET_PRACTICE.map((c) => PACKET_BY_ID[c.template]!.header.split(/[:=]/)[0]));
    expect(kinds.size).toBeGreaterThan(3);
    expect(PACKET_PRACTICE.some((c) => !PACKET_BY_ID[c.template]!.bad)).toBe(true);
    expect(PACKET_PRACTICE.filter((c) => PACKET_BY_ID[c.template]!.bad).length).toBeGreaterThanOrEqual(5);
  });

  it('every word printed on a Packet Runner card is in the glossary', () => {
    const ids = termsIn(PACKETS.flatMap((p) => [p.req, p.header, p.note])).map((g) => g.id);
    for (const id of ['get', 'post', 'options', 'cookie', 'sid', 'alg', 'hs256', 'exp', 'origin', 'robots', 'signature']) expect(ids, id).toContain(id);
  });
});
