// The Cloud console's checkers: an IAM-style policy evaluator, security group
// reachability, key rotation, code-scan triage and an API gateway. Each level's
// checker panel is one of these functions run on every edit.

// ---- Policies ---------------------------------------------------------------

export interface Statement {
  Sid?: string;
  Effect: 'Allow' | 'Deny';
  Principal?: unknown;
  Action: string | string[];
  Resource: string | string[];
  Condition?: Record<string, Record<string, string | string[] | boolean>>;
}

export interface Policy {
  Version?: string;
  Statement: Statement[];
}

export interface RequestContext {
  /** An ARN, or "anonymous" for a request with no credentials. */
  principal: string;
  action: string;
  resource: string;
  sourceIp?: string;
  secure?: boolean;
}

export type ParsedPolicy = { ok: true; policy: Policy } | { ok: false; error: string };

export function parsePolicy(text: string): ParsedPolicy {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const pos = /position (\d+)/.exec(msg);
    const line = pos ? text.slice(0, Number(pos[1])).split('\n').length : null;
    return { ok: false, error: `Not valid JSON${line ? ` (around line ${line})` : ''}: check commas, quotes and brackets.` };
  }
  if (!raw || typeof raw !== 'object' || !('Statement' in raw)) return { ok: false, error: 'A policy needs a "Statement" list. Compare your text with the example in the step.' };
  const st = (raw as { Statement: unknown }).Statement;
  const list = Array.isArray(st) ? st : [st];
  for (const [i, s] of list.entries()) {
    if (!s || typeof s !== 'object') return { ok: false, error: `Statement ${i + 1} is not an object. Each statement goes between { and }.` };
    const o = s as Record<string, unknown>;
    if (o.Effect !== 'Allow' && o.Effect !== 'Deny') return { ok: false, error: `Statement ${i + 1} needs "Effect": "Allow" or "Deny". Add that line back.` };
    if (!o.Action) return { ok: false, error: `Statement ${i + 1} needs an "Action". Add one, like "Action": "s3:GetObject".` };
    if (!o.Resource) return { ok: false, error: `Statement ${i + 1} needs a "Resource". Add the path it applies to.` };
  }
  return { ok: true, policy: { ...(raw as Policy), Statement: list as Statement[] } };
}

