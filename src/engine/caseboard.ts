// The case board: what the player has proved so far, from the save alone.

import type { SaveFile } from './save';
import { PINS, REMARKS, TIMELINE, type Line } from '../content/story';

export interface ZoneLevels {
  id: string;
  name: string;
  levelIds: string[];
}

export interface Pin {
  levelId: string;
  zone: string;
  title: string;
  proved: string;
  found: boolean;
}

export interface Moment {
  time: string;
  text: string;
  found: boolean;
}

export interface CaseBoard {
  pins: Pin[];
  timeline: Moment[];
  found: number;
  total: number;
  /** Every level of the last zone is cleared: the case can be closed. */
  solved: boolean;
  closed: boolean;
}

const cleared = (save: SaveFile, id: string) => (save.levels[id]?.stars ?? 0) >= 1;

export function caseBoard(save: SaveFile, zones: ZoneLevels[]): CaseBoard {
  const pins: Pin[] = zones.flatMap((z) =>
    z.levelIds.map((id) => ({ levelId: id, zone: z.id, title: PINS[id]?.title ?? id, proved: PINS[id]?.proved ?? '', found: cleared(save, id) })),
  );
  const timeline = TIMELINE.map((t) => ({ time: t.time, text: t.text, found: !t.levelId || cleared(save, t.levelId) }));
  const last = zones[zones.length - 1];
  return {
    pins,
    timeline,
    found: pins.filter((p) => p.found).length,
    total: pins.length,
    solved: !!last && last.levelIds.every((id) => cleared(save, id)),
    closed: save.story.closed,
  };
}

/** A teammate's line for the level header, once whatever it refers to has been found. */
export function remarkFor(levelId: string, save: SaveFile): Line | null {
  const r = REMARKS[levelId];
  if (!r) return null;
  if (r.needs && !cleared(save, r.needs)) return null;
  return { who: r.who, text: r.text };
}
