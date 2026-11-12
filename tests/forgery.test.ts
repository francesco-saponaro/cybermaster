import { describe, expect, it } from 'vitest';
import { FORGERY_PAIRS, PAIR_BY_ID, forgedLines } from '../src/content/arcade/forgery';
import { actForgery, FIRST_ROUND_MS, LAST_ROUND_MS, LIVES, multiplier, PER_TIER, ROUNDS, roundMs, startForgery, stepForgery, type ForgeryState, type Side } from '../src/arcade/forgery';
import { ARCADE_BY_ID } from '../src/content/arcade';
import { arcadeStars as starsFor } from '../src/engine/arcade';

const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');

/** Plays a run: `answer` picks a side for each round (or null to let the clock run out), after `wait` ms. */
function play(seed: number, answer: (s: ForgeryState) => Side | null, wait: number | ((round: number) => number) = 3000): ForgeryState {
  let s = startForgery(seed);
  for (let guard = 0; guard < 100 && !s.over; guard++) {
    const pick = answer(s);
    if (pick === null) s = stepForgery(s, roundMs(s.round) + 1);
    else {
      s = stepForgery(s, typeof wait === 'number' ? wait : wait(s.round));
      s = actForgery(s, { t: 'pick', side: pick });
    }
    s = actForgery(s, { t: 'next' });
  }
  return s;
}

describe('Spot the Forgery content', () => {
  it('has unique pairs, enough of each tier, and exactly one decisive line each', () => {
    expect(new Set(FORGERY_PAIRS.map((p) => p.id)).size).toBe(FORGERY_PAIRS.length);
    for (const tier of [1, 2, 3]) expect(FORGERY_PAIRS.filter((p) => p.tier === tier).length).toBeGreaterThanOrEqual(PER_TIER);
    for (const p of FORGERY_PAIRS) {
      const fake = forgedLines(p);
      const diff = p.real.map((l, i) => (l.value !== fake[i]!.value ? i : -1)).filter((i) => i >= 0);
      expect(diff, p.id).toContain(p.forged.line);
      expect(diff.length, p.id).toBe(p.decoy ? 2 : 1);
      if (p.decoy) expect(p.decoy.line, p.id).not.toBe(p.forged.line);
      expect(p.why.length, p.id).toBeGreaterThan(40);
    }
  });

  it('tier 3 pairs all carry a harmless difference, so spotting the change is not enough', () => {
    for (const p of FORGERY_PAIRS.filter((x) => x.tier === 3)) expect(p.decoy, p.id).toBeDefined();
  });
});

describe('Spot the Forgery rules', () => {
  it('deals four pairs per tier, easiest first, from the seed', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = startForgery(seed);
      expect(s.rounds).toHaveLength(ROUNDS);
      expect(new Set(s.rounds).size).toBe(ROUNDS);
      expect(s.rounds.map((id) => PAIR_BY_ID[id]!.tier)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
      expect(startForgery(seed)).toEqual(s);
    }
  });

  it('puts the forged card on both sides across runs', () => {
    const sides = Array.from({ length: 30 }, (_, i) => startForgery(i + 1).sides).flat();
    const left = sides.filter((x) => x === 'left').length;
    expect(left).toBeGreaterThan(sides.length * 0.3);
    expect(left).toBeLessThan(sides.length * 0.7);
  });

  it('gives each round less time, from 18 to 9 seconds', () => {
    expect(roundMs(0)).toBe(FIRST_ROUND_MS);
    expect(roundMs(ROUNDS - 1)).toBe(LAST_ROUND_MS);
    for (let r = 1; r < ROUNDS; r++) expect(roundMs(r)).toBeLessThanOrEqual(roundMs(r - 1));
  });

  it('a right pick scores and builds the streak; the clock stops while the answer is shown', () => {
    let s = startForgery(5);
    s = stepForgery(s, 2000);
    s = actForgery(s, { t: 'pick', side: s.sides[0]! });
    expect(s.stage).toBe('reveal');
    expect(s.gained).toBe(100 + 16 * 10);
    expect(s.streak).toBe(1);
    const frozen = stepForgery(s, 60_000);
    expect(frozen).toEqual(s);
    expect(actForgery(s, { t: 'pick', side: 'left' })).toEqual(s);
  });

  it('a wrong pick or the clock running out costs a life and the streak', () => {
    let s = startForgery(5);
    s = actForgery(s, { t: 'pick', side: other(s.sides[0]!) });
    expect(s.lives).toBe(LIVES - 1);
    expect(s.mistakes).toEqual([{ pair: s.rounds[0], kind: 'wrong' }]);
    s = actForgery(s, { t: 'next' });
    s = stepForgery(s, roundMs(1));
    expect(s.stage).toBe('reveal');
    expect(s.lives).toBe(LIVES - 2);
    expect(s.mistakes[1]!.kind).toBe('slow');
  });

  it('three mistakes end the run; twelve rounds survived win it', () => {
    const lost = play(9, (s) => other(s.sides[s.round]!));
    expect(lost.over && !lost.won).toBe(true);
    expect(lost.round).toBe(LIVES - 1);
    const won = play(9, (s) => s.sides[s.round]!);
    expect(won.over && won.won).toBe(true);
    expect(won.correct).toBe(ROUNDS);
    expect(won.bestStreak).toBe(ROUNDS);
  });

  it('the multiplier goes x1, x2, x3 every three in a row', () => {
    expect([0, 2, 3, 5, 6, 20].map(multiplier)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('stars: a fast perfect run earns three, a slow perfect run two, a shaky run one', () => {
    const t = ARCADE_BY_ID['spot-the-forgery'].stars;
    for (let seed = 1; seed < 20; seed++) {
      expect(starsFor(play(seed, (s) => s.sides[s.round]!, 2500).score, t), `fast ${seed}`).toBe(3);
      expect(starsFor(play(seed, (s) => s.sides[s.round]!, (r) => roundMs(r) - 500).score, t), `slow ${seed}`).toBe(2);
      // Right on the easy rounds, then two mistakes and the rest right, at a steady pace.
      const shaky = play(seed, (s) => (s.round === 4 || s.round === 8 ? other(s.sides[s.round]!) : s.sides[s.round]!), 6000);
      expect(shaky.won).toBe(true);
      expect(starsFor(shaky.score, t), `shaky ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });
});
