// The shapes every zone, level, codex entry and piece of evidence follows. A
// level is data: the sandbox it runs in, what the player is told, the checks
// that turn green, and the "Show me" steps that act on the sandbox.

import type { HttpRequest, HttpResponse, StoredCookie } from '../sim/http';
import type { WireServerId, WireParams } from '../sim/wire';
import type { ArenaAppId, ArenaApp } from '../sim/arena';
import type { Network } from '../sim/terminal';
import type { SgRule, ScanFinding, Verdict, BucketSetup, IamSetup, SgSetup, KeySetup, GatewaySetup } from '../sim/cloud';
import type { Artifact, FindingDraft, FindingSpec } from '../sim/report';
import type { Vector } from '../engine/cvss';
import type { GvmAction, GvmSetup, GvmState, Tab as ScanTab } from '../sim/gvm';

export type ZoneId = 'wire' | 'arena' | 'perimeter' | 'cloud' | 'report' | 'scanner';

export interface Zone {
  id: ZoneId;
  name: string;
  tagline: string;
  /** One or two sentences: what the sandbox is and what you do in it. */
  intro: string;
  levelIds: string[];
}

export interface CodexEntry {
  id: string;
  title: string;
  zone: ZoneId;
  /** One sentence, shown when you hover or tap the term in a level. */
  short: string;
  body: string[];
}

export interface Evidence {
  id: string;
  /** The level that hands it to you; null for case-file items you always have. */
  from: string | null;
  title: string;
  body: string;
}

/**
 * One numbered step of a level. Each step is a check that turns green when the
 * sandbox reaches a state, plus the words a beginner needs to get it there.
 */
export interface LevelCheck {
  id: string;
  /** What the step achieves, in a few words. */
  label: string;
  /** Exactly what to do: which panel, which button, which line, what to type. `code` and [[codex-id|words]] work here. */
  do: string;
  /** One sentence shown once the step is done: what just happened and why it matters. */
  learned: string;
  /** Optional: the shape the result should have, shown as a small code block under `do`. */
  hint?: string;
}

export interface ShowMeStep<A> {
  /** What to do, in one line. */
  say: string;
  /** What the sandbox does for you when this step is shown. */
  act?: A;
}

interface LevelBase<A> {
  id: string;
  zone: ZoneId;
  title: string;
  /** The level's goal, one line, always visible. */
  goal: string;
  /** At most two sentences. [[codex-id|words]] become hoverable terms. */
  instruction: string;
  checks: LevelCheck[];
  /** All steps are done together and checked at once (the finding): show every step open. */
  stepsTogether?: boolean;
  showMe: ShowMeStep<A>[];
  /** The real-world name of what the player just did. */
  realName: string;
  /** One sentence for the result card. */
  didWhat: string;
  codex: string[];
  /** Evidence ids this level adds to the locker when cleared. */
  evidence?: string[];
  xp: number;
  /** Seconds a steady first run takes; slower than three times this costs a star. */
  par: number;
  boss?: boolean;
  /** Set on a challenge variant: no steps, no Show me, hints instead. */
  challenge?: boolean;
}

// ---- The Wire -----------------------------------------------------------------

export interface WireExchange {
  req: HttpRequest;
  res: HttpResponse;
}

export interface ConsoleRun {
  input: string;
  output: string;
}

export interface WireState {
  exchanges: WireExchange[];
  /** Responses the player forwarded to the browser (response mode). */
  forwarded: HttpResponse[];
  console: ConsoleRun[];
  jar: StoredCookie[];
}

export interface WireAct {
  request?: string;
  /** Replace only the path on the request line. */
  path?: string;
  send?: boolean;
  response?: string;
  forward?: boolean;
  console?: string;
  jwtHeader?: string;
  jwtPayload?: string;
  jwtSignature?: string;
}

export interface WireLevel extends LevelBase<WireAct> {
  kind: 'wire';
  server: WireServerId;
  /** The server's values, when they differ from the guided level's (challenge variants). */
  params?: WireParams;
  host: string;
  /** request: edit and send requests. response: the reply stops in the proxy and you edit it. */
  mode: 'request' | 'response';
  request: string;
  /** Earlier traffic in the proxy history, which can be loaded into the editor. */
  captured?: { label: string; raw: string }[];
  /** The browser has a console where document.cookie can be run. */
  console?: boolean;
  /** Show the JWT decoder for the Authorization header. */
  jwt?: boolean;
  /** Turns the sandbox's state into a pass/fail per check id. */
  evaluate: (s: WireState) => Record<string, boolean>;
}

