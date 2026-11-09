import { describe, it, expect } from 'vitest';
import { DRIVERS, FINDINGS, SEVERITIES, type Severity } from '../src/content/arcade/findings';
import { ARCADE_BY_ID } from '../src/content/arcade';
import { arcadeStars } from '../src/engine/arcade';
import { baseScore, parseVector, severity } from '../src/engine/cvss';
import { makeRng } from '../src/engine/rng';
import { actTriage, cardTime, current, DECK, FIRST_CARD_MS, LAST_CARD_MS, REVEAL_MS, startTriage, stepTriage, streakMultiplier, type TriageState } from '../src/arcade/triage';

describe('Triage Rush answer key', () => {
  it('has enough findings for a deck, with unique ids, and every severity represented', () => {
    expect(FINDINGS.length).toBeGreaterThanOrEqual(DECK);
    expect(new Set(FINDINGS.map((f) => f.id)).size).toBe(FINDINGS.length);
    for (const sev of SEVERITIES) expect(FINDINGS.filter((f) => f.severity === sev).length, sev).toBeGreaterThanOrEqual(3);
  });
  for (const f of FINDINGS) {
    it(`${f.id}: the stated severity is what its CVSS 3.1 vector scores`, () => {
      expect(f.severity).toBe(severity(baseScore(parseVector(f.vector))));
    });
    it(`${f.id}: the driver is true of the finding and both decoys are not`, () => {
      const v = parseVector(f.vector);
      const has = (d: string) => {
        const [m, val] = d.split(':');
        return v[m as keyof typeof v] === val;
      };
      expect(DRIVERS[f.driver], f.driver).toBeTruthy();
      expect(has(f.driver)).toBe(true);
      for (const d of f.decoys) {
        expect(DRIVERS[d], d).toBeTruthy();
        expect(has(d), d).toBe(false);
      }
      expect(new Set([f.driver, ...f.decoys]).size).toBe(3);
    });
    it(`${f.id}: short enough for one card, with a one-line reason`, () => {
      expect(f.title.length).toBeLessThanOrEqual(40);
      expect(f.evidence.length).toBeLessThanOrEqual(110);
      expect(f.reason.length).toBeLessThanOrEqual(110);
      expect(f.reason.split(/(?<=[.!?])\s+(?=[A-Z])/).length).toBeLessThanOrEqual(2);
    });
  }
});

/** Plays a whole deck. `answer` returns the pick for a card (or null to let it time out) after `think` ms. */
function play(seed: number, answer: (s: TriageState) => { sev: Severity | null; driver?: boolean }, think = 2000): TriageState {
  let s = startTriage(seed);
  let wait = think;
  while (!s.over) {
    if (s.phase === 'ask') {
      wait -= 16;
      if (wait <= 0) {
        const a = answer(s);
        if (a.driver) s = actTriage(s, { t: 'driver', id: current(s).driver });
        if (a.sev) s = actTriage(s, { t: 'severity', sev: a.sev });
        wait = think;
      }
    } else wait = think;
    s = stepTriage(s, 16);
  }
  return s;
}

describe('Triage Rush rules', () => {
  it('the same seed deals the same deck, with no card twice', () => {
    const a = startTriage(4);
    expect(a.deck).toEqual(startTriage(4).deck);
    expect(new Set(a.deck).size).toBe(DECK);
    expect(a.deck).not.toEqual(startTriage(5).deck);
  });
  it('each card has less time than the one before, from 8 to 5 seconds', () => {
    expect(cardTime(0)).toBe(FIRST_CARD_MS);
    expect(cardTime(DECK - 1)).toBe(LAST_CARD_MS);
    for (let i = 1; i < DECK; i++) expect(cardTime(i)).toBeLessThan(cardTime(i - 1));
  });
  it('the streak multiplier climbs every three exact answers and stops at x3', () => {
    expect([0, 2, 3, 6, 9, 12, 30].map(streakMultiplier)).toEqual([1, 1, 1.5, 2, 2.5, 3, 3]);
  });
  it('only one card is ever on the table, and an answered card stays until the next one replaces it', () => {
    let s = startTriage(9);
    s = actTriage(s, { t: 'severity', sev: current(s).severity });
    expect(s.phase).toBe('reveal');
    expect(actTriage(s, { t: 'severity', sev: 'Low' })).toBe(s);
    for (let t = 0; t < REVEAL_MS - 100; t += 100) s = stepTriage(s, 100);
    expect(s.index).toBe(0);
    s = stepTriage(s, 200);
    expect(s.index).toBe(1);
    expect(s.phase).toBe('ask');
  });
  it('right answers score with the streak, a near miss scores a little, a timeout scores nothing', () => {
    let s = startTriage(2);
    s = actTriage(s, { t: 'driver', id: current(s).driver });
    s = actTriage(s, { t: 'severity', sev: current(s).severity });
    expect(s.answers[0]).toMatchObject({ right: true, driverRight: true, points: 150 });
    const wrongDriver = startTriage(2);
    const decoy = current(wrongDriver).decoys[0];
    const w = actTriage(actTriage(wrongDriver, { t: 'driver', id: decoy }), { t: 'severity', sev: current(wrongDriver).severity });
    expect(w.answers[0]!.points).toBe(100);
    let t = startTriage(2);
    while (t.phase === 'ask') t = stepTriage(t, 100);
    expect(t.answers[0]).toMatchObject({ picked: null, right: false, points: 0 });
  });
  it('a fast, careful analyst gets three stars; one who is often one step off gets fewer; one who lets cards time out gets none', () => {
    const t = ARCADE_BY_ID['triage-rush'].stars;
    for (let seed = 1; seed <= 25; seed++) {
      const ace = play(seed, (s) => ({ sev: current(s).severity, driver: true }));
      expect(ace.answers).toHaveLength(DECK);
      expect(arcadeStars(ace.score, t)).toBe(3);
      expect(ace.elapsed).toBeLessThan(120_000);
      expect(ace.elapsed).toBeGreaterThan(30_000);
      const rng = makeRng(seed);
      const shaky = play(seed, (s) => {
        const i = SEVERITIES.indexOf(current(s).severity);
        return { sev: rng.chance(0.35) ? SEVERITIES[i === 0 ? 1 : i - 1]! : current(s).severity };
      });
      expect(arcadeStars(shaky.score, t)).toBeLessThan(3);
      const asleep = play(seed, () => ({ sev: null }));
      expect(asleep.score).toBe(0);
      expect(asleep.elapsed).toBeLessThan(120_000);
    }
  });
});
