// The shapes every mission, zone and codex entry follows. The engine renders
// from these; the content files only fill them in.

export type ZoneId = 'wire' | 'arena' | 'perimeter' | 'cloud' | 'report';

export interface Zone {
  id: ZoneId;
  name: string;
  tagline: string;
  intro: string[];
  missionIds: string[];
  bossId: string;
}

export interface CodexEntry {
  id: string;
  title: string;
  zone: ZoneId;
  body: string[];
}

interface MissionBase {
  id: string;
  zone: ZoneId;
  title: string;
  brief: string;
  objective: string;
  minutes: number;
  xp: number;
  codex: string[];
  debrief: string;
}

/** Packet Inspector: raw text with lines to flag. Several documents in a row. */
export interface InspectDoc {
  name: string;
  lines: string[];
  targets: { line: number; reason: string }[];
}
export interface InspectMission extends MissionBase {
  kind: 'inspect';
  docs: InspectDoc[];
  seconds: number;
  hint: string;
}

/** Login Lab and the other matching missions: put the right fix on each bug. */
export interface MatchMission extends MissionBase {
  kind: 'match';
  bugLabel: string;
  fixLabel: string;
  bugs: { id: string; text: string; fix: string; explain: string }[];
  fixes: { id: string; label: string }[];
  seconds: number;
}

/** OWASP Arena: enemies labelled with attacks, neutralised by the right defence. */
export interface ArenaMission extends MissionBase {
  kind: 'arena';
  defences: { id: string; label: string; key: string }[];
  waves: { attack: string; defence: string; explain: string }[][];
  lives: number;
}

/** Port Sweep: scan a host, read the output, pick the risky service. */
export interface SweepMission extends MissionBase {
  kind: 'sweep';
  host: string;
  ports: { port: number; proto: 'tcp' | 'udp'; service: string; version: string; note: string }[];
  question: string;
  answer: number;
  explain: string;
  secondQuestion?: { prompt: string; options: string[]; answer: number; explain: string };
}

/** CVSS Forge: set the eight base metrics to match the description. */
export interface CvssMission extends MissionBase {
  kind: 'cvss';
  cases: { title: string; description: string; vector: string; explain: string }[];
}

/** Scanner vs Analyst: a stream of scanner findings with evidence to judge. */
export type Verdict = 'true' | 'false' | 'validate';
export interface TriageMission extends MissionBase {
  kind: 'triage';
  items: { tool: string; title: string; scannerSays: string; evidence: string[]; answer: Verdict; explain: string }[];
  secondsPerItem: number;
}

/** Cloud Watch: resources with a config; mark the exposed ones and say why. */
export interface AuditMission extends MissionBase {
  kind: 'audit';
  okLabel: string;
  badLabel: string;
  resources: {
    id: string;
    name: string;
    type: string;
    config: string[];
    exposed: boolean;
    reasons: string[];
    answer: number;
    explain: string;
  }[];
}

/** API Gate: change ids in a request, see what leaks, then fix the check. */
export interface ApiMission extends MissionBase {
  kind: 'api';
  request: { method: string; path: string; headers: string[] };
  you: { id: string; label: string };
  ids: { id: string; owner: string; response: string[]; leaks: boolean }[];
  fixOptions: { code: string[]; correct: boolean; explain: string }[];
}

/** Six Phases: put the phases in order, then drop each activity on its phase. */
export interface OrderMission extends MissionBase {
  kind: 'order';
  phases: { id: string; name: string; result: string }[];
  activities: { text: string; phase: string }[];
  seconds: number;
}

/** The Report: assemble a finding from fragments, one per field. */
export interface ReportMission extends MissionBase {
  kind: 'report';
  scenario: string[];
  fields: {
    name: string;
    options: { text: string; quality: 'good' | 'weak' | 'wrong'; note: string }[];
  }[];
}

/** A boss runs several stages in a row and combines their scores. */
export interface BossMission extends MissionBase {
  kind: 'boss';
  stages: string[];
}

export type Mission =
  | InspectMission
  | MatchMission
  | ArenaMission
  | SweepMission
  | CvssMission
  | TriageMission
  | AuditMission
  | ApiMission
  | OrderMission
  | ReportMission
  | BossMission;

export type MissionKind = Mission['kind'];