// ---- The Arena ----------------------------------------------------------------

export interface ArenaAct {
  /** Play the recorded incident against the current code. */
  replay?: boolean;
  /** Point at the faulty line. */
  pick?: boolean;
  /** Fill in the reference fix. */
  code?: 'fix';
}

export interface ArenaLevel extends LevelBase<ArenaAct> {
  kind: 'arena';
  app: ArenaAppId;
  /** A variant of the app built for a challenge (other names, data and line numbers). */
  custom?: ArenaApp;
  /** What the app's address bar shows. */
  url: string;
  appName: string;
}

// ---- The Perimeter --------------------------------------------------------------

export interface TerminalAct {
  type: string;
  run?: boolean;
}

export interface TerminalGoal {
  id: string;
  /** Passes when any of these facts has been seen. A trailing * matches a prefix. */
  facts?: string[];
  /** Passes when one of these answers was submitted (compared without case or spaces). */
  answers?: string[];
}

export interface TerminalLevel extends LevelBase<TerminalAct> {
  kind: 'terminal';
  network: Network;
  goals: TerminalGoal[];
  /** Specific feedback for answers that are wrong in an instructive way. */
  wrong: { answers: string[]; reason: string }[];
  /** Feedback for any other wrong answer. */
  otherwise: string;
}

// ---- The Cloud ------------------------------------------------------------------

export interface CloudAct {
  text?: string;
  bpa?: boolean;
  rules?: SgRule[];
  keyOp?: 'find' | 'create' | 'ci-new' | 'deactivate-leaked';
  verdicts?: Record<string, Verdict>;
  trace?: string;
}

export type CloudLevel = LevelBase<CloudAct> & { kind: 'cloud' } & (
    | { panel: 'bucket'; policy: string; setup?: BucketSetup }
    | { panel: 'iam'; policy: string; setup?: IamSetup }
    | { panel: 'sg'; rules: SgRule[]; setup?: SgSetup }
    | { panel: 'keys'; setup?: KeySetup }
    | { panel: 'scan'; findings: ScanFinding[] }
    | { panel: 'gateway'; config: string; setup?: GatewaySetup }
  );

// ---- The Report -----------------------------------------------------------------

export interface ReportAct {
  place?: [string, number];
  vector?: Partial<Vector>;
  draft?: Partial<FindingDraft>;
  send?: boolean;
  /** Retest: replay the recorded attack, or one of its recorded variants. */
  retest?: 'original' | 'variant-0' | 'variant-1';
  status?: 'open' | 'fixed' | 'not-fixed';
  text?: string;
  run?: boolean;
}

export type ReportLevel = LevelBase<ReportAct> & { kind: 'report' } & (
    | { panel: 'phases'; artifacts: Artifact[] }
    | { panel: 'cvss'; target: string; facts: { metric: string; text: string }[]; caseTitle: string; caseBody: string }
    | { panel: 'finding'; spec?: FindingSpec; locker?: Evidence[] }
    | {
        panel: 'retest';
        clientCode: string;
        /** Challenge: the input the recorded attack used, the two variants, and whether the developers' change really works. */
        retest?: { attack: Record<string, string>; variants: Record<string, string>[]; labels: [string, string, string]; fixWorks: boolean; title: string };
      }
    | { panel: 'lab'; compose: string }
  );

// ---- The Scanner (OpenVAS) -------------------------------------------------------

export interface ScannerAct {
  /** Open this page of the console. */
  tab?: ScanTab;
  /** Fill a form or press a button, through the same reducer the console uses. */
  actions?: GvmAction[];
  /** Type into the answer box and check it. */
  answer?: string;
}

export interface ScannerLevel extends LevelBase<ScannerAct> {
  kind: 'scanner';
  setup: GvmSetup;
  /** The page the console opens on. */
  startTab: ScanTab;
  /** The console has CISA's KEV catalog loaded: a KEV page and a Match against KEV button. */
  kev?: boolean;
  /** A question answered in the box under the results, when the level has one. */
  question?: { ask: string; answers: string[]; wrong?: { answers: string[]; reason: string }[]; otherwise: string };
  /** What Lantern's admin says about a result when you open it: result key to note. */
  notes?: Record<string, string>;
  evaluate: (s: GvmState) => Record<string, boolean>;
}

export type Level = WireLevel | ArenaLevel | TerminalLevel | CloudLevel | ReportLevel | ScannerLevel;
