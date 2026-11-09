import type { Briefing } from '../types';
import { WIRE_BRIEFINGS } from './wire';
import { ARENA_BRIEFINGS } from './arena';
import { PERIMETER_BRIEFINGS } from './perimeter';
import { CLOUD_BRIEFINGS } from './cloud';
import { REPORT_BRIEFINGS } from './report';

export { PROLOGUE } from './prologue';

export const BRIEFINGS: Briefing[] = [
  ...WIRE_BRIEFINGS,
  ...ARENA_BRIEFINGS,
  ...PERIMETER_BRIEFINGS,
  ...CLOUD_BRIEFINGS,
  ...REPORT_BRIEFINGS,
];

export const BRIEFING_BY_MISSION = Object.fromEntries(BRIEFINGS.map((b) => [b.missionId, b])) as Record<string, Briefing>;
