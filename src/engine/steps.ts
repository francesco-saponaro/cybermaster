// The step engine behind every briefing: a beat shows material, waits for one
// action, and moves on only when the action matches. Pure, so the Briefing
// component is a thin view over it and the behaviour is tested here.

import type { BeatAction, Briefing } from '../content/types';

export type BeatInput =
  | { kind: 'line'; line: number }
  | { kind: 'token'; line: number; token: string }
  | { kind: 'card'; card: string }
  | { kind: 'message'; index: number }
  | { kind: 'choice'; index: number };

export interface StepState {
  index: number;
  tries: number;
  done: boolean;
  wrong: boolean;
  revealed: string[];
}

export function startSteps(): StepState {
  return { index: 0, tries: 0, done: false, wrong: false, revealed: [] };
}

/** Does this input satisfy the beat's action? */
export function matches(action: BeatAction, input: BeatInput): boolean {
  switch (action.kind) {
    case 'tap-line':
      return input.kind === 'line' && input.line === action.line;
    case 'tap-token':
      return input.kind === 'token' && input.line === action.line && input.token === action.token;
    case 'tap-card':
      return input.kind === 'card' && input.card === action.card;
    case 'tap-message':
      return input.kind === 'message' && input.index === action.index;
    case 'choose':
      return input.kind === 'choice' && input.index === action.answer;
    default:
      return false;
  }
}

/** Apply one input to the briefing. A right action advances; a wrong one is counted and flagged. */
export function attempt(briefing: Briefing, state: StepState, input: BeatInput): { state: StepState; ok: boolean } {
  if (state.done) return { state, ok: false };
  const beat = briefing.beats[state.index];
  if (!beat) return { state: { ...state, done: true }, ok: false };
  if (!matches(beat.action, input)) {
    return { state: { ...state, tries: state.tries + 1, wrong: true }, ok: false };
  }
  const index = state.index + 1;
  const revealed = beat.codex && !state.revealed.includes(beat.codex) ? [...state.revealed, beat.codex] : state.revealed;
  return { state: { index, tries: 0, done: index >= briefing.beats.length, wrong: false, revealed }, ok: true };
}

/** Split a raw line into the pieces a player can tap. Joining them back gives the line. */
export function tokensOf(line: string): string[] {
  // keep separators as their own tokens so nothing is lost on display
  return line.split(/(\s+|;|,|=|\?|&)/).filter((t) => t.length > 0);
}
