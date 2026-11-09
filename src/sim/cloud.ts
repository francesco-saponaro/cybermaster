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
  if (!raw || typeof raw !== 'object' || !('Statement' in raw)) return { ok: false, error: 'A policy needs a "Statement" list.' };
  const st = (raw as { Statement: unknown }).Statement;
  const list = Array.isArray(st) ? st : [st];
  for (const [i, s] of list.entries()) {
    if (!s || typeof s !== 'object') return { ok: false, error: `Statement ${i + 1} is not an object.` };
    const o = s as Record<string, unknown>;
    if (o.Effect !== 'Allow' && o.Effect !== 'Deny') return { ok: false, error: `Statement ${i + 1} needs "Effect": "Allow" or "Deny".` };
    if (!o.Action) return { ok: false, error: `Statement ${i + 1} needs an "Action".` };
    if (!o.Resource) return { ok: false, error: `Statement ${i + 1} needs a "Resource".` };
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
const INVOICE = `arn:aws:s3:::${BUCKET}/2026/INV-1043.pdf`;

/** Statements that would let anyone at all in: the thing Block Public Access looks for. */
export function publicStatements(policy: Policy): Statement[] {
  return policy.Statement.filter((s) => s.Effect === 'Allow' && principalMatches(s.Principal, 'anonymous') && !s.Condition);
}

export function bucketChecks(text: string, blockPublicAccess: boolean): { valid: boolean; error?: string; checks: Check[]; anonymousStatus: number; appStatus: number } {
  const parsed = parsePolicy(text);
  if (!parsed.ok) {
    return {
      valid: false,
      error: parsed.error,
      checks: [
        { id: 'no-public', pass: false, detail: parsed.error },
        { id: 'app-reads', pass: false, detail: 'The policy has to parse first.' },
        { id: 'bpa', pass: blockPublicAccess, detail: blockPublicAccess ? 'On.' : 'Off.' },
      ],
      anonymousStatus: 403,
      appStatus: 403,
    };
  }
  const p = parsed.policy;
  const pub = publicStatements(p);
  const anon = evaluate(p, { principal: 'anonymous', action: 's3:GetObject', resource: INVOICE, sourceIp: '198.51.100.20' });
  const app = evaluate(p, { principal: APP_ROLE, action: 's3:GetObject', resource: INVOICE, sourceIp: '10.0.1.20' });
  const anonAllowed = anon === 'allow' && !blockPublicAccess;
  return {
    valid: true,
    checks: [
      { id: 'no-public', pass: pub.length === 0, detail: pub.length ? `Statement "${pub[0]!.Sid ?? 'unnamed'}" still allows Principal "*".` : 'No statement grants anything to everyone.' },
      { id: 'app-reads', pass: app === 'allow', detail: app === 'allow' ? 'The billing app can read invoices.' : 'The billing app lost access: allow its role to s3:GetObject.' },
      { id: 'bpa', pass: blockPublicAccess, detail: blockPublicAccess ? 'Block Public Access is on.' : 'Block Public Access is off.' },
    ],
    anonymousStatus: anonAllowed ? 200 : 403,
    appStatus: app === 'allow' ? 200 : 403,
  };
}

// ---- Level: least privilege -------------------------------------------------

export const EXPORT_ROLE = 'arn:aws:iam::111122223333:role/report-export';

export const IAM_PROBES: { id: string; label: string; ctx: RequestContext; want: 'allow' | 'deny' }[] = [
  { id: 'read', label: 'Read monthly/2026-10.csv', ctx: { principal: EXPORT_ROLE, action: 's3:GetObject', resource: 'arn:aws:s3:::harbor-reports/monthly/2026-10.csv' }, want: 'allow' },
  { id: 'write', label: 'Write exports/2026-10.pdf', ctx: { principal: EXPORT_ROLE, action: 's3:PutObject', resource: 'arn:aws:s3:::harbor-reports/exports/2026-10.pdf' }, want: 'allow' },
  { id: 'delete', label: 'Delete monthly/2026-10.csv', ctx: { principal: EXPORT_ROLE, action: 's3:DeleteObject', resource: 'arn:aws:s3:::harbor-reports/monthly/2026-10.csv' }, want: 'deny' },
  { id: 'overwrite', label: 'Overwrite monthly/2026-10.csv', ctx: { principal: EXPORT_ROLE, action: 's3:PutObject', resource: 'arn:aws:s3:::harbor-reports/monthly/2026-10.csv' }, want: 'deny' },
  { id: 'payroll', label: 'Read harbor-payroll/2026-10.csv', ctx: { principal: EXPORT_ROLE, action: 's3:GetObject', resource: 'arn:aws:s3:::harbor-payroll/2026-10.csv' }, want: 'deny' },
  { id: 'iam', label: 'Create an access key', ctx: { principal: EXPORT_ROLE, action: 'iam:CreateAccessKey', resource: 'arn:aws:iam::111122223333:user/admin' }, want: 'deny' },
];

export function iamChecks(text: string): { valid: boolean; error?: string; checks: Check[]; probes: { id: string; label: string; result: string; ok: boolean }[] } {
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
  const probes = IAM_PROBES.map((pr) => {
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
      { id: 'task', pass: taskOk, detail: taskOk ? 'The export job can read the monthly data and write its PDF.' : 'The export job can no longer do its work.' },
      { id: 'no-star-action', pass: !starAction, detail: starAction ? `"${starAction}" grants every action.` : 'Every action is named.' },
      { id: 'no-star-resource', pass: !starResource, detail: starResource ? `"${starResource}" covers every resource.` : 'Every resource is named.' },
      { id: 'denied', pass: deniedOk, detail: firstLeak ? `Still allowed: ${firstLeak.label.toLowerCase()}.` : 'Everything else is denied.' },
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

export function sgChecks(rules: SgRule[]): Check[] {
  const worldOn = (port: number) => rules.find((r) => (r.protocol === 'tcp' || r.protocol === 'all') && portsCover(r.ports, port) && isWorld(r.source));
  const ssh = worldOn(22);
  const rdp = worldOn(3389);
  const db = worldOn(5432);
  const web = worldOn(443);
  const office = reach(rules, 22, OFFICE_IP);
  const bad = rules.find((r) => !validCidr(r.source) || !/^(\d+(\s*-\s*\d+)?|all)$/i.test(r.ports.trim()));
  return [
    { id: 'ssh', pass: !ssh, detail: ssh ? `${ssh.ports === '22' ? 'Port 22' : `Ports ${ssh.ports}`} open to ${ssh.source}.` : 'SSH is closed to the internet.' },
    { id: 'rdp', pass: !rdp, detail: rdp ? `Port 3389 open to ${rdp.source}.` : 'RDP is closed to the internet.' },
    { id: 'db', pass: !db, detail: db ? `PostgreSQL (5432) open to ${db.source}.` : 'The database is closed to the internet.' },
    { id: 'web', pass: !!web, detail: web ? 'Customers reach the site on 443.' : 'Customers can no longer reach the site: keep 443 open to 0.0.0.0/0.' },
    { id: 'office', pass: !!office && !bad, detail: bad ? `Rule "${bad.ports} from ${bad.source}" is not valid.` : office ? `The office (${OFFICE_IP}) still reaches SSH.` : `The ops team in the office (${OFFICE_IP}) lost SSH: allow 22 from 203.0.113.64/27.` },
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

export function keyChecks(s: KeyState): Check[] {
  const key = (id: string) => s.keys.find((k) => k.id === id);
  const leaked = key(LEAKED_KEY);
  const ci = key(s.ciKey);
  const backup = key(s.backupKey);
  return [
    { id: 'found', pass: s.found, detail: s.found ? `Found ${LEAKED_KEY} in commit 9c2e41a.` : 'Find the key in the repository first.' },
    { id: 'revoked', pass: !leaked || leaked.status === 'Inactive', detail: !leaked ? 'The leaked key is deleted.' : leaked.status === 'Inactive' ? 'The leaked key is deactivated.' : 'The leaked key still works for anyone who copied it.' },
    {
      id: 'deploys',
      pass: !!ci && ci.status === 'Active' && ci.id !== LEAKED_KEY,
      detail: !ci || ci.status !== 'Active' ? 'Deploys fail: the pipeline secret points at a key that no longer works.' : ci.id === LEAKED_KEY ? 'Deploys still use the leaked key.' : 'Deploys run with the new key.',
    },
    { id: 'backups', pass: !!backup && backup.status === 'Active', detail: backup && backup.status === 'Active' ? 'Nightly backups still run.' : 'Backups fail: that key belonged to the backup job.' },
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
    { id: 'real', pass: realOk === real.length, detail: `${realOk} of ${real.length} real problems sent to fix.` },
    { id: 'noise', pass: noiseOk === noise.length, detail: `${noiseOk} of ${noise.length} false alarms dismissed.` },
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
    return { ok: false, error: 'Not valid JSON: check commas, quotes and brackets.' };
  }
  const routes = (raw as { routes?: unknown })?.routes;
  if (!Array.isArray(routes)) return { ok: false, error: 'The config needs a "routes" list.' };
  for (const [i, r] of routes.entries()) {
    const o = r as Record<string, unknown>;
    if (typeof o?.path !== 'string' || typeof o?.method !== 'string' || typeof o?.auth !== 'string') return { ok: false, error: `Route ${i + 1} needs "path", "method" and "auth".` };
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
  token: 'none' | 'sam' | 'export-job';
}

export function routeFor(routes: GatewayRoute[], method: string, path: string): GatewayRoute | undefined {
  return routes.find((r) => r.method.toUpperCase() === method.toUpperCase() && new RegExp('^' + r.path.replace(/\{[^}]+\}/g, '[^/]+') + '$').test(path));
}

/** What the gateway answers for one call. Orders 7001 and 7002 are Sam's; 7003 is someone else's. */
export function gatewayCall(routes: GatewayRoute[], call: GatewayCall): { status: number; body: string } {
  const route = routeFor(routes, call.method, call.path);
  if (!route) return { status: 404, body: '{"error":"No such route"}' };
  if (route.auth.toLowerCase() !== 'none' && call.token === 'none') return { status: 401, body: '{"error":"Missing or invalid token"}' };
  if (call.path === '/internal/export') return { status: 200, body: '{"rows":48211,"file":"customers-full.csv"}' };
  if (call.path === '/v1/login') return { status: 200, body: '{"token":"eyJ..."}' };
  if (call.path === '/v1/orders') return { status: 200, body: '[{"id":7001},{"id":7002}]' };
  const m = /^\/v1\/orders\/(\d+)$/.exec(call.path);
  if (m) {
    const mine = ['7001', '7002'].includes(m[1]!);
    if (!mine && route.ownerCheck) return { status: 404, body: '{"error":"Not found"}' };
    return { status: 200, body: mine ? `{"id":${m[1]},"owner":"sam"}` : `{"id":${m[1]},"owner":"atelier-rive","address":"9 quai Rambaud"}` };
  }
  return { status: 404, body: '{"error":"No such route"}' };
}

export function gatewayChecks(text: string): { valid: boolean; error?: string; checks: Check[] } {
  const parsed = parseGateway(text);
  if (!parsed.ok) return { valid: false, error: parsed.error, checks: ['export', 'bola', 'ratelimit', 'customers'].map((id) => ({ id, pass: false, detail: parsed.error })) };
  const r = parsed.routes;
  const anonExport = gatewayCall(r, { method: 'GET', path: '/internal/export', token: 'none' });
  const jobExport = gatewayCall(r, { method: 'GET', path: '/internal/export', token: 'export-job' });
  const other = gatewayCall(r, { method: 'GET', path: '/v1/orders/7003', token: 'sam' });
  const login = routeFor(r, 'POST', '/v1/login');
  const rate = perMinute(login?.rateLimit);
  const flows = [
    gatewayCall(r, { method: 'POST', path: '/v1/login', token: 'none' }),
    gatewayCall(r, { method: 'GET', path: '/v1/orders', token: 'sam' }),
    gatewayCall(r, { method: 'GET', path: '/v1/orders/7001', token: 'sam' }),
  ];
  const brokenFlow = flows.findIndex((f) => f.status !== 200);
  const flowNames = ['logging in', 'listing their orders', 'opening their own order'];
  return {
    valid: true,
    checks: [
      {
        id: 'export',
        pass: anonExport.status === 401 && jobExport.status === 200,
        detail: anonExport.status === 200 ? 'Anyone can download the full customer export.' : jobExport.status !== 200 ? 'The nightly export job can no longer reach /internal/export: require a token, do not remove the route.' : 'The export needs a token.',
      },
      { id: 'bola', pass: other.status === 404 || other.status === 403, detail: other.status === 200 ? 'Sam can open order 7003, which is not his.' : 'Orders are checked against their owner.' },
      { id: 'ratelimit', pass: rate !== null && rate <= 10, detail: rate === null ? 'Login has no rate limit: passwords can be guessed at full speed.' : rate > 10 ? `${login?.rateLimit} is still a lot of guesses: keep it to 10 a minute or fewer.` : `Login is limited to ${login?.rateLimit}.` },
      { id: 'customers', pass: brokenFlow === -1, detail: brokenFlow === -1 ? 'Customers can log in and see their orders.' : `Customers are stuck ${flowNames[brokenFlow]}.` },
    ],
  };
}
