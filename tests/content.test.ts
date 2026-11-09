import { describe, it, expect } from 'vitest';
import { ALL_LEVELS, LEVEL_BY_ID, ZONES, CODEX, CODEX_BY_ID, EVIDENCE_BY_ID } from '../src/content/index';
import { plain } from '../src/game/Rich';
import { ARENA_APPS } from '../src/sim/arena';
import { evaluateTerminal } from '../src/game/evaluate';
import { SERVERS } from '../src/sim/wire';

function sentences(text: string): number {
  return plain(text).split(/(?<=[.!?])\s+(?=[A-Z"'(])/).filter((s) => s.trim()).length;
}

describe('content integrity', () => {
  it('has five zones and between 5 and 7 levels in each, about thirty in all', () => {
    expect(ZONES.length).toBe(5);
    for (const z of ZONES) expect(z.levelIds.length).toBeGreaterThanOrEqual(5), expect(z.levelIds.length).toBeLessThanOrEqual(7);
    expect(ALL_LEVELS.length).toBeGreaterThanOrEqual(28);
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
    const text = JSON.stringify(ALL_LEVELS.map((l) => [l.instruction, l.goal, l.showMe.map((s) => s.say)]));
    expect(text).not.toMatch(/OR 1=1|onerror=|<script|\/etc\/passwd/i);
  });
});
