import { describe, it, expect } from 'vitest';
import { migrate, loadSave, persistSave, emptySave, SAVE_VERSION, SAVE_KEY } from '../src/engine/save';
import { CODEX } from '../src/content/codex';
import { BADGES } from '../src/engine/progress';

const ctx = { codexIds: CODEX.map((c) => c.id), badgeIds: BADGES.map((b) => b.id) };

const v3 = {
  version: 3,
  name: 'Mara',
  xp: 840,
  missions: {
    'wire-headers': { best: 90, stars: 2, clears: 1, lastPlayedAt: '' },
    'wire-boss': { best: 80, stars: 2, clears: 1, lastPlayedAt: '' },
    'arena-boss': { best: 40, stars: 0, clears: 0, lastPlayedAt: '' },
  },
  codex: ['http-anatomy', 'sqli', 'an-entry-that-no-longer-exists'],
  badges: ['first-clear', 'zone-wire', 'retired-badge'],
  streak: { count: 4, lastDay: '2026-11-08' },
  settings: { muted: true },
  prologueDone: true,
  hints: 3,
};

describe('save migration', () => {
  it('a current save passes through untouched', () => {
    const s = { ...emptySave(), xp: 50, levels: { 'wire-robots': { stars: 3, clears: 1, bestSeconds: 42, lastPlayedAt: 'x' } } };
    expect(migrate(s, ctx)).toEqual(s);
  });
  it('version 3 keeps XP, codex, badges, streak and settings, and a cleared boss opens the next zone', () => {
    const m = migrate(v3, ctx);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m).toMatchObject({ name: 'Mara', xp: 840, streak: { count: 4, lastDay: '2026-11-08' }, settings: { muted: true } });
    expect(m.codex).toEqual(['http-anatomy', 'sqli']);
    expect(m.badges).toEqual(['first-clear', 'zone-wire']);
    expect(m.zones).toEqual(['arena']);
    expect(m.levels).toEqual({});
  });
  it('version 2 migrates the same way', () => {
    const { prologueDone: _p, hints: _h, ...rest } = v3;
    void _p;
    void _h;
    expect(migrate({ ...rest, version: 2 }, ctx).zones).toEqual(['arena']);
  });
  it('version 1 keeps XP and the zones its completed bosses opened', () => {
    const m = migrate({ version: 1, name: 'Old', xp: 120.4, completed: ['wire-boss', 'arena-boss'], muted: true }, ctx);
    expect(m).toMatchObject({ name: 'Old', xp: 120, zones: ['arena', 'perimeter'], settings: { muted: true } });
  });
  it('junk becomes a fresh save', () => {
    expect(migrate({ hello: 'world' })).toEqual(emptySave());
    expect(migrate(null)).toEqual(emptySave());
  });
  it('load and persist survive broken or blocked storage', () => {
    expect(loadSave({ getItem: () => '{not json' })).toEqual(emptySave());
    expect(loadSave({ getItem: () => { throw new Error('blocked'); } })).toEqual(emptySave());
    expect(persistSave(emptySave(), { setItem: () => { throw new Error('quota'); } })).toBe(false);
    const store: Record<string, string> = {};
    persistSave({ ...emptySave(), xp: 9 }, { setItem: (k, v) => { store[k] = v; } });
    expect(loadSave({ getItem: (k) => store[k] ?? null }).xp).toBe(9);
    expect(Object.keys(store)).toEqual([SAVE_KEY]);
  });
});

describe('save version 5', () => {
  const v4 = {
    version: 4,
    name: 'Ines',
    xp: 1640,
    levels: { 'wire-robots': { stars: 3, clears: 2, bestSeconds: 41, lastPlayedAt: '2026-11-08T10:00:00Z' } },
    codex: ['http-anatomy'],
    badges: ['first-clear', 'flawless'],
    streak: { count: 2, lastDay: '2026-11-08' },
    settings: { muted: true },
    evidence: ['ev-jwt-none'],
    zones: ['arena'],
  };
  it('migrates version 4 keeping every field, with empty challenges, daily, story and incidents', () => {
    const m = migrate(v4, ctx);
    const { version: _v, ...kept } = v4;
    void _v;
    expect(m).toMatchObject(kept);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.challenges).toEqual({});
    expect(m.daily).toEqual({ streak: { count: 0, lastDay: '' }, days: {} });
    expect(m.story).toEqual({ beats: [], closed: false });
    expect(m.incidents).toEqual({});
    expect(m.bestCombo).toBe(0);
  });
  it('older versions still arrive at the current version', () => {
    expect(migrate(v3, ctx).version).toBe(SAVE_VERSION);
    expect(migrate({ version: 1, xp: 5 }, ctx).version).toBe(SAVE_VERSION);
  });
  it('a current save round-trips through storage', () => {
    const store: Record<string, string> = {};
    const s = { ...migrate(v4, ctx), challenges: { 'wire-robots': { stars: 2, clears: 1, bestSeconds: 30, bestPoints: 850, lastPlayedAt: 'x' } }, bestCombo: 4 };
    persistSave(s, { setItem: (k, v) => { store[k] = v; } });
    expect(loadSave({ getItem: (k) => store[k] ?? null })).toEqual(s);
  });
});

describe('save version 6', () => {
  const v5 = {
    version: 5,
    name: 'Bruno',
    xp: 2310,
    levels: { 'wire-cors': { stars: 2, clears: 1, bestSeconds: 95, lastPlayedAt: '2026-11-08T10:00:00Z' } },
    codex: ['http-anatomy', 'cors'],
    badges: ['first-clear'],
    streak: { count: 3, lastDay: '2026-11-08' },
    settings: { muted: false },
    evidence: ['ev-jwt-none'],
    zones: [],
    challenges: { 'wire-robots': { stars: 3, clears: 2, bestSeconds: 30, bestPoints: 990, lastPlayedAt: 'x' } },
    daily: { streak: { count: 2, lastDay: '2026-11-08' }, days: { '2026-11-08': { levelId: 'wire-robots', stars: 3, seconds: 40, hints: 0, points: 900 } } },
    story: { beats: ['wire', 'arena'], closed: false },
    incidents: { 'wire-cors': { won: 1, lost: 2 } },
    bestCombo: 7,
  };
  it('is the current version', () => {
    expect(SAVE_VERSION).toBe(6);
  });
  it('migrates version 5 keeping every field, with an empty arcade', () => {
    const m = migrate(v5, ctx);
    const { version: _v, ...kept } = v5;
    void _v;
    expect(m).toEqual({ ...kept, version: 6, arcade: {} });
  });
  it('a version 6 save with arcade runs round-trips through storage', () => {
    const store: Record<string, string> = {};
    const s = { ...migrate(v5, ctx), arcade: { 'spot-the-forgery': { best: 5200, stars: 2, plays: 3, lastPlayedAt: '2026-11-09T09:00:00Z' } } };
    persistSave(s, { setItem: (k, v) => { store[k] = v; } });
    expect(loadSave({ getItem: (k) => store[k] ?? null })).toEqual(s);
  });
});
