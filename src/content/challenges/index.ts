import { makeRng } from '../../engine/rng';
import type { ChallengeGenerator, ChallengeVariant } from './types';
import { BASICS_CHALLENGES } from './basics';
import { WIRE_CHALLENGES } from './wire';
import { CAPTURE_CHALLENGES } from './capture';
import { ARENA_CHALLENGES } from './arena';
import { PERIMETER_CHALLENGES } from './perimeter';
import { CLOUD_CHALLENGES } from './cloud';
import { REPORT_CHALLENGES } from './report';
import { SCANNER_CHALLENGES } from './scanner';

export type { ChallengeVariant, ChallengeGenerator, Solution } from './types';
export { START_POINTS, HINT_COST } from './types';

/** Every level's challenge: a generator that takes a seeded RNG and returns a variant. */
export const CHALLENGES: Record<string, ChallengeGenerator> = {
  ...BASICS_CHALLENGES,
  ...WIRE_CHALLENGES,
  ...CAPTURE_CHALLENGES,
  ...ARENA_CHALLENGES,
  ...PERIMETER_CHALLENGES,
  ...CLOUD_CHALLENGES,
  ...REPORT_CHALLENGES,
  ...SCANNER_CHALLENGES,
};

/** The variant a seed gives for a level, or null when the level has no challenge. */
export function generateChallenge(levelId: string, seed: number): ChallengeVariant | null {
  const gen = CHALLENGES[levelId];
  if (!gen) return null;
  const v = gen(makeRng(seed));
  return { ...v, level: { ...v.level, id: levelId } };
}