const asList = (x: string | string[] | undefined): string[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

/** Glob match with * and ?, as IAM does. Actions ignore case; resources do not. */
export function globMatch(pattern: string, value: string, ignoreCase = false): boolean {
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', ignoreCase ? 'i' : '');
  return re.test(value);
}

function principalMatches(principal: unknown, who: string): boolean {
  if (principal === undefined) return true; // identity policies have no Principal: they apply to whoever holds them
  if (principal === '*') return true;
  if (principal && typeof principal === 'object') {
    const aws = (principal as Record<string, unknown>).AWS;
    for (const p of asList(aws as string | string[] | undefined)) {
      if (p === '*') return true;
      if (p === who) return true;
      const acct = /^arn:aws:iam::(\d+):root$/.exec(p);
      if (acct && who.startsWith(`arn:aws:iam::${acct[1]}:`)) return true;
    }
  }
  return false;
}

function ipInCidr(ip: string, cidr: string): boolean {
  const toInt = (s: string) => s.split('.').reduce((n, o) => n * 256 + Number(o), 0);
  const [base = '', bits = '32'] = cidr.split('/');
  const size = 2 ** (32 - Number(bits));
  const b = toInt(base);
  const n = toInt(ip);
  return n >= b - (b % size) && n < b - (b % size) + size;
}

function conditionHolds(cond: Statement['Condition'], ctx: RequestContext): boolean {
  if (!cond) return true;
  for (const [op, kv] of Object.entries(cond)) {
    for (const [key, val] of Object.entries(kv)) {
      const vals = Array.isArray(val) ? val.map(String) : [String(val)];
      const k = key.toLowerCase();
      if (op === 'IpAddress' && k === 'aws:sourceip') {
        if (!ctx.sourceIp || !vals.some((c) => ipInCidr(ctx.sourceIp!, c))) return false;
      } else if (op === 'NotIpAddress' && k === 'aws:sourceip') {
        if (ctx.sourceIp && vals.some((c) => ipInCidr(ctx.sourceIp!, c))) return false;
      } else if (op === 'Bool' && k === 'aws:securetransport') {
        if (String(ctx.secure ?? true) !== vals[0]) return false;
      } else if ((op === 'StringEquals' || op === 'ArnEquals' || op === 'ArnLike' || op === 'StringLike') && k === 'aws:principalarn') {
        if (!vals.some((v) => globMatch(v, ctx.principal))) return false;
      } else {
        return false; // a condition this console cannot evaluate never matches
      }
    }
  }
  return true;
}

function statementMatches(s: Statement, ctx: RequestContext): boolean {
  if (!principalMatches(s.Principal, ctx.principal)) return false;
  if (!asList(s.Action).some((a) => globMatch(a, ctx.action, true))) return false;
  if (!asList(s.Resource).some((r) => globMatch(r, ctx.resource))) return false;
  return conditionHolds(s.Condition, ctx);
}

/** IAM's rule: an explicit Deny wins, then any Allow, otherwise denied by default. */
export function evaluate(policy: Policy, ctx: RequestContext): 'allow' | 'deny' | 'implicit-deny' {
  let allowed = false;
  for (const s of policy.Statement) {
    if (!statementMatches(s, ctx)) continue;
    if (s.Effect === 'Deny') return 'deny';
    allowed = true;
  }
  return allowed ? 'allow' : 'implicit-deny';
}

export interface Check {
  id: string;
  pass: boolean;
  detail: string;
}

// ---- Level: the public bucket ----------------------------------------------

export const BUCKET = 'harbor-invoices';
export const APP_ROLE = 'arn:aws:iam::111122223333:role/billing-web';

/** The bucket, the app role that must keep reading it, and the object the test downloads. */
export interface BucketSetup {
  bucket: string;
  appRole: string;
  /** The Sid of the app's statement, as the detail text names it. */
  appSid: string;
  object: string;
}

export const BUCKET_SETUP: BucketSetup = { bucket: BUCKET, appRole: APP_ROLE, appSid: 'BillingApp', object: '2026/INV-1043.pdf' };

/** Statements that would let anyone at all in: the thing Block Public Access looks for. */
export function publicStatements(policy: Policy): Statement[] {
  return policy.Statement.filter((s) => s.Effect === 'Allow' && principalMatches(s.Principal, 'anonymous') && !s.Condition);
}

export function bucketChecks(text: string, blockPublicAccess: boolean, setup: BucketSetup = BUCKET_SETUP): { valid: boolean; error?: string; checks: Check[]; anonymousStatus: number; appStatus: number } {
  const parsed = parsePolicy(text);
  if (!parsed.ok) {
    return {
      valid: false,
      error: parsed.error,
      checks: [
        { id: 'no-public', pass: false, detail: parsed.error },
        { id: 'app-reads', pass: false, detail: 'The policy has to be valid JSON first: fix the error above.' },
        { id: 'bpa', pass: blockPublicAccess, detail: blockPublicAccess ? 'On.' : 'Off: click the Block all public access switch.' },
      ],
      anonymousStatus: 403,
      appStatus: 403,
    };
  }
  const p = parsed.policy;
  const pub = publicStatements(p);
  const object = `arn:aws:s3:::${setup.bucket}/${setup.object}`;
  const anon = evaluate(p, { principal: 'anonymous', action: 's3:GetObject', resource: object, sourceIp: '198.51.100.20' });
  const app = evaluate(p, { principal: setup.appRole, action: 's3:GetObject', resource: object, sourceIp: '10.0.1.20' });
  const anonAllowed = anon === 'allow' && !blockPublicAccess;
  return {
    valid: true,
    checks: [
      { id: 'no-public', pass: pub.length === 0, detail: pub.length ? `Statement "${pub[0]!.Sid ?? 'unnamed'}" still allows Principal "*": delete that whole statement.` : 'No statement grants anything to everyone.' },
      { id: 'app-reads', pass: app === 'allow', detail: app === 'allow' ? 'The billing app can read invoices.' : `The app lost access: put the ${setup.appSid} statement back${setup === BUCKET_SETUP ? ', as in the example' : ''}.` },
      { id: 'bpa', pass: blockPublicAccess, detail: blockPublicAccess ? 'Block Public Access is on.' : 'Block Public Access is off: click its switch in the Settings and test panel.' },
    ],
    anonymousStatus: anonAllowed ? 200 : 403,
    appStatus: app === 'allow' ? 200 : 403,
  };
}

// ---- Level: least privilege -------------------------------------------------

export const EXPORT_ROLE = 'arn:aws:iam::111122223333:role/report-export';

/** The job's bucket, the folder it reads, the folder it writes, a file name, and a bucket it must not touch. */
export interface IamSetup {
  role: string;
  bucket: string;
  read: string;
  write: string;
  file: string;
  other: string;
}

export const IAM_SETUP: IamSetup = { role: 'report-export', bucket: 'harbor-reports', read: 'monthly', write: 'exports', file: '2026-10', other: 'harbor-payroll' };

export function iamProbes(x: IamSetup): { id: string; label: string; ctx: RequestContext; want: 'allow' | 'deny' }[] {
  const role = `arn:aws:iam::111122223333:role/${x.role}`;
  const obj = (path: string) => `arn:aws:s3:::${x.bucket}/${path}`;
  return [
    { id: 'read', label: `Read ${x.read}/${x.file}.csv`, ctx: { principal: role, action: 's3:GetObject', resource: obj(`${x.read}/${x.file}.csv`) }, want: 'allow' },
    { id: 'write', label: `Write ${x.write}/${x.file}.pdf`, ctx: { principal: role, action: 's3:PutObject', resource: obj(`${x.write}/${x.file}.pdf`) }, want: 'allow' },
    { id: 'delete', label: `Delete ${x.read}/${x.file}.csv`, ctx: { principal: role, action: 's3:DeleteObject', resource: obj(`${x.read}/${x.file}.csv`) }, want: 'deny' },
    { id: 'overwrite', label: `Overwrite ${x.read}/${x.file}.csv`, ctx: { principal: role, action: 's3:PutObject', resource: obj(`${x.read}/${x.file}.csv`) }, want: 'deny' },
    { id: 'payroll', label: `Read ${x.other}/${x.file}.csv`, ctx: { principal: role, action: 's3:GetObject', resource: `arn:aws:s3:::${x.other}/${x.file}.csv` }, want: 'deny' },
    { id: 'iam', label: 'Create an access key', ctx: { principal: role, action: 'iam:CreateAccessKey', resource: 'arn:aws:iam::111122223333:user/admin' }, want: 'deny' },
  ];
}

export const IAM_PROBES = iamProbes(IAM_SETUP);

export function iamChecks(text: string, setup: IamSetup = IAM_SETUP): { valid: boolean; error?: string; checks: Check[]; probes: { id: string; label: string; result: string; ok: boolean }[] } {
  const parsed = parsePolicy(text);
  if (!parsed.ok) {
    return {
      valid: false,
      error: parsed.error,
      checks: ['task', 'no-star-action', 'no-star-resource', 'denied'].map((id) => ({ id, pass: false, detail: parsed.error })),
      probes: [],
    };
  }
  const p = parsed.policy;
  const probes = (setup === IAM_SETUP ? IAM_PROBES : iamProbes(setup)).map((pr) => {
    const r = evaluate(p, pr.ctx);
    const allowed = r === 'allow';
    return { id: pr.id, label: pr.label, result: allowed ? 'Allowed' : 'Denied', ok: (pr.want === 'allow') === allowed };
  });
  const allows = p.Statement.filter((s) => s.Effect === 'Allow');
  const starAction = allows.flatMap((s) => asList(s.Action)).find((a) => a === '*' || /:\*$/.test(a));
  const starResource = allows.flatMap((s) => asList(s.Resource)).find((r) => r === '*' || r === 'arn:aws:s3:::*');
  const taskOk = probes.filter((x) => x.id === 'read' || x.id === 'write').every((x) => x.ok);
  const deniedOk = probes.filter((x) => x.id !== 'read' && x.id !== 'write').every((x) => x.ok);
  const firstLeak = probes.find((x) => x.id !== 'read' && x.id !== 'write' && !x.ok);
  return {
    valid: true,
    checks: [
      { id: 'task', pass: taskOk, detail: taskOk ? setup === IAM_SETUP ? 'The export job can read the monthly data and write its PDF.' : `The export job can read ${setup.read}/ and write its PDF to ${setup.write}/.` : 'The export job can no longer do its work: check the two Needed rows and fix the action or path that says Denied.' },
      { id: 'no-star-action', pass: !starAction, detail: starAction ? `"${starAction}" grants every action: name s3:GetObject and s3:PutObject instead.` : 'Every action is named.' },
      { id: 'no-star-resource', pass: !starResource, detail: starResource ? `"${starResource}" covers every resource: name the ${setup.read}/ and ${setup.write}/ paths instead.` : 'Every resource is named.' },
      { id: 'denied', pass: deniedOk, detail: firstLeak ? `Still allowed: ${firstLeak.label.toLowerCase()}. Remove the action or path that allows it.` : 'Everything else is denied.' },
    ],
    probes,
  };
}

// ---- Level: security groups -------------------------------------------------

export interface SgRule {
  id: string;
  protocol: 'tcp' | 'udp' | 'all';
  ports: string; // "22", "8000-8100" or "all"
  source: string; // CIDR
  note: string;
}

export const OFFICE_IP = '203.0.113.70';

/** The office range and one address in it, the ports that stay open to everyone, and the ports to close. */
export interface SgSetup {
  group: string;
  officeCidr: string;
  officeIp: string;
  open: number[];
  close: { id: string; port: number; name: string }[];
}

export const SG_SETUP: SgSetup = {
  group: 'sg-web-01',
  officeCidr: '203.0.113.64/27',
  officeIp: OFFICE_IP,
  open: [443],
  close: [
    { id: 'rdp', port: 3389, name: 'RDP' },
    { id: 'db', port: 5432, name: 'PostgreSQL' },
  ],
};

export function portsCover(ports: string, port: number): boolean {
  const p = ports.trim().toLowerCase();
  if (p === 'all' || p === '0-65535' || p === '*') return true;
  const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(p);
  if (!m) return false;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return port >= a && port <= b;
}

export function validCidr(c: string): boolean {
  if (c.trim() === '::/0') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(c.trim());
  return !!m && m.slice(1, 5).every((o) => Number(o) <= 255) && Number(m[5]) <= 32;
}

export function isWorld(c: string): boolean {
  const s = c.trim();
  return s === '0.0.0.0/0' || s === '::/0';
}

function reach(rules: SgRule[], port: number, ip: string | 'world'): SgRule | undefined {
  return rules.find((r) => (r.protocol === 'tcp' || r.protocol === 'all') && portsCover(r.ports, port) && validCidr(r.source) && (isWorld(r.source) || (ip !== 'world' && !r.source.includes(':') && ipInCidr(ip, r.source))));
}

export function sgChecks(rules: SgRule[], setup: SgSetup = SG_SETUP): Check[] {
  const worldOn = (port: number) => rules.find((r) => (r.protocol === 'tcp' || r.protocol === 'all') && portsCover(r.ports, port) && isWorld(r.source));
  const guided = setup === SG_SETUP;
  const ssh = worldOn(22);
  const web = setup.open.map((p) => [p, worldOn(p)] as const);
  const lost = web.find(([, r]) => !r);
  const office = reach(rules, 22, setup.officeIp);
  const bad = rules.find((r) => !validCidr(r.source) || !/^(\d+(\s*-\s*\d+)?|all)$/i.test(r.ports.trim()));
  const close = setup.close.map((c): Check => {
    const r = worldOn(c.port);
    if (guided && c.id === 'rdp') return { id: 'rdp', pass: !r, detail: r ? `Port 3389 open to ${r.source}: press Remove on that rule.` : 'RDP is closed to the internet.' };
    if (guided && c.id === 'db') return { id: 'db', pass: !r, detail: r ? `PostgreSQL (5432) open to ${r.source}: press Remove on that rule.` : 'The database is closed to the internet.' };
    return { id: c.id, pass: !r, detail: r ? `${c.name} (${c.port}) is open to ${r.source}.` : `${c.name} is closed to the internet.` };
  });
  return [
    { id: 'ssh', pass: !ssh, detail: ssh ? (guided ? `${ssh.ports === '22' ? 'Port 22' : `Ports ${ssh.ports}`} open to ${ssh.source}: change that Source to 203.0.113.64/27.` : `SSH (22) is open to ${ssh.source}.`) : 'SSH is closed to the internet.' },
    ...close,
    {
      id: 'web',
      pass: !lost,
      detail: !lost ? (guided ? 'Customers reach the site on 443.' : `Customers reach the site on ${setup.open.join(' and ')}.`) : guided ? 'Customers can no longer reach the site: keep 443 open to 0.0.0.0/0.' : `Customers can no longer reach port ${lost[0]}.`,
    },
    {
      id: 'office',
      pass: !!office && !bad,
      detail: bad
        ? `Rule "${bad.ports} from ${bad.source}" is not valid: use a port number like 22 and a range like ${setup.officeCidr}.`
        : office
          ? `The office (${setup.officeIp}) still reaches SSH.`
          : guided
            ? `The ops team in the office (${OFFICE_IP}) lost SSH: allow 22 from 203.0.113.64/27.`
            : `The ops team in the office (${setup.officeIp}) lost SSH.`,
    },
  ];
}

// ---- Level: the leaked key ----------------------------------------------------

export const LEAKED_KEY = 'AKIA4HARBORQ7DEPLOY2';
export const BACKUP_KEY = 'AKIA4HARBORM3BACKUP9';
export const NEW_KEY = 'AKIA4HARBORN3WR0TAT5';

export interface AccessKey {
  id: string;
  status: 'Active' | 'Inactive';
  created: string;
}

export interface KeyState {
  keys: AccessKey[];
  /** Which key the deploy pipeline's secret holds. */
  ciKey: string;
  /** Which key the nightly backup job uses (not editable here). */
  backupKey: string;
  /** The player opened the commit that leaked the key. */
  found: boolean;
}

/** The keys, the commit that leaked one, and where it lives. */
export interface KeySetup {
  leaked: string;
  backup: string;
  fresh: string;
  repo: string;
  commits: { id: string; msg: string; when: string; diff: string[] }[];
  /** The commit whose change shows the key being added. */
  leakCommit: string;
  /** Commits that show the key at all (added or removed). */
  showing: string[];
}

export const KEY_SETUP: KeySetup = {
  leaked: LEAKED_KEY,
  backup: BACKUP_KEY,
  fresh: NEW_KEY,
  repo: 'harbor/booking-api',
  commits: [
    { id: 'f0b7d13', msg: 'Remove .env.production', when: '2 days ago', diff: ['--- a/.env.production', '+++ /dev/null', '-AWS_ACCESS_KEY_ID=' + LEAKED_KEY, '-AWS_SECRET_ACCESS_KEY=(40 characters)', '-AWS_REGION=eu-west-3'] },
    { id: '9c2e41a', msg: 'Add production env for deploys', when: '3 days ago', diff: ['--- /dev/null', '+++ b/.env.production', '+AWS_ACCESS_KEY_ID=' + LEAKED_KEY, '+AWS_SECRET_ACCESS_KEY=(40 characters)', '+AWS_REGION=eu-west-3'] },
    { id: 'a41c0e2', msg: 'Add the deploy workflow', when: '3 days ago', diff: ['+++ b/.github/workflows/deploy.yml', '+      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}'] },
  ],
  leakCommit: '9c2e41a',
  showing: ['9c2e41a', 'f0b7d13'],
};

export function keyChecks(s: KeyState, setup: KeySetup = KEY_SETUP): Check[] {
  const key = (id: string) => s.keys.find((k) => k.id === id);
  const leaked = key(setup.leaked);
  const ci = key(s.ciKey);
  const backup = key(s.backupKey);
  return [
    { id: 'found', pass: s.found, detail: s.found ? `Found ${setup.leaked} in commit ${setup.leakCommit}.` : setup === KEY_SETUP ? 'Not found yet: click commit 9c2e41a in the Repository panel.' : 'Not found yet: the key is somewhere in the history.' },
    { id: 'revoked', pass: !leaked || leaked.status === 'Inactive', detail: !leaked ? 'The leaked key is deleted.' : leaked.status === 'Inactive' ? 'The leaked key is deactivated.' : 'The leaked key still works for anyone who copied it: press Deactivate on it once the pipeline uses the new key.' },
    {
      id: 'deploys',
      pass: !!ci && ci.status === 'Active' && ci.id !== setup.leaked,
      detail: !ci || ci.status !== 'Active' ? 'Deploys fail: the pipeline secret points at a key that no longer works. Pick an active new key in the pipeline secret drop-down.' : ci.id === setup.leaked ? 'Deploys still use the leaked key: press Create key, then pick the new key in the pipeline secret drop-down.' : 'Deploys run with the new key.',
    },
    { id: 'backups', pass: !!backup && backup.status === 'Active', detail: backup && backup.status === 'Active' ? 'Nightly backups still run.' : 'Backups fail: that key belonged to the backup job. Press Activate on it.' },
  ];
}

// ---- Level: code scan triage --------------------------------------------------

export type Verdict = 'fix' | 'dismiss';

export interface ScanFinding {
  id: string;
  rule: string;
  severity: 'High' | 'Medium' | 'Low';
  file: string;
  line: number;
  code: string[];
  /** The line indexes (in code) that make the source-to-sink path. */
  trace: number[];
  traceNote: string;
  truth: Verdict;
  /** Why a wrong verdict is wrong, in one line. */
  why: string;
}

export function triageChecks(findings: ScanFinding[], verdicts: Record<string, Verdict | undefined>): Check[] {
  const real = findings.filter((f) => f.truth === 'fix');
  const noise = findings.filter((f) => f.truth === 'dismiss');
  const realOk = real.filter((f) => verdicts[f.id] === 'fix').length;
  const noiseOk = noise.filter((f) => verdicts[f.id] === 'dismiss').length;
  return [
    { id: 'real', pass: realOk === real.length, detail: `${realOk} of ${real.length} real problems sent to fix so far.` },
    { id: 'noise', pass: noiseOk === noise.length, detail: `${noiseOk} of ${noise.length} false alarms dismissed so far.` },
  ];
}

// ---- Boss: the API gateway --------------------------------------------------

export interface GatewayRoute {
  path: string;
  method: string;
  auth: string;
  ownerCheck?: boolean;
  rateLimit?: string;
}

export type ParsedGateway = { ok: true; routes: GatewayRoute[] } | { ok: false; error: string };

export function parseGateway(text: string): ParsedGateway {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not valid JSON: check the commas, quotes and brackets around your last change.' };
  }
  const routes = (raw as { routes?: unknown })?.routes;
  if (!Array.isArray(routes)) return { ok: false, error: 'The config needs a "routes" list. Put back the "routes": [ ... ] around the routes.' };
  for (const [i, r] of routes.entries()) {
    const o = r as Record<string, unknown>;
    if (typeof o?.path !== 'string' || typeof o?.method !== 'string' || typeof o?.auth !== 'string') return { ok: false, error: `Route ${i + 1} needs "path", "method" and "auth". Put back whichever one is missing.` };
  }
  return { ok: true, routes: routes as GatewayRoute[] };
}

