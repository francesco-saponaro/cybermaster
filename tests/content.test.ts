import { describe, it, expect } from 'vitest';
import { ALL_LEVELS, LEVEL_BY_ID, ZONES, CODEX, CODEX_BY_ID, EVIDENCE_BY_ID } from '../src/content/index';
import { plain } from '../src/game/Rich';
import { ARENA_APPS } from '../src/sim/arena';
import { evaluateTerminal } from '../src/game/evaluate';
import { SERVERS } from '../src/sim/wire';
import { ARCADE } from '../src/content/arcade';
import { FORGERY_PAIRS } from '../src/content/arcade/forgery';
import { ATTACKS, FIXES } from '../src/content/arcade/defence';
import { PUZZLES } from '../src/content/arcade/lockdown';
import { FINDINGS } from '../src/content/arcade/findings';
import { SERVICES } from '../src/arcade/sweeper';

function sentences(text: string): number {
  return plain(text).split(/(?<=[.!?])\s+(?=[A-Z"'(])/).filter((s) => s.trim()).length;
}

describe('content integrity', () => {
  it('has ten zones and between 5 and 7 levels in each, about thirty-five in all', () => {
    expect(ZONES.length).toBe(10);
    for (const z of ZONES) expect(z.levelIds.length).toBeGreaterThanOrEqual(5), expect(z.levelIds.length).toBeLessThanOrEqual(7);
    expect(ALL_LEVELS.length).toBeGreaterThanOrEqual(28);
  });
  it('every zone has a named badge for clearing it and for its challenges', async () => {
    const { BADGES } = await import('../src/engine/progress');
    const ids = new Set(BADGES.map((b) => b.id));
    for (const z of ZONES) {
      expect(ids.has(`zone-${z.id}`), z.id).toBe(true);
      expect(ids.has(`challenge-${z.id}`), z.id).toBe(true);
    }
  });
  it('every zone level exists, is in exactly one zone and the ids are unique', () => {
    const ids = ZONES.flatMap((z) => z.levelIds);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(ALL_LEVELS.map((l) => l.id).sort());
    for (const z of ZONES) for (const id of z.levelIds) expect(LEVEL_BY_ID[id]?.zone).toBe(z.id);
  });
  for (const l of ALL_LEVELS) {
    describe(l.id, () => {
      it('has a goal, an instruction of at most two sentences, and a real-world name', () => {
        expect(l.goal.length).toBeGreaterThan(10);
        expect(sentences(l.instruction)).toBeGreaterThanOrEqual(1);
        expect(sentences(l.instruction)).toBeLessThanOrEqual(2);
        expect(l.realName).toBeTruthy();
        expect(l.didWhat).toBeTruthy();
      });
      it('has at least one Show me step and at least one success check', () => {
        expect(l.showMe.length).toBeGreaterThanOrEqual(1);
        expect(l.checks.length).toBeGreaterThanOrEqual(1);
        expect(new Set(l.checks.map((c) => c.id)).size).toBe(l.checks.length);
      });
      it('links only to codex entries and evidence that exist', () => {
        for (const c of l.codex) expect(CODEX_BY_ID[c], c).toBeTruthy();
        for (const e of l.evidence ?? []) expect(EVIDENCE_BY_ID[e], e).toBeTruthy();
        for (const m of l.instruction.matchAll(/\[\[([\w-]+)\|/g)) expect(CODEX_BY_ID[m[1]!], m[1]).toBeTruthy();
      });
      it('its success check covers exactly the listed checks', () => {
        const ids = l.checks.map((c) => c.id).sort();
        if (l.kind === 'wire') {
          expect(Object.keys(l.evaluate({ exchanges: [], forwarded: [], console: [], jar: [] })).sort()).toEqual(ids);
          expect(SERVERS[l.server]).toBeTruthy();
        }
        if (l.kind === 'terminal') expect(Object.keys(evaluateTerminal(l, [], [])).sort()).toEqual(ids);
        if (l.kind === 'capture') expect(l.goals.map((g) => g.id).sort()).toEqual(ids);
        if (l.kind === 'arena') {
          expect(ids).toEqual(['blocked', 'found', 'works']);
          expect(ARENA_APPS[l.app]).toBeTruthy();
        }
      });
    });
  }
  it('every codex entry has a one-line definition and is unlocked by some level', () => {
    const unlocked = new Set(ALL_LEVELS.flatMap((l) => l.codex));
    for (const c of CODEX) {
      expect(c.short.length, c.id).toBeGreaterThan(20);
      expect(unlocked.has(c.id), c.id).toBe(true);
    }
  });
  it('no level text shows a literal attack string', () => {
    const text = JSON.stringify(ALL_LEVELS.map((l) => [l.instruction, l.goal, l.showMe.map((s) => s.say), l.checks.map((c) => [c.label, c.do, c.learned, c.hint ?? ''])]));
    expect(text).not.toMatch(/OR 1=1|onerror=|<script|\/etc\/passwd/i);
  });
  it('no arcade text shows a literal attack string either', () => {
    const text = JSON.stringify([ARCADE, FORGERY_PAIRS, ATTACKS, FIXES, PUZZLES, FINDINGS, SERVICES]);
    expect(text).not.toMatch(/OR 1=1|onerror=|<script|\/etc\/passwd|UNION SELECT|\.\.\/|;\s*rm |\$\(|169\.254\.169\.254|' OR '|--\s*$/im);
    expect(text.length).toBeGreaterThan(5000);
  });
});
