import { describe, it, expect } from 'vitest';
import { clampScore, stars, grade, accuracyScore, timeBonus, comboMultiplier, cvssScore, xpForRun, trustScore } from '../src/engine/scoring';

describe('scoring helpers', () => {
  it('clampScore stays in 0..100 and rounds', () => {
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(150)).toBe(100);
    expect(clampScore(72.6)).toBe(73);
    expect(clampScore(Number.NaN)).toBe(0);
  });

  it('stars follow the thresholds', () => {
    expect(stars(100)).toBe(3);
    expect(stars(95)).toBe(3);
    expect(stars(94)).toBe(2);
    expect(stars(75)).toBe(2);
    expect(stars(50)).toBe(1);
    expect(stars(49)).toBe(0);
  });

  it('grade names each band', () => {
    expect(grade(96)).toBe('Flawless');
    expect(grade(80)).toBe('Solid');
    expect(grade(60)).toBe('Cleared');
    expect(grade(10)).toBe('Failed');
  });

  it('accuracyScore penalises misses', () => {
    expect(accuracyScore(5, 5, 0)).toBe(100);
    expect(accuracyScore(0, 5, 0)).toBe(0);
    expect(accuracyScore(5, 5, 2, 0.5)).toBe(80); // (5 - 1)/5
    expect(accuracyScore(3, 4, 0)).toBe(75);
    expect(accuracyScore(1, 0, 0)).toBe(0);
  });

  it('timeBonus is linear between fast and slow', () => {
    expect(timeBonus(10, 10, 60, 10)).toBe(10);
    expect(timeBonus(60, 10, 60, 10)).toBe(0);
    expect(timeBonus(35, 10, 60, 10)).toBe(5);
    expect(timeBonus(5, 10, 60, 10)).toBe(10);
  });

  it('comboMultiplier grows and caps at 4', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(3)).toBe(2);
    expect(comboMultiplier(6)).toBe(3);
    expect(comboMultiplier(9)).toBe(4);
    expect(comboMultiplier(30)).toBe(4);
  });

  it('cvssScore rewards matched metrics and a close score', () => {
    expect(cvssScore(8, 0)).toBe(100);
    expect(cvssScore(8, 0.03)).toBe(100);
    expect(cvssScore(0, 5)).toBe(0);
    expect(cvssScore(4, 1.5)).toBe(45); // 40 + 5
    expect(cvssScore(6, 0.5)).toBe(70); // 60 + 10
  });

  it('xpForRun pays a first-clear bonus and little for a fail', () => {
    expect(xpForRun(100, 100, true)).toBe(150);
    expect(xpForRun(100, 100, false)).toBe(100);
    expect(xpForRun(100, 80, false)).toBe(80);
    expect(xpForRun(100, 40, false)).toBe(10);
  });

  it('trustScore rewards good fragments and drains on wrong ones', () => {
    expect(trustScore(['good', 'good', 'good'])).toBe(100);
    expect(trustScore(['wrong', 'wrong'])).toBe(0);
    expect(trustScore(['weak', 'weak'])).toBe(40);
    expect(trustScore([])).toBe(0);
    expect(trustScore(['good', 'wrong'])).toBe(35); // (1 - 0.3)/2
  });
});

describe('hints, freezes and card streaks', () => {
  it('a hint costs ten XP and never takes XP below zero', async () => {
    const { applyHint, HINT_COST } = await import('../src/engine/scoring');
    const { emptySave } = await import('../src/engine/save');
    const save = emptySave();
    save.xp = 25;
    const once = applyHint(save);
    expect(HINT_COST).toBe(10);
    expect(once.xp).toBe(15);
    expect(once.hints).toBe(1);
    const twice = applyHint(once);
    expect(twice.xp).toBe(5);
    const thrice = applyHint(twice);
    expect(thrice.xp).toBe(0);
    expect(thrice.hints).toBe(3);
    // the original is untouched
    expect(save.xp).toBe(25);
  });

  it('freezing on the exact message is worth everything, one message off is worth half', async () => {
    const { freezeScore } = await import('../src/engine/scoring');
    expect(freezeScore(3, 3)).toBe(1);
    expect(freezeScore(2, 3)).toBe(0.5);
    expect(freezeScore(4, 3)).toBe(0.5);
    expect(freezeScore(0, 3)).toBe(0);
    expect(freezeScore(null, 3)).toBe(0);
  });

  it('a live round combines the freeze and the fix', async () => {
    const { liveRoundScore } = await import('../src/engine/scoring');
    expect(liveRoundScore(1, true)).toBe(100);
    expect(liveRoundScore(0.5, true)).toBe(75);
    expect(liveRoundScore(1, false)).toBe(50);
    expect(liveRoundScore(0, false)).toBe(0);
  });

  it('a timed stream scores accuracy first and speed as a small bonus', async () => {
    const { streamScore } = await import('../src/engine/scoring');
    expect(streamScore(6, 6, 6)).toBe(100);
    expect(streamScore(6, 6, 0)).toBe(90);
    expect(streamScore(3, 6, 0)).toBe(45);
    expect(streamScore(0, 6, 0)).toBe(0);
  });
});
