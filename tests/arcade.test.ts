import { describe, it, expect } from 'vitest';
import { ARCADE, ARCADE_BY_ZONE } from '../src/content/arcade';
import { ZONES } from '../src/content/zones';
import { applyArcade, arcadeStars, arcadeUnlocked, arcadeXp, ARCADE_XP } from '../src/engine/arcade';
import { emptySave } from '../src/engine/save';

const shapes = ZONES.map((z) => ({ id: z.id, levelIds: z.levelIds }));
const run = { stars: 2, clears: 1, bestSeconds: 60, lastPlayedAt: '' };

describe('arcade games', () => {
  it('one game per zone, each with three how-to lines, controls and rising star scores', () => {
    expect(ARCADE.map((g) => g.zone).sort()).toEqual(ZONES.map((z) => z.id).sort());
    for (const g of ARCADE) {
      expect(ARCADE_BY_ZONE[g.zone]).toBe(g);
      expect(g.howTo).toHaveLength(3);
      expect(g.controls.length).toBeGreaterThanOrEqual(2);
      expect(g.stars[0]).toBeLessThan(g.stars[1]);
      expect(g.stars[1]).toBeLessThan(g.stars[2]);
      expect(g.seconds).toBeGreaterThanOrEqual(60);
      expect(g.seconds).toBeLessThanOrEqual(120);
      expect(g.line.length).toBeGreaterThan(20);
    }
  });
});

describe('arcade stars, XP and unlocks', () => {
  it('stars follow the thresholds', () => {
    const t = [100, 200, 300] as const;
    expect([0, 99, 100, 199, 200, 299, 300, 9999].map((s) => arcadeStars(s, t))).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it('XP is paid only for new stars, so a game is worth at most ARCADE_XP[3] in total', () => {
    expect(arcadeXp(0, 3)).toBe(ARCADE_XP[3]);
    expect(arcadeXp(1, 2)).toBe(ARCADE_XP[2] - ARCADE_XP[1]);
    expect(arcadeXp(3, 1)).toBe(0);
    expect(arcadeXp(2, 2)).toBe(0);
    let save = emptySave();
    let total = 0;
    for (const score of [150, 50, 250, 400, 400, 120, 999]) {
      const r = applyArcade(save, 'packet-runner', score, [100, 200, 300], '2026-11-09', 'now');
      total += r.outcome.xpGained;
      save = r.save;
    }
    expect(total).toBe(ARCADE_XP[3]);
    expect(save.xp).toBe(ARCADE_XP[3]);
    expect(save.arcade['packet-runner']).toEqual({ best: 999, stars: 3, plays: 7, lastPlayedAt: 'now' });
  });
  it('the arcade cannot carry a new player past the levels: all five at three stars is under two levels of XP', () => {
    expect(ARCADE_XP[3] * ARCADE.length).toBeLessThanOrEqual(500);
  });
  it('a run reports a new best only when it beats the old one', () => {
    const first = applyArcade(emptySave(), 'lockdown', 500, [100, 200, 300], '2026-11-09', 'a');
    expect(first.outcome).toMatchObject({ best: true, priorBest: 0, stars: 3 });
    const worse = applyArcade(first.save, 'lockdown', 400, [100, 200, 300], '2026-11-09', 'b');
    expect(worse.outcome).toMatchObject({ best: false, priorBest: 500, xpGained: 0 });
    expect(worse.save.arcade.lockdown!.best).toBe(500);
  });
  it("a zone's game opens with its boss, or when an old save opened the next zone", () => {
    const s = emptySave();
    expect(arcadeUnlocked(s, shapes, 'wire')).toBe(false);
    expect(arcadeUnlocked({ ...s, levels: { 'wire-cors': run } }, shapes, 'wire')).toBe(true);
    expect(arcadeUnlocked({ ...s, levels: { 'wire-robots': run } }, shapes, 'wire')).toBe(false);
    expect(arcadeUnlocked({ ...s, zones: ['arena'] }, shapes, 'wire')).toBe(true);
    expect(arcadeUnlocked({ ...s, levels: { 'report-lab': run } }, shapes, 'report')).toBe(true);
    expect(arcadeUnlocked(s, shapes, 'nowhere')).toBe(false);
  });
});
