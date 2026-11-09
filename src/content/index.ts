import type { Mission } from './types';
import { WIRE_MISSIONS } from './missions/wire';
import { ARENA_MISSIONS } from './missions/arena';
import { PERIMETER_MISSIONS } from './missions/perimeter';
import { CLOUD_MISSIONS } from './missions/cloud';
import { REPORT_MISSIONS } from './missions/report';

export { ZONES, ZONE_BY_ID } from './zones';
export { CODEX, CODEX_BY_ID } from './codex';
export { BRIEFINGS, BRIEFING_BY_MISSION, PROLOGUE } from './briefings';
export { CONCEPTS, conceptsTested, conceptsTaught, teachingOrder } from './concepts';
export type * from './types';

export const ALL_MISSIONS: Mission[] = [
  ...WIRE_MISSIONS,
  ...ARENA_MISSIONS,
  ...PERIMETER_MISSIONS,
  ...CLOUD_MISSIONS,
  ...REPORT_MISSIONS,
];

export const MISSION_BY_ID = Object.fromEntries(ALL_MISSIONS.map((m) => [m.id, m])) as Record<string, Mission>;

/** The missions that appear on a zone board (not the hidden boss stages). */
export function playableMissions(): Mission[] {
  return ALL_MISSIONS.filter((m) => !m.id.startsWith('stage-'));
}
