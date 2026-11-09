import { describe, it, expect } from 'vitest';
import { COMBO_START, comboStep, comboBroke, comboMultiplier, xpWithBonuses, type Combo, type ComboEvent } from '../src/engine/combo';
import { challengeStars, challengePoints, nextHintCost, clock, HINT_COST } from '../src/engine/scoring';
import { incidentConfig, incidentStep, startIncident, stageOf, recordsTaken, secondsLeft, STAGES, type Incident } from '../src/engine/incident';
import { utcDay, nextUtcDay, dailyPick, shareText } from '../src/engine/daily';
import { makeRng, hashString } from '../src/engine/rng';
import { caseBoard, remarkFor } from '../src/engine/caseboard';
import { emptySave } from '../src/engine/save';
import { applyChallenge, applyClear, applyIncident, applyBeat, applyCloseCase } from '../src/state/store';
import { ZONES } from '../src/content/zones';
import { ALL_LEVELS } from '../src/content/index';
import { BEATS, REMARKS, PINS, TIMELINE, ENDING } from '../src/content/story';
import { plain } from '../src/game/Rich';

const run = (events: ComboEvent[]): Combo => events.reduce(comboStep, COMBO_START);

describe('combo and XP bonuses', () => {
  it('counts correct actions in a row and keeps the best', () => {
    const c = run(['correct', 'correct', 'correct', 'mistake', 'correct']);
    expect(c).toEqual({ current: 1, best: 3, mistakes: 1, helps: 0 });
  });
  it('a hint or Show me breaks it too, and a break of two or more is worth a sound', () => {
    const two = run(['correct', 'correct']);
    expect(comboBroke(two, 'help')).toBe(true);
    expect(comboBroke(run(['correct']), 'mistake')).toBe(false);
    expect(comboStep(two, 'help')).toMatchObject({ current: 0, helps: 1, best: 2 });
  });
  it('multiplies XP by 0.1 per step after the first, up to 1.5', () => {
    expect([0, 1, 2, 3, 6, 9].map(comboMultiplier)).toEqual([1, 1, 1.1, 1.2, 1.5, 1.5]);
  });
  it('adds a quarter for a clean run, on top of the combo', () => {
    expect(xpWithBonuses(100, 3, true)).toEqual({ base: 100, multiplier: 1.2, comboXp: 20, cleanXp: 25, total: 145 });
    expect(xpWithBonuses(100, 0, false).total).toBe(100);
  });
});

describe('challenge scoring', () => {
  it('three stars with no hint inside par; hints and time cost one each, never below one', () => {
    expect(challengeStars({ hints: 0, seconds: 50, par: 60 })).toBe(3);
    expect(challengeStars({ hints: 1, seconds: 50, par: 60 })).toBe(2);
    expect(challengeStars({ hints: 0, seconds: 61, par: 60 })).toBe(2);
    expect(challengeStars({ hints: 3, seconds: 600, par: 60 })).toBe(1);
  });
  it('points start at 1000, hints cost more as they get more specific, and time over par costs 2 a second', () => {
    expect(challengePoints({ hints: 0, seconds: 30, par: 60 })).toBe(1000);
    expect(challengePoints({ hints: 2, seconds: 70, par: 60 })).toBe(1000 - HINT_COST[0]! - HINT_COST[1]! - 20);
    expect(challengePoints({ hints: 3, seconds: 9999, par: 60 })).toBe(100);
    expect(nextHintCost(0, 3)).toBe(100);
    expect(nextHintCost(3, 3)).toBeNull();
    expect(clock(65)).toBe('1:05');
  });
  it('a guided clear with a combo and a clean run earns more, and the clean run badge', () => {
    const plainRun = applyClear(emptySave(), 'wire-robots', { showMe: 0, fails: 0, seconds: 30 }, '2026-11-09', 'now').outcome;
    const bonus = applyClear(emptySave(), 'wire-robots', { showMe: 0, fails: 0, seconds: 30, comboBest: 3, clean: true }, '2026-11-09', 'now');
    expect(bonus.outcome.xpGained).toBeGreaterThan(plainRun.xpGained);
    expect(bonus.outcome.newBadges).toContain('clean-run');
    expect(bonus.save.bestCombo).toBe(3);
  });
  it('a challenge clear records the best result and gives the zone badge when every challenge is cleared', () => {
    let save = emptySave();
    for (const id of ZONES[0]!.levelIds) save = applyChallenge(save, id, { hints: 0, seconds: 20, par: 60, comboBest: 2, clean: false }, '2026-11-09', 'now').save;
    expect(save.challenges['wire-robots']).toMatchObject({ stars: 3, clears: 1, bestPoints: 1000 });
    expect(save.badges).toContain('challenge-wire');
    const again = applyChallenge(save, 'wire-robots', { hints: 2, seconds: 99, par: 60, comboBest: 0, clean: false }, '2026-11-09', 'now');
    expect(again.save.challenges['wire-robots']).toMatchObject({ stars: 3, clears: 2, bestPoints: 1000 });
    expect(again.outcome.best).toBe(false);
  });
});