/** "10/min" -> 10 per minute; anything unreadable -> null. */
export function perMinute(limit: string | undefined): number | null {
  if (!limit) return null;
  const m = /^\s*(\d+)\s*\/\s*(s|sec|second|m|min|minute|h|hour)\s*$/i.exec(limit);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  return unit.startsWith('s') ? n * 60 : unit.startsWith('h') ? n / 60 : n;
}

export interface GatewayCall {
  method: string;
  path: string;
  /** 'customer' is the signed-in customer; 'sam' is the same caller, kept for older code. */
  token: 'none' | 'sam' | 'customer' | 'export-job';
}

/** The routes a customer uses, the export route, whose items are whose, and what the export hands over. */
export interface GatewaySetup {
  login: string;
  list: string;
  /** The item route with its {id} placeholder. */
  item: string;
  export: string;
  own: [string, string];
  foreign: string;
  customer: string;
  thing: string;
  rows: number;
}

export const GATEWAY_SETUP: GatewaySetup = { login: '/v1/login', list: '/v1/orders', item: '/v1/orders/{id}', export: '/internal/export', own: ['7001', '7002'], foreign: '7003', customer: 'Sam', thing: 'order', rows: 48211 };

export function routeFor(routes: GatewayRoute[], method: string, path: string): GatewayRoute | undefined {
  return routes.find((r) => r.method.toUpperCase() === method.toUpperCase() && new RegExp('^' + r.path.replace(/\{[^}]+\}/g, '[^/]+') + '$').test(path));
}

