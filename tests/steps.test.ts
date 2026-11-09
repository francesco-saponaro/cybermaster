import { describe, it, expect } from 'vitest';
import { startSteps, attempt, matches, tokensOf } from '../src/engine/steps';
import type { Briefing, BriefingBeat } from '../src/content/types';

const lines: BriefingBeat = {
  id: 'b1',
  concepts: ['cookie-flags'],
  say: 'Tap the Set-Cookie line.',
  material: { kind: 'lines', title: 'Response', lines: ['HTTP/1.1 200 OK', 'Set-Cookie: sid=1; Path=/'] },
  action: { kind: 'tap-line', line: 1 },
  then: 'Right.',
};
const token: BriefingBeat = {
  id: 'b2',
  concepts: ['cookie-flags'],
  say: 'Tap the flag.',
  material: { kind: 'lines', title: 'Response', lines: ['Set-Cookie: sid=1; Path=/; HttpOnly; Secure'] },
  action: { kind: 'tap-token', line: 0, token: 'HttpOnly' },
  then: 'That is the one.',
  codex: 'cookie-flags',
};
const choice: BriefingBeat = {
  id: 'b3',
  concepts: ['version-disclosure'],
  say: 'Which header gives the version away?',
  material: { kind: 'lines', title: 'Response', lines: ['Server: Apache/2.4.49'] },
  action: { kind: 'choose', options: ['Server', 'Date'], answer: 0 },
  then: 'Yes.',
};
const briefing: Briefing = { missionId: 'x', mentor: 'Ines', beats: [lines, token, choice] };

describe('step engine: matching an action', () => {
  it('matches a tapped line by index', () => {
    expect(matches(lines.action, { kind: 'line', line: 1 })).toBe(true);
    expect(matches(lines.action, { kind: 'line', line: 0 })).toBe(false);
  });

  it('matches a tapped token by line and text', () => {
    expect(matches(token.action, { kind: 'token', line: 0, token: 'HttpOnly' })).toBe(true);
    expect(matches(token.action, { kind: 'token', line: 0, token: 'Secure' })).toBe(false);
    expect(matches(token.action, { kind: 'token', line: 1, token: 'HttpOnly' })).toBe(false);
  });

  it('matches a choice, a card and a message', () => {
    expect(matches(choice.action, { kind: 'choice', index: 0 })).toBe(true);
    expect(matches(choice.action, { kind: 'choice', index: 1 })).toBe(false);
    expect(matches({ kind: 'tap-card', card: 'c2' }, { kind: 'card', card: 'c2' })).toBe(true);
    expect(matches({ kind: 'tap-message', index: 3 }, { kind: 'message', index: 2 })).toBe(false);
  });

  it('never matches an input of the wrong kind', () => {
    expect(matches(lines.action, { kind: 'choice', index: 1 })).toBe(false);
    expect(matches(choice.action, { kind: 'line', line: 0 })).toBe(false);
  });
});

describe('step engine: walking a briefing', () => {
  it('starts on the first beat, with nothing done', () => {
    const s = startSteps();
    expect(s).toEqual({ index: 0, tries: 0, done: false, wrong: false, revealed: [] });
  });

  it('a right action moves to the next beat and reveals its codex entry', () => {
    let s = startSteps();
    s = attempt(briefing, s, { kind: 'line', line: 1 }).state;
    expect(s.index).toBe(1);
    expect(s.wrong).toBe(false);
    const r = attempt(briefing, s, { kind: 'token', line: 0, token: 'HttpOnly' });
    expect(r.ok).toBe(true);
    expect(r.state.index).toBe(2);
    expect(r.state.revealed).toEqual(['cookie-flags']);
  });

  it('a wrong action stays on the beat, counts the try and flags it', () => {
    const s = startSteps();
    const r = attempt(briefing, s, { kind: 'line', line: 0 });
    expect(r.ok).toBe(false);
    expect(r.state.index).toBe(0);
    expect(r.state.tries).toBe(1);
    expect(r.state.wrong).toBe(true);
  });

  it('finishes after the last beat', () => {
    let s = startSteps();
    s = attempt(briefing, s, { kind: 'line', line: 1 }).state;
    s = attempt(briefing, s, { kind: 'token', line: 0, token: 'HttpOnly' }).state;
    s = attempt(briefing, s, { kind: 'choice', index: 0 }).state;
    expect(s.done).toBe(true);
    expect(s.index).toBe(3);
    // further input is ignored
    expect(attempt(briefing, s, { kind: 'choice', index: 0 }).state).toEqual(s);
  });

  it('splits a raw line into tappable tokens without losing text', () => {
    const t = tokensOf('Set-Cookie: sid=1; Path=/; HttpOnly; Secure');
    expect(t).toContain('HttpOnly');
    expect(t).toContain('Secure');
    expect(t.join('')).toBe('Set-Cookie: sid=1; Path=/; HttpOnly; Secure');
  });
});
