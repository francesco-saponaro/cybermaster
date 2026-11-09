import { describe, it, expect, beforeEach } from 'vitest';
import { migrate, loadSave, persistSave, emptySave, SaveSchema, SAVE_VERSION, SAVE_KEY } from '../src/engine/save';

describe('save file', () => {
  it('an empty save validates against the schema', () => {
    expect(SaveSchema.safeParse(emptySave()).success).toBe(true);
  });

  it('migrate keeps a current save as is', () => {
    const save = emptySave();
    save.xp = 420;
    save.missions['wire-headers'] = { best: 88, stars: 2, clears: 2, lastPlayedAt: '' };
    expect(migrate(save)).toEqual(save);
  });

  it('migrate upgrades a version-1 save', () => {
    const v1 = {
      version: 1,
      name: 'Mara',
      xp: 300,
      completed: ['wire-headers', 'arena-lineup'],
      scores: { 'wire-headers': 92, 'arena-lineup': 60 },
      muted: true,
    };
    const out = migrate(v1);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.name).toBe('Mara');
    expect(out.xp).toBe(300);
    expect(out.settings.muted).toBe(true);
    expect(out.missions['wire-headers']).toEqual({ best: 92, stars: 2, clears: 1, lastPlayedAt: '' });
    expect(out.missions['arena-lineup']?.best).toBe(60);
    expect(SaveSchema.safeParse(out).success).toBe(true);
  });

  it('migrate returns a fresh save for junk', () => {
    expect(migrate({ nonsense: true })).toEqual(emptySave());
    expect(migrate(null)).toEqual(emptySave());
    expect(migrate('not json')).toEqual(emptySave());
  });

  it('migrate repairs an out-of-range score from a v1 save', () => {
    const out = migrate({ version: 1, completed: ['x'], scores: { x: 999 } });
    expect(out.missions['x']?.best).toBe(100);
  });
});

describe('storage round-trip (in-memory stub)', () => {
  let store: Record<string, string>;
  const mem = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
  };

  beforeEach(() => {
    store = {};
  });

  it('persists and loads', () => {
    const save = emptySave();
    save.xp = 123;
    save.codex = ['http-anatomy'];
    expect(persistSave(save, mem)).toBe(true);
    expect(store[SAVE_KEY]).toBeDefined();
    const back = loadSave(mem);
    expect(back.xp).toBe(123);
    expect(back.codex).toEqual(['http-anatomy']);
  });

  it('loadSave survives a throwing storage', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadSave(broken)).toEqual(emptySave());
  });

  it('persistSave returns false when storage throws', () => {
    const broken = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(persistSave(emptySave(), broken)).toBe(false);
  });

  it('loadSave returns an empty save when nothing is stored', () => {
    expect(loadSave(mem)).toEqual(emptySave());
  });
});