/** What the gateway answers for one call. By default orders 7001 and 7002 are Sam's; 7003 is someone else's. */
export function gatewayCall(routes: GatewayRoute[], call: GatewayCall, setup: GatewaySetup = GATEWAY_SETUP): { status: number; body: string } {
  const route = routeFor(routes, call.method, call.path);
  if (!route) return { status: 404, body: '{"error":"No such route"}' };
  if (route.auth.toLowerCase() !== 'none' && call.token === 'none') return { status: 401, body: '{"error":"Missing or invalid token"}' };
  if (call.path === setup.export) return { status: 200, body: `{"rows":${setup.rows},"file":"customers-full.csv"}` };
  if (call.path === setup.login) return { status: 200, body: '{"token":"eyJ..."}' };
  if (call.path === setup.list) return { status: 200, body: `[{"id":${setup.own[0]}},{"id":${setup.own[1]}}]` };
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const [before = '', after = ''] = setup.item.split('{id}');
  const itemRe = new RegExp('^' + esc(before) + '(\\d+)' + esc(after) + '$');
  const m = itemRe.exec(call.path);
  if (m) {
    const mine = (setup.own as string[]).includes(m[1]!);
    if (!mine && route.ownerCheck) return { status: 404, body: '{"error":"Not found"}' };
    const owner = setup.customer.toLowerCase();
    return { status: 200, body: mine ? `{"id":${m[1]},"owner":"${owner}"}` : `{"id":${m[1]},"owner":"atelier-rive","address":"9 quai Rambaud"}` };
  }
  return { status: 404, body: '{"error":"No such route"}' };
}

