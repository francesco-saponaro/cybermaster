// The shapes every mission, zone, briefing and codex entry follows. The engine
// renders from these; the content files only fill them in.

export type ZoneId = 'wire' | 'arena' | 'perimeter' | 'cloud' | 'report';

/** A concept id: the smallest thing the game teaches in a briefing and then tests in a mission. */
export type ConceptId = string;

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

/** A mistake made during a mission, shown in the debrief with the right answer. */
export interface Mistake {
  concept: ConceptId;
  what: string;
  why: string;
  correct: string;
}

/** What a mission hands back when it ends. */
export interface MissionResult {
  score: number;
  mistakes: Mistake[];
}

// ---- Briefings -------------------------------------------------------------

export type Party = 'browser' | 'server' | 'attacker';

/** What the mentor puts in front of you during a beat. */
export type BeatMaterial =
  | { kind: 'lines'; title: string; lines: string[] }
  | { kind: 'cards'; cards: { id: string; title: string; lines: string[] }[] }
  | { kind: 'flow'; messages: { from: Party; to: Party; text: string }[] };

/** The one action a beat asks for. Every beat needs one; there is no "next" button. */
export type BeatAction =
  | { kind: 'tap-line'; line: number }
  | { kind: 'tap-token'; line: number; token: string }
  | { kind: 'tap-card'; card: string }
  | { kind: 'tap-message'; index: number }
  | { kind: 'choose'; options: string[]; answer: number };

export interface BriefingBeat {
  id: string;
  concepts: ConceptId[];
  say: string;
  material: BeatMaterial;
  action: BeatAction;
  then: string;
  wrong?: string;
  codex?: string;
}

export interface Briefing {
  missionId: string;
  mentor: string;
  beats: BriefingBeat[];
}

// ---- Missions --------------------------------------------------------------

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
  targets: { line: number; reason: string; concept: ConceptId }[];
}
export interface InspectMission extends MissionBase {
  kind: 'inspect';
  docs: InspectDoc[];
  seconds: number;
  hint: string;
}

/** Intercept: requests and responses stream through your proxy; catch the bad ones. */
export interface Packet {
  id: string;
  dir: 'request' | 'response' | 'log';
  title: string;
  lines: string[];
  bad: boolean;
  badLine?: number;
  concept: ConceptId;
  reason: string;
}
export interface InterceptMission extends MissionBase {
  kind: 'intercept';
  packets: Packet[];
  missLimit: number;
  pace: { start: number; end: number };
}

/** Login Lab as a live session: messages play out, you freeze the one that goes wrong, then pick the fix. */
export interface LiveRound {
  id: string;
  concept: ConceptId;
  title: string;
  messages: { from: Party; to: Party; text: string }[];
  wrongAt: number;
  fix: string;
  explain: string;
}
export interface LiveMission extends MissionBase {
  kind: 'live';
  rounds: LiveRound[];
  fixes: { id: string; label: string }[];
  secondsPerMessage: number;
}

/** Matching missions: put the right fix on each bug. */
export interface MatchMission extends MissionBase {
  kind: 'match';
  bugLabel: string;
  fixLabel: string;
  bugs: { id: string; text: string; fix: string; explain: string; concept: ConceptId }[];
  fixes: { id: string; label: string }[];
  seconds: number;
}

/** Card sort: one card at a time, four answers, a clock and a streak. */
export interface CardsMission extends MissionBase {
  kind: 'cards';
  promptLabel: string;
  answerLabel: string;
  cards: { id: string; text: string; answer: string; explain: string; concept: ConceptId }[];
  answers: { id: string; label: string }[];
  secondsPerCard: number;
}

/** OWASP Arena: enemies labelled with attacks, neutralised by the right defence. */
export interface ArenaMission extends MissionBase {
  kind: 'arena';
  defences: { id: string; label: string; key: string }[];
  waves: { attack: string; defence: string; explain: string; concept: ConceptId }[][];
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
  concept: ConceptId;
  secondQuestion?: { prompt: string; options: string[]; answer: number; explain: string; concept: ConceptId };
}

/** CVSS Forge: set the eight base metrics to match the description. */
export interface CvssMission extends MissionBase {
  kind: 'cvss';
  cases: { title: string; description: string; vector: string; explain: string; concept: ConceptId }[];
}

/** Scanner vs Analyst: a stream of scanner findings with evidence to judge. */
export type Verdict = 'true' | 'false' | 'validate';
export interface TriageMission extends MissionBase {
  kind: 'triage';
  items: { tool: string; title: string; scannerSays: string; evidence: string[]; answer: Verdict; explain: string; concept: ConceptId }[];
  secondsPerItem: number;
}

/** A resource with a config to judge: used by Cloud Watch (audit) and Cookie Jar (sort). */
export interface AuditResource {
  id: string;
  name: string;
  type: string;
  config: string[];
  exposed: boolean;
  reasons: string[];
  answer: number;
  explain: string;
  concept: ConceptId;
}
export interface AuditMission extends MissionBase {
  kind: 'audit';
  okLabel: string;
  badLabel: string;
  resources: AuditResource[];
}

/** Cookie Jar: the same judgement, under time, one card sliding in after another. */
export interface SortMission extends MissionBase {
  kind: 'sort';
  okLabel: string;
  badLabel: string;
  items: AuditResource[];
  secondsPerItem: number;
}

/** API Gate: change ids in a request, see what leaks, then fix the check. */
export interface ApiMission extends MissionBase {
  kind: 'api';
  request: { method: string; path: string; headers: string[] };
  you: { id: string; label: string };
  ids: { id: string; owner: string; response: string[]; leaks: boolean }[];
  fixOptions: { code: string[]; correct: boolean; explain: string }[];
  concept: ConceptId;
  fixConcept: ConceptId;
}

/** Six Phases: put the phases in order, then drop each activity on its phase. */
export interface OrderMission extends MissionBase {
  kind: 'order';
  phases: { id: string; name: string; result: string }[];
  activities: { text: string; phase: string }[];
  seconds: number;
  concept: ConceptId;
}

/** The Report: assemble a finding from fragments, one per field. */
export interface ReportMission extends MissionBase {
  kind: 'report';
  scenario: string[];
  fields: {
    name: string;
    concept: ConceptId;
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
  | InterceptMission
  | LiveMission
  | MatchMission
  | CardsMission
  | ArenaMission
  | SweepMission
  | CvssMission
  | TriageMission
  | AuditMission
  | SortMission
  | ApiMission
  | OrderMission
  | ReportMission
  | BossMission;

export type MissionKind = Mission['kind'];