describe('the live incident', () => {
  const cfg = incidentConfig('normal', 100, 48211);
  const tick = (s: Incident, seconds: number) => incidentStep(s, { t: 'tick', dt: seconds }, cfg);

  it('moves through four stages to a breach on its own', () => {
    let s = startIncident(cfg);
    expect(STAGES).toEqual(['Recon', 'Foothold', 'Access', 'Exfiltration']);
    s = tick(s, cfg.breachSeconds / 2);
    expect(stageOf(s.progress)).toBe(2);
    expect(s.status).toBe('running');
    s = tick(s, cfg.breachSeconds);
    expect(s).toMatchObject({ progress: 100, status: 'breached', peak: 3 });
    expect(recordsTaken(s.progress, cfg.records)).toBe(48211);
  });
  it('a correct step pushes the attacker back and freezes them', () => {
    let s = tick(startIncident(cfg), 60);
    const before = s.progress;
    s = incidentStep(s, { t: 'correct' }, cfg);
    expect(s.progress).toBeCloseTo(before - cfg.pushBack);
    const frozen = tick(s, cfg.freeze - 1);
    expect(frozen.progress).toBeCloseTo(s.progress);
    expect(tick(frozen, 3).progress).toBeGreaterThan(s.progress);
  });
  it('a mistake speeds them up a little, up to a ceiling', () => {
    let s = startIncident(cfg);
    for (let i = 0; i < 40; i++) s = incidentStep(s, { t: 'wrong' }, cfg);
    expect(s.speed).toBe(cfg.maxSpeed);
    expect(secondsLeft(s, cfg)).toBeLessThan(secondsLeft(startIncident(cfg), cfg));
  });
  it('once contained or breached, nothing changes', () => {
    const won = incidentStep(startIncident(cfg), { t: 'contain' }, cfg);
    expect(tick(won, 9999)).toEqual(won);
  });
  it('no records leave before exfiltration starts', () => {
    expect(recordsTaken(75, 1000)).toBe(0);
    expect(recordsTaken(87.5, 1000)).toBe(500);
  });
  it('is gentler on a first guided play and harsher in a challenge', () => {
    const g = incidentConfig('gentle', 180, 1);
    const h = incidentConfig('harsh', 180, 1);
    expect(g.breachSeconds).toBeGreaterThan(cfg.breachSeconds);
    expect(h.breachSeconds).toBeLessThan(incidentConfig('normal', 180, 1).breachSeconds);
    expect(g.freeze).toBeGreaterThan(h.freeze);
    expect(h.speedUp).toBeGreaterThan(g.speedUp);
  });
});

describe("today's case", () => {
  const pool = ALL_LEVELS.map((l) => l.id);
  it('picks the same level and seed for the same UTC day, every time', () => {
    expect(dailyPick('2026-11-09', pool)).toEqual(dailyPick('2026-11-09', [...pool]));
    expect(utcDay(new Date('2026-11-09T23:59:59-05:00'))).toBe('2026-11-10');
    expect(nextUtcDay('2026-12-31')).toBe('2027-01-01');
  });
  it('changes from day to day and spreads across the pool', () => {
    const days = Array.from({ length: 60 }, (_, i) => utcDay(new Date(Date.UTC(2026, 10, 1 + i))));
    const picks = days.map((d) => dailyPick(d, pool)!);
    expect(new Set(picks.map((p) => p.levelId)).size).toBeGreaterThan(10);
    expect(new Set(picks.map((p) => p.seed)).size).toBe(60);
    expect(dailyPick('2026-11-09', [])).toBeNull();
  });
  it('only picks from the pool it is given (the open zones)', () => {
    const wire = ZONES[0]!.levelIds;
    for (let i = 0; i < 30; i++) expect(wire).toContain(dailyPick(`2026-12-${String(i + 1).padStart(2, '0')}`, wire)!.levelId);
  });
  it('shares the date, zone, stars and time, and nothing about the puzzle', () => {
    const text = shareText({ day: '2026-11-09', zone: 'The Wire', stars: 2, seconds: 72, hints: 1, streak: 4 });
    expect(text).toBe('CyberMaster daily 2026-11-09\nThe Wire\n★★☆ 1:12\n1 hint, streak 4');
    expect(shareText({ day: '2026-11-09', zone: 'The Cloud', stars: 3, seconds: 5, hints: 0, streak: 1 })).toContain('No hints');
  });
  it('records the best result of the day and the daily streak, and replays only improve it', () => {
    let save = emptySave();
    save = applyChallenge(save, 'wire-jwt', { hints: 1, seconds: 90, par: 100, comboBest: 0, clean: false }, '2026-11-08', 'x', '2026-11-08').save;
    const today = applyChallenge(save, 'wire-cors', { hints: 2, seconds: 120, par: 100, comboBest: 0, clean: false }, '2026-11-09', 'x', '2026-11-09');
    expect(today.outcome.daily).toMatchObject({ day: '2026-11-09', streak: 2, first: true });
    const replay = applyChallenge(today.save, 'wire-cors', { hints: 0, seconds: 60, par: 100, comboBest: 0, clean: false }, '2026-11-09', 'x', '2026-11-09');
    expect(replay.outcome.daily).toMatchObject({ streak: 2, first: false });
    expect(replay.save.daily.days['2026-11-09']).toMatchObject({ stars: 3, seconds: 60 });
    expect(replay.outcome.xpGained).toBeLessThan(today.outcome.xpGained + 1000);
    expect(replay.save.challenges['wire-cors']).toBeUndefined();
  });
  it('the seeded generator is stable', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a.next(), a.int(1, 6), a.hex(4)]).toEqual([b.next(), b.int(1, 6), b.hex(4)]);
  });
});

