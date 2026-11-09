import type { Level } from './types';
import { WIRE_LEVELS } from './levels/wire';
import { ARENA_LEVELS } from './levels/arena';
import { PERIMETER_LEVELS } from './levels/perimeter';
import { CLOUD_LEVELS } from './levels/cloud';
import { REPORT_LEVELS } from './levels/report';

export { ZONES, ZONE_BY_ID } from './zones';
export { CODEX, CODEX_BY_ID } from './codex';
export { EVIDENCE, EVIDENCE_BY_ID } from './evidence';
export type * from './types';

export const ALL_LEVELS: Level[] = [...WIRE_LEVELS, ...ARENA_LEVELS, ...PERIMETER_LEVELS, ...CLOUD_LEVELS, ...REPORT_LEVELS];

export const LEVEL_BY_ID = Object.fromEntries(ALL_LEVELS.map((l) => [l.id, l])) as Record<string, Level>;
