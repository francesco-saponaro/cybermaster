import { describe, it, expect } from 'vitest';
import { interceptScore, packetSeconds, catchPoints, runIsOver, emptyTally, tallyCatch, tallyPass } from '../src/engine/intercept';

describe('intercept scoring', () => {
  it('a perfect run scores 100', () => {
    expect(interceptScore({ caught: 5, totalBad: 5, falseCatches: 0, missedBad: 0, bestCombo: 5 })).toBe(100);
  });

  it('a missed bad packet costs more than nothing and a false catch costs half a hit', () => {
    const missedOne = interceptScore({ caught: 4, totalBad: 5, falseCatches: 0, missedBad: 1, bestCombo: 4 });
    const falseOne = interceptScore({ caught: 5, totalBad: 5, falseCatches: 1, missedBad: 0, bestCombo: 5 });
    expect(missedOne).toBeLessThan(100);
    expect(falseOne).toBeLessThan(100);
    expect(falseOne).toBeGreaterThan(missedOne);
  });

  it('the combo bonus is worth at most ten points', () => {
    const noCombo = interceptScore({ caught: 5, totalBad: 5, falseCatches: 0, missedBad: 0, bestCombo: 1 });
    expect(noCombo).toBeGreaterThanOrEqual(90);
    expect(noCombo).toBeLessThan(100);
  });

  it('never goes below zero or above 100', () => {
    expect(interceptScore({ caught: 0, totalBad: 5, falseCatches: 9, missedBad: 5, bestCombo: 0 })).toBe(0);
    expect(interceptScore({ caught: 0, totalBad: 0, falseCatches: 0, missedBad: 0, bestCombo: 0 })).toBe(0);
  });

  it('points per catch grow with the combo', () => {
    expect(catchPoints(0)).toBe(100);
    expect(catchPoints(3)).toBe(200);
    expect(catchPoints(12)).toBe(400);
  });
});

describe('intercept pacing and the miss meter', () => {
  it('packets cross faster as the mission goes on', () => {
    const pace = { start: 9, end: 4 };
    expect(packetSeconds(0, 10, pace)).toBe(9);
    expect(packetSeconds(9, 10, pace)).toBe(4);
    expect(packetSeconds(4, 10, pace)).toBeLessThan(packetSeconds(2, 10, pace));
  });

  it('a single packet takes the starting pace', () => {
    expect(packetSeconds(0, 1, { start: 8, end: 3 })).toBe(8);
  });

  it('the run ends when misses pass the limit, except at tutorial difficulty', () => {
    expect(runIsOver(3, 3, false)).toBe(true);
    expect(runIsOver(2, 3, false)).toBe(false);
    expect(runIsOver(10, 3, true)).toBe(false);
  });

  it('the tally tracks catches, misses and the best combo', () => {
    let t = emptyTally();
    t = tallyCatch(t, true); // caught a bad one
    t = tallyCatch(t, true);
    t = tallyCatch(t, false); // caught a clean one
    t = tallyPass(t, true); // a bad one got through
    t = tallyPass(t, false); // a clean one passed, as it should
    expect(t.caught).toBe(2);
    expect(t.falseCatches).toBe(1);
    expect(t.missedBad).toBe(1);
    expect(t.cleanPassed).toBe(1);
    expect(t.bestCombo).toBe(2);
    expect(t.combo).toBe(0);
    expect(t.misses).toBe(2);
  });
});
