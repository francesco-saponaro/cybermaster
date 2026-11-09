// Live incidents for the boss levels: an attacker moves through four stages on
// a timer. Each correct step pushes them back and freezes them for a moment;
// each mistake makes them a little faster. Reaching 100 is the breach.
// Pure: the level shell feeds it ticks and events.

export const STAGES = ['Recon', 'Foothold', 'Access', 'Exfiltration'] as const;

export type IncidentPace = 'gentle' | 'normal' | 'harsh';

export interface IncidentConfig {
  /** Seconds from 0 to breach at the starting speed, with no interference. */
  breachSeconds: number;
  /** Progress points a correct step takes back, and seconds it freezes the attacker. */
  pushBack: number;
  freeze: number;
  /** Speed multiplier per mistake, and its ceiling. */
  speedUp: number;
  maxSpeed: number;
  /** Records the attacker leaves with on a breach. */
  records: number;
  /** Where the attacker starts. */
  start: number;
}

export function incidentConfig(pace: IncidentPace, par: number, records: number): IncidentConfig {
  const scale = pace === 'gentle' ? 2.6 : pace === 'normal' ? 1.8 : 1.25;
  return {
    breachSeconds: Math.max(pace === 'gentle' ? 300 : 120, Math.round(par * scale)),
    pushBack: pace === 'harsh' ? 10 : 14,
    freeze: pace === 'gentle' ? 8 : pace === 'normal' ? 6 : 4,
    speedUp: pace === 'harsh' ? 1.15 : 1.08,
    maxSpeed: pace === 'harsh' ? 1.8 : 1.5,
    records,
    start: pace === 'gentle' ? 0 : 6,
  };
}

export interface Incident {
  progress: number;
  speed: number;
  frozen: number;
  elapsed: number;
  status: 'running' | 'contained' | 'breached';
  /** The highest stage reached, so a stage change can sound once. */
  peak: number;
}

export type IncidentAction = { t: 'tick'; dt: number } | { t: 'correct' } | { t: 'wrong' } | { t: 'contain' };

export function startIncident(cfg: IncidentConfig): Incident {
  return { progress: cfg.start, speed: 1, frozen: 0, elapsed: 0, status: 'running', peak: stageOf(cfg.start) };
}

export function stageOf(progress: number): number {
  return Math.min(STAGES.length - 1, Math.floor(Math.max(0, progress) / 25));
}

/** Records out of the door: none until exfiltration starts, all of them at breach. */
export function recordsTaken(progress: number, records: number): number {
  if (progress <= 75) return 0;
  return Math.min(records, Math.floor(((Math.min(100, progress) - 75) / 25) * records));
}

/** Seconds to breach at the current speed, counting the freeze. */
export function secondsLeft(s: Incident, cfg: IncidentConfig): number {
  const perSecond = (100 / cfg.breachSeconds) * s.speed;
  return Math.max(0, Math.ceil((100 - s.progress) / perSecond + s.frozen));
}

export function incidentStep(s: Incident, a: IncidentAction, cfg: IncidentConfig): Incident {
  if (s.status !== 'running') return s;
  switch (a.t) {
    case 'tick': {
      const dt = Math.max(0, a.dt);
      const thawed = Math.max(0, dt - s.frozen);
      const progress = Math.min(100, s.progress + (100 / cfg.breachSeconds) * s.speed * thawed);
      const status = progress >= 100 ? 'breached' : 'running';
      return { ...s, progress, frozen: Math.max(0, s.frozen - dt), elapsed: s.elapsed + dt, status, peak: Math.max(s.peak, stageOf(progress)) };
    }
    case 'correct':
      return { ...s, progress: Math.max(0, s.progress - cfg.pushBack), frozen: cfg.freeze };
    case 'wrong':
      return { ...s, speed: Math.min(cfg.maxSpeed, s.speed * cfg.speedUp) };
    case 'contain':
      return { ...s, status: 'contained', frozen: 0 };
  }
}