export function gatewayChecks(text: string, setup: GatewaySetup = GATEWAY_SETUP): { valid: boolean; error?: string; checks: Check[] } {
  const parsed = parseGateway(text);
  if (!parsed.ok) return { valid: false, error: parsed.error, checks: ['export', 'bola', 'ratelimit', 'customers'].map((id) => ({ id, pass: false, detail: parsed.error })) };
  const r = parsed.routes;
  const call = (method: string, path: string, token: GatewayCall['token']) => gatewayCall(r, { method, path, token }, setup);
  const itemPath = (id: string) => setup.item.replace('{id}', id);
  const anonExport = call('GET', setup.export, 'none');
  const jobExport = call('GET', setup.export, 'export-job');
  const other = call('GET', itemPath(setup.foreign), 'customer');
  const login = routeFor(r, 'POST', setup.login);
  const rate = perMinute(login?.rateLimit);
  const flows = [call('POST', setup.login, 'none'), call('GET', setup.list, 'customer'), call('GET', itemPath(setup.own[0]), 'customer')];
  const brokenFlow = flows.findIndex((f) => f.status !== 200);
  const guided = setup === GATEWAY_SETUP;
  const flowNames = ['logging in', `listing their ${setup.thing}s`, `opening their own ${setup.thing}`];
  return {
    valid: true,
    checks: [
      {
        id: 'export',
        pass: anonExport.status === 401 && jobExport.status === 200,
        detail: anonExport.status === 200 ? 'Anyone can download the full customer export.' : jobExport.status !== 200 ? `The nightly export job can no longer reach ${setup.export}${guided ? ': set its auth to "service-token" instead of removing the route' : ''}.` : 'The export needs a token.',
      },
      {
        id: 'bola',
        pass: other.status === 404 || other.status === 403,
        detail: other.status === 200 ? (guided ? 'Sam can open order 7003, which is not his: set "ownerCheck": true on /v1/orders/{id}.' : `${setup.customer} can open ${setup.thing} ${setup.foreign}, which is not theirs.`) : `${setup.thing.charAt(0).toUpperCase() + setup.thing.slice(1)}s are checked against their owner.`,
      },
      {
        id: 'ratelimit',
        pass: rate !== null && rate <= 10,
        detail: rate === null ? (guided ? 'Login has no rate limit, so passwords can be guessed at full speed: add "rateLimit": "5/min" to /v1/login.' : 'Login has no rate limit, so passwords can be guessed at full speed.') : rate > 10 ? `${login?.rateLimit} is still a lot of guesses: ${guided ? 'use "5/min", ' : ''}10 a minute or fewer.` : `Login is limited to ${login?.rateLimit}.`,
      },
      { id: 'customers', pass: brokenFlow === -1, detail: brokenFlow === -1 ? 'Customers can log in and see their orders.' : `Customers are stuck ${flowNames[brokenFlow]}: undo the change that blocks them and try that call as Sam.` },
    ],
  };
}
