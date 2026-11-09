import { describe, it, expect } from 'vitest';
import { ALL_LEVELS, CODEX_BY_ID } from '../src/content/index';
import { plain } from '../src/game/Rich';

// Every level is a list of numbered steps. A beginner should never be left
// with a goal and no idea what to press, so every step, the first one
// included, says exactly what to do and, once done, what it taught.

const sentences = (text: string) => plain(text).split(/(?<=[.!?])\s+(?=[A-Z"'(])/).filter((s) => s.trim()).length;

describe('steps', () => {
  for (const l of ALL_LEVELS) {
    describe(l.id, () => {
      it('every step says what to do, with something exact to type, click or look for', () => {
        for (const c of l.checks) {
          expect(c.label.trim().length, `${l.id}:${c.id} label`).toBeGreaterThan(2);
          expect(c.do?.trim().length ?? 0, `${l.id}:${c.id} do`).toBeGreaterThan(20);
          expect(c.do, `${l.id}:${c.id} names nothing in code style`).toMatch(/`[^`]+`/);
        }
      });
      it('every step teaches one line once it is done', () => {
        for (const c of l.checks) {
          expect(c.learned?.trim().length ?? 0, `${l.id}:${c.id} learned`).toBeGreaterThan(20);
          expect(sentences(c.learned), `${l.id}:${c.id} learned is one sentence`).toBe(1);
        }
      });
      it('links in the steps go to codex entries that exist', () => {
        for (const c of l.checks) {
          for (const m of `${c.do} ${c.learned}`.matchAll(/\[\[([\w-]+)\|/g)) expect(CODEX_BY_ID[m[1]!], m[1]).toBeTruthy();
        }
      });
      it('the instruction is at most two sentences and gives more than the goal', () => {
        expect(sentences(l.instruction)).toBeLessThanOrEqual(2);
        expect(plain(l.instruction).length).toBeGreaterThan(80);
      });
    });
  }

  it('no level text uses an em dash', () => {
    const text = JSON.stringify(ALL_LEVELS.map((l) => [l.goal, l.instruction, l.checks, l.showMe.map((s) => s.say)]));
    expect(text).not.toMatch(/\u2014/);
  });
});