describe('the story and the case board', () => {
  it('has a beat for every zone, a remark and a pin for every level, and no em dashes', () => {
    for (const z of ZONES) expect(BEATS[z.id].lines.length).toBeGreaterThanOrEqual(3), expect(BEATS[z.id].lines.length).toBeLessThanOrEqual(4);
    for (const l of ALL_LEVELS) {
      expect(REMARKS[l.id], l.id).toBeTruthy();
      expect(PINS[l.id], l.id).toBeTruthy();
    }
    const all = JSON.stringify([BEATS, REMARKS, PINS, TIMELINE, ENDING]);
    expect(all).not.toMatch(/—/);
    expect(all).not.toMatch(/zumbat/i);
    expect(all).not.toMatch(/OR 1=1|onerror=|<script|\/etc\/passwd/i);
    for (const r of Object.values(REMARKS)) expect(plain(r.text).split(/(?<=[.!?])\s+(?=[A-Z])/).length).toBeLessThanOrEqual(2);
  });
  it('remarks that refer to an earlier find wait until it is found', () => {
    const save = emptySave();
    expect(remarkFor('arena-sqli', save)).toBeNull();
    expect(remarkFor('wire-robots', save)?.who).toBe('Ines');
    const after = applyClear(save, 'wire-robots', { showMe: 0, fails: 0, seconds: 30 }, '2026-11-09', 'x').save;
    expect(remarkFor('arena-sqli', after)?.text).toMatch(/admin-old/);
  });
  it('fills in as levels are cleared, timeline and pins together', () => {
    let save = emptySave();
    const empty = caseBoard(save, ZONES);
    expect(empty.found).toBe(0);
    expect(empty.total).toBe(ALL_LEVELS.length);
    expect(empty.timeline.filter((t) => t.found).map((t) => t.time)).toEqual(['Mon 08:00']);
    save = applyClear(save, 'wire-replay', { showMe: 0, fails: 0, seconds: 30 }, '2026-11-09', 'x').save;
    const board = caseBoard(save, ZONES);
    expect(board.found).toBe(1);
    expect(board.pins.find((p) => p.levelId === 'wire-replay')).toMatchObject({ found: true, zone: 'wire' });
    expect(board.timeline.find((t) => t.time === 'Sun 22:40')?.found).toBe(true);
    expect(board.solved).toBe(false);
  });
  it('is solved when the last zone is cleared, and closing it gives a badge once', () => {
    let save = emptySave();
    for (const id of ZONES[4]!.levelIds) save = applyClear(save, id, { showMe: 0, fails: 0, seconds: 30 }, '2026-11-09', 'x').save;
    expect(caseBoard(save, ZONES).solved).toBe(true);
    const closed = applyCloseCase(save);
    expect(closed.newBadges).toEqual(['case-closed']);
    expect(applyCloseCase(closed.save).newBadges).toEqual([]);
    expect(caseBoard(closed.save, ZONES).closed).toBe(true);
  });
  it('remembers which beats were seen and how incidents went', () => {
    const s = applyBeat(applyBeat(emptySave(), 'wire'), 'wire');
    expect(s.story.beats).toEqual(['wire']);
    const i = applyIncident(applyIncident(s, 'wire-cors', false), 'wire-cors', true);
    expect(i.incidents['wire-cors']).toEqual({ won: 1, lost: 1 });
  });
});
