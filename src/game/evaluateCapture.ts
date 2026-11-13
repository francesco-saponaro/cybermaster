import type { CaptureLevel } from '../content/types';
import { applyFilter, shownKey, type CaptureState } from '../sim/pcap';

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^"|"$/g, '');

/** Is an answer right for this capture level, and if not, what to say. */
export function judgeCapture(level: CaptureLevel, answer: string): { correct: boolean; reason: string } {
  const a = norm(answer);
  if (level.goals.some((g) => g.answers?.some((x) => norm(x) === a))) return { correct: true, reason: '' };
  const w = level.wrong.find((x) => x.answers.some((y) => norm(y) === a));
  return { correct: false, reason: w ? w.reason : level.otherwise };
}

/** Each goal of a capture level, from what the player has done in the capture. */
export function evaluateCapture(level: CaptureLevel, s: CaptureState): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const g of level.goals) {
    let pass = false;
    if (g.shows) {
      const want = shownKey(level.packets, g.shows);
      pass = want !== null && s.applied.some((a) => a.shown.join(',') === want);
    }
    if (g.selectWhere) {
      const r = applyFilter(level.packets, g.selectWhere);
      const ok = new Set(r.ok ? r.shown.map((p) => p.no) : []);
      pass = pass || s.selectedEver.some((n) => ok.has(n));
    }
    if (g.follow !== undefined) pass = pass || s.followed.includes(g.follow);
    if (g.stats) pass = pass || s.stats;
    if (g.answers) pass = pass || s.answers.some((x) => g.answers!.some((y) => norm(y) === norm(x)));
    out[g.id] = pass;
  }
  return out;
}
