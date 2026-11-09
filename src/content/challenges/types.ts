import type { Level, LevelCheck, WireAct, CloudAct, ReportAct } from '../types';
import type { Rng } from '../../engine/rng';
import type { SgRule, Verdict } from '../../sim/cloud';

/**
 * How a variant is solved, for the tests that clear every generator across
 * many seeds with the simulations. Never shown to the player.
 */
export type Solution =
  | { kind: 'wire'; moves: WireMove[] }
  | { kind: 'arena'; fix: string }
  | { kind: 'terminal'; commands: string[] }
  | { kind: 'cloud'; text?: string; bpa?: boolean; rules?: SgRule[]; keyOps?: CloudAct['keyOp'][]; verdicts?: Record<string, Verdict> }
  | { kind: 'report'; act: ReportAct[] };

export type WireMove = WireAct | { held: (text: string) => string };

/** One generated challenge: a playable level of the same kind, its graded hints and how it is solved. */
export interface ChallengeVariant<L extends Level = Level> {
  level: L;
  /** Two or three hints, from a nudge to nearly the answer. */
  hints: string[];
  solution: Solution;
  /** The values that make this variant what it is, for the tests that check variants differ. */
  signature: string;
}

export type ChallengeGenerator = (rng: Rng) => ChallengeVariant;

export { START_POINTS, HINT_COST } from '../../engine/scoring';

/**
 * Make a challenge level from the guided one: same sandbox and checks, the
 * steps' words emptied (the challenge shows only the goal and the brief).
 */
export function asChallenge<L extends Level>(guided: L, over: Partial<L> & { goal: string; instruction: string }, checks?: LevelCheck[]): L {
  const base = (checks ?? guided.checks).map((c) => ({ ...c, do: '', hint: undefined }));
  return {
    ...guided,
    ...over,
    challenge: true,
    checks: base,
    showMe: [],
    stepsTogether: false,
    par: over.par ?? Math.round(guided.par * 0.9),
  };
}

export const CUSTOMERS = [
  { user: 'mara', name: 'Mara Okafor' },
  { user: 'lena', name: 'Lena Duval' },
  { user: 'omar', name: 'Omar Haddad' },
  { user: 'jules', name: 'Jules Arnaud' },
  { user: 'ana', name: 'Ana Ribeiro' },
  { user: 'kofi', name: 'Kofi Mensah' },
];

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
