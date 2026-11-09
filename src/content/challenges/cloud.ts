import type { CloudLevel } from '../types';
import type { ChallengeGenerator } from './types';
import { asChallenge, CUSTOMERS } from './types';
import { LEVEL_BY_ID } from '../index';
import type { Rng } from '../../engine/rng';
import type { BucketSetup, GatewaySetup, IamSetup, KeySetup, ScanFinding, SgRule, SgSetup, Verdict } from '../../sim/cloud';

const guided = (id: string) => LEVEL_BY_ID[id] as CloudLevel;
const json = (x: unknown) => JSON.stringify(x, null, 2);
const PREFIX = ['harbor', 'lantern'];

// ---- Bucket -----------------------------------------------------------------

const bucket: ChallengeGenerator = (rng) => {
  const prefix = rng.pick(PREFIX);
  const kind = rng.pick(['invoices', 'receipts', 'statements', 'delivery-notes']);
  const role = rng.pick(['billing-web', 'accounts-api', 'invoice-mailer']);
  const appSid = rng.pick(['BillingApp', 'AppRead', 'ServiceRead']);
  const pubSid = rng.pick(['PublicRead', 'LegacyShare', 'CdnAccess', 'TempPublic']);
  const setup: BucketSetup = {
    bucket: `${prefix}-${kind}`,
    appRole: `arn:aws:iam::111122223333:role/${role}`,
    appSid,
    object: `${rng.int(2024, 2026)}/${kind.slice(0, 3).toUpperCase()}-${rng.int(1000, 9999)}.pdf`,
  };
  const res = `arn:aws:s3:::${setup.bucket}/*`;
  const app = { Sid: appSid, Effect: 'Allow', Principal: { AWS: setup.appRole }, Action: 's3:GetObject', Resource: res };
  const pub = { Sid: pubSid, Effect: 'Allow', Principal: '*', Action: rng.pick(['s3:GetObject', 's3:Get*']), Resource: res };
  const tls = { Sid: 'DenyPlainHttp', Effect: 'Deny', Principal: '*', Action: 's3:*', Resource: res, Condition: { Bool: { 'aws:SecureTransport': 'false' } } };
  const statements = rng.shuffle([app, pub, ...(rng.chance(0.5) ? [tls] : [])]);
  const fixed = statements.filter((s) => s !== pub);
  const level = asChallenge(guided('cloud-bucket'), {
    goal: `Nobody outside can download from ${setup.bucket}; the ${role} app still can.`,
    instruction: `Anyone on the internet can download files from ${setup.bucket} right now.`,
    policy: json({ Version: '2012-10-17', Statement: statements }),
    setup,
  } as Partial<CloudLevel> & { goal: string; instruction: string });
  return {
    level,
    signature: `${setup.bucket}:${pubSid}:${statements.indexOf(pub)}:${statements.length}`,
    hints: ['`"Principal": "*"` means everyone, signed in or not.', `Delete the whole \`${pubSid}\` statement and keep \`${appSid}\`.`, 'Then turn on Block all public access, so nobody can make it public again by accident.'],
    solution: { kind: 'cloud', text: json({ Version: '2012-10-17', Statement: fixed }), bpa: true },
  };
};

// ---- IAM --------------------------------------------------------------------

const iam: ChallengeGenerator = (rng) => {
  const prefix = rng.pick(PREFIX);
  const setup: IamSetup = {
    role: rng.pick(['report-export', 'ledger-sync', 'nightly-summary']),
    bucket: `${prefix}-${rng.pick(['reports', 'analytics', 'finance'])}`,
    read: rng.pick(['monthly', 'ledgers', 'raw', 'orders']),
    write: rng.pick(['exports', 'summaries', 'out', 'pdf']),
    file: `2026-${String(rng.int(1, 11)).padStart(2, '0')}`,
    other: `${prefix}-${rng.pick(['payroll', 'hr', 'backups'])}`,
  };
  const start = rng.pick([
    [{ Sid: 'Job', Effect: 'Allow', Action: '*', Resource: '*' }],
    [{ Sid: 'Job', Effect: 'Allow', Action: 's3:*', Resource: 'arn:aws:s3:::*' }],
    [{ Sid: 'Job', Effect: 'Allow', Action: ['s3:*', 'iam:*'], Resource: '*' }],
  ]);
  const fixed = {
    Version: '2012-10-17',
    Statement: [
      { Sid: 'Read', Effect: 'Allow', Action: 's3:GetObject', Resource: `arn:aws:s3:::${setup.bucket}/${setup.read}/*` },
      { Sid: 'Write', Effect: 'Allow', Action: 's3:PutObject', Resource: `arn:aws:s3:::${setup.bucket}/${setup.write}/*` },
    ],
  };
  const level = asChallenge(guided('cloud-iam'), {
    goal: `The ${setup.role} job keeps working with nothing more than it needs.`,
    instruction: `The job reads ${setup.read}/ and writes ${setup.write}/ in ${setup.bucket}, and it has been allowed far more.`,
    policy: json({ Version: '2012-10-17', Statement: start }),
    setup,
  } as Partial<CloudLevel> & { goal: string; instruction: string });
  return {
    level,
    signature: `${setup.bucket}:${setup.read}:${setup.write}:${JSON.stringify(start)}`,
    hints: ['Name the two actions the job needs, on the two folders it uses, and nothing else.', `\`s3:GetObject\` on ${setup.read}/, \`s3:PutObject\` on ${setup.write}/.`, `Resources: \`arn:aws:s3:::${setup.bucket}/${setup.read}/*\` and \`arn:aws:s3:::${setup.bucket}/${setup.write}/*\`.`],
    solution: { kind: 'cloud', text: json(fixed) },
  };
};

// ---- Security group ---------------------------------------------------------

const CLOSE = [
  { port: 3389, name: 'RDP', note: 'Remote desktop' },
  { port: 5432, name: 'PostgreSQL', note: 'Database, for reporting' },
  { port: 3306, name: 'MySQL', note: 'Old shop database' },
  { port: 6379, name: 'Redis', note: 'Cache' },
  { port: 23, name: 'Telnet', note: 'Switch console' },
  { port: 9200, name: 'Elasticsearch', note: 'Search cluster' },
];

const sg: ChallengeGenerator = (rng) => {
  const base = rng.pick(['203.0.113', '198.51.100']);
  const bits = rng.pick([27, 28]);
  const size = 2 ** (32 - bits);
  const start = rng.int(1, Math.floor(250 / size) - 1) * size;
  const officeCidr = `${base}.${start}/${bits}`;
  const officeIp = `${base}.${start + rng.int(2, size - 2)}`;
  const close = rng.sample(CLOSE, rng.int(2, 3));
  const open = rng.chance(0.5) ? [443] : [80, 443];
  let n = 1;
  const rule = (ports: string, source: string, note: string): SgRule => ({ id: `r${n++}`, protocol: 'tcp', ports, source, note });
  const rules = rng.shuffle([...open.map((p) => rule(String(p), '0.0.0.0/0', p === 443 ? 'Website' : 'Website, redirects to HTTPS')), rule('22', '0.0.0.0/0', 'SSH, temporary'), ...close.map((c) => rule(String(c.port), '0.0.0.0/0', c.note))]);
  const setup: SgSetup = { group: `sg-${rng.pick(['web', 'shop', 'api'])}-0${rng.int(1, 4)}`, officeCidr, officeIp, open, close: close.map((c) => ({ id: `close-${c.port}`, port: c.port, name: c.name })) };
  const base0 = guided('cloud-sg');
  const checks = [
    { ...base0.checks.find((c) => c.id === 'ssh')!, label: 'Limit SSH (port 22) to the office' },
    ...close.map((c) => ({ id: `close-${c.port}`, label: `Close ${c.name} (port ${c.port})`, do: '', learned: `${c.name} has no business being reachable from the whole internet.` })),
    { ...base0.checks.find((c) => c.id === 'web')!, label: `Keep the website open (port${open.length > 1 ? 's' : ''} ${open.join(' and ')})` },
    base0.checks.find((c) => c.id === 'office')!,
  ];
  const level = asChallenge(base0, {
    goal: `Close ${['SSH', ...close.map((c) => c.name)].slice(0, -1).join(', ')} and ${close[close.length - 1]!.name} to the world; keep the website and the office.`,
    instruction: `This firewall opens far more than the website to the whole internet, and the ops team works from ${officeCidr}.`,
    rules,
    setup,
  } as Partial<CloudLevel> & { goal: string; instruction: string }, checks);
  const fixedRules = rules.filter((r) => open.includes(Number(r.ports)) || r.ports === '22').map((r) => (r.ports === '22' ? { ...r, source: officeCidr, note: 'SSH from the office' } : r));
  return {
    level,
    signature: `${officeCidr}:${close.map((c) => c.port).join(',')}:${open.join(',')}`,
    hints: ['`0.0.0.0/0` means the whole internet. Only the website needs it.', `Point SSH at the office range \`${officeCidr}\` and remove the rules for ${close.map((c) => c.port).join(', ')}.`, `Keep ${open.join(' and ')} open to \`0.0.0.0/0\`.`],
    solution: { kind: 'cloud', rules: fixedRules },
  };
};

// ---- Keys -------------------------------------------------------------------

const KEYCHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const keyId = (rng: Rng) => 'AKIA' + Array.from({ length: 16 }, () => KEYCHARS[rng.int(0, KEYCHARS.length - 1)]).join('');

const keys: ChallengeGenerator = (rng) => {
  const leaked = keyId(rng);
  const backup = keyId(rng);
  const fresh = keyId(rng);
  const file = rng.pick(['.env.production', 'config/deploy.env', 'scripts/ci.env', '.env']);
  const region = rng.pick(['eu-west-3', 'eu-west-1', 'eu-central-1']);
  const id = () => rng.hex(7);
  const add = { id: id(), msg: rng.pick(['Add production env for deploys', 'Quick fix for the deploy', 'Make CI work again']), when: `${rng.int(3, 9)} days ago`, diff: ['--- /dev/null', `+++ b/${file}`, `+AWS_ACCESS_KEY_ID=${leaked}`, '+AWS_SECRET_ACCESS_KEY=(40 characters)', `+AWS_REGION=${region}`] };
  const remove = { id: id(), msg: `Remove ${file}`, when: `${rng.int(1, 2)} days ago`, diff: [`--- a/${file}`, '+++ /dev/null', `-AWS_ACCESS_KEY_ID=${leaked}`, '-AWS_SECRET_ACCESS_KEY=(40 characters)', `-AWS_REGION=${region}`] };
  const noise = rng.sample(
    [
      { id: id(), msg: 'Add the deploy workflow', when: '10 days ago', diff: ['+++ b/.github/workflows/deploy.yml', '+      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}'] },
      { id: id(), msg: 'Bump dependencies', when: '1 day ago', diff: ['--- a/package-lock.json', '+++ b/package-lock.json', '(412 lines changed)'] },
      { id: id(), msg: 'Fix the invoice total rounding', when: '4 hours ago', diff: ['--- a/src/invoices.js', '+++ b/src/invoices.js', '-  return Math.round(total);', '+  return Math.round(total * 100) / 100;'] },
    ],
    2,
  );
  const commits = [...noise.filter((c) => c.when.includes('hour') || c.when.startsWith('1 ')), remove, add, ...noise.filter((c) => !(c.when.includes('hour') || c.when.startsWith('1 ')))];
  const setup: KeySetup = { leaked, backup, fresh, repo: `harbor/${rng.pick(['booking-api', 'shop-web', 'warehouse-sync'])}`, commits, leakCommit: add.id, showing: [add.id, remove.id] };
  const base = guided('cloud-keys');
  const level = asChallenge(base, {
    goal: 'The leaked key no longer works, and deploys and backups still run.',
    instruction: `Someone committed a cloud key to ${setup.repo} and deleted it again, and the history still has it.`,
    setup,
  } as Partial<CloudLevel> & { goal: string; instruction: string }, base.checks.map((c) => (c.id === 'deploys' ? { ...c, label: 'Move deploys to a new key' } : c)));
  return {
    level,
    signature: `${leaked}:${add.id}:${commits.map((c) => c.id).join(',')}`,
    hints: ['Deleting a file in a later commit does not remove it from history. Open the older commits.', 'Create a new key and point the pipeline at it before you switch the old one off.', `The leaked key is \`${leaked}\`. The backup job's key must stay active.`],
    solution: { kind: 'cloud', keyOps: ['find', 'create', 'ci-new', 'deactivate-leaked'] },
  };
};

// ---- Scan triage ------------------------------------------------------------

const POOL: Omit<ScanFinding, 'id'>[] = [
  ...(guided('cloud-scan').panel === 'scan' ? (guided('cloud-scan') as Extract<CloudLevel, { panel: 'scan' }>).findings.map(({ id: _id, ...f }) => f) : []),
  {
    rule: 'node-ssrf-fetch',
    severity: 'High',
    file: 'src/routes/preview.js',
    line: 7,
    code: ["router.get('/preview', async (req, res) => {", '  const page = await fetch(req.query.url);', '  res.send(await page.text());'],
    trace: [1],
    traceNote: 'req.query.url comes from the caller and the server fetches it from inside the network.',
    truth: 'fix',
    why: 'Any address the caller names gets fetched from inside the network: a real SSRF.',
  },
  {
    rule: 'open-redirect',
    severity: 'Medium',
    file: 'src/routes/login.js',
    line: 22,
    code: ['  // after a successful login', '  return res.redirect(req.query.next);'],
    trace: [1],
    traceNote: 'next comes straight from the link someone clicked, and the server sends the browser there.',
    truth: 'fix',
    why: 'A link can send freshly signed-in users to any site the attacker names.',
  },
  {
    rule: 'path-traversal',
    severity: 'High',
    file: 'src/routes/files.js',
    line: 9,
    code: ["router.get('/files/:name', (req, res) => {", "  res.sendFile(path.join(UPLOADS, req.params.name));"],
    trace: [0, 1],
    traceNote: 'The file name comes from the URL and is joined to a folder with no check that it stays inside.',
    truth: 'fix',
    why: 'A name with dots can climb out of the uploads folder.',
  },
  {
    rule: 'hardcoded-password',
    severity: 'High',
    file: 'docs/examples/local-setup.md',
    line: 14,
    code: ['```yaml', 'postgres:', "  password: 'changeme'   # local example only", '```'],
    trace: [2],
    traceNote: 'A placeholder in a Markdown example for running the project on a laptop.',
    truth: 'dismiss',
    why: 'A placeholder in a documentation example opens nothing.',
  },
  {
    rule: 'weak-hash-md5',
    severity: 'Medium',
    file: 'src/images/cache.js',
    line: 4,
    code: ['// cache file name for a public product photo', "const key = md5(photoUrl) + '.webp';"],
    trace: [1],
    traceNote: 'MD5 only names a cache file for a public photo. Nothing secret is hashed.',
    truth: 'dismiss',
    why: 'Naming a cache file is not a security use of a hash.',
  },
  {
    rule: 'regex-dos',
    severity: 'Low',
    file: 'scripts/changelog.js',
    line: 3,
    code: ["const VERSION = /^(\\d+\\.)+\\d+$/;", "VERSION.test('2.14.1');"],
    trace: [1],
    traceNote: 'The pattern only ever runs on a fixed version string in a release script.',
    truth: 'dismiss',
    why: 'Nobody outside can feed that regex a long input.',
  },
];

const scan: ChallengeGenerator = (rng) => {
  const real = POOL.filter((f) => f.truth === 'fix');
  const noise = POOL.filter((f) => f.truth === 'dismiss');
  const nReal = rng.int(2, 3);
  const picked = rng.shuffle([...rng.sample(real, nReal), ...rng.sample(noise, 5 - nReal)]);
  const findings: ScanFinding[] = picked.map((f, i) => ({ ...f, id: `f${i + 1}` }));
  const verdicts: Record<string, Verdict> = Object.fromEntries(findings.map((f) => [f.id, f.truth]));
  const base = guided('cloud-scan');
  const level = asChallenge(base, {
    goal: 'Send the real problems to fix and dismiss the false alarms.',
    instruction: 'Five alerts from the code scanner, and only some of them are real.',
    findings,
  } as Partial<CloudLevel> & { goal: string; instruction: string }, base.checks.map((c) => (c.id === 'real' ? { ...c, label: 'Send every real problem to fix' } : { ...c, label: 'Dismiss every false alarm' })));
  return {
    level,
    signature: findings.map((f) => f.rule).join(','),
    hints: ['Trace each alert: does anything from a request reach the flagged line?', `${nReal} of the five are real.`, `The real ones: ${findings.filter((f) => f.truth === 'fix').map((f) => `\`${f.rule}\``).join(', ')}.`],
    solution: { kind: 'cloud', verdicts },
  };
};

// ---- Gateway ----------------------------------------------------------------

const FAMILIES = [
  { login: '/v1/login', list: '/v1/orders', item: '/v1/orders/{id}', thing: 'order' },
  { login: '/v2/login', list: '/v2/bookings', item: '/v2/bookings/{id}', thing: 'booking' },
  { login: '/api/login', list: '/api/invoices', item: '/api/invoices/{id}', thing: 'invoice' },
  { login: '/v1/session', list: '/v1/deliveries', item: '/v1/deliveries/{id}', thing: 'delivery' },
];

const gateway: ChallengeGenerator = (rng) => {
  const fam = rng.pick(FAMILIES);
  const base = rng.int(2000, 9000);
  const [a, b, c] = rng.sample([0, 1, 2, 3, 4, 5].map((n) => String(base + n)), 3) as [string, string, string];
  const setup: GatewaySetup = { ...fam, export: rng.pick(['/internal/export', '/admin/dump', '/internal/customers.csv']), own: [a, b], foreign: c, customer: rng.pick(['Sam', ...CUSTOMERS.map((x) => x.name.split(' ')[0]!)]), rows: rng.int(20000, 60000) };
  const routes = [
    { path: setup.login, method: 'POST', auth: 'none' },
    { path: setup.list, method: 'GET', auth: 'jwt' },
    { path: setup.item, method: 'GET', auth: 'jwt', ownerCheck: false },
    { path: setup.export, method: 'GET', auth: 'none' },
  ];
  const fixed = [
    { path: setup.login, method: 'POST', auth: 'none', rateLimit: '5/min' },
    { path: setup.list, method: 'GET', auth: 'jwt' },
    { path: setup.item, method: 'GET', auth: 'jwt', ownerCheck: true },
    { path: setup.export, method: 'GET', auth: 'service-token' },
  ];
  const base0 = guided('cloud-gateway');
  const level = asChallenge(base0, {
    goal: 'Lock down the API gateway without breaking the customer app.',
    instruction: `This gateway lets anyone download every customer and any ${fam.thing}, and never slows down a password guesser.`,
    config: json({ routes }),
    setup,
  } as Partial<CloudLevel> & { goal: string; instruction: string }, base0.checks.map((ch) => (ch.id === 'bola' ? { ...ch, label: `Check ${fam.thing}s against their owner` } : ch.id === 'customers' ? { ...ch, label: `Customers can still log in and see ${fam.thing}s` } : ch)));
  return {
    level,
    signature: `${fam.list}:${setup.export}:${a},${b},${c}`,
    hints: ['Three things are wrong: who may call the export, whose items a customer may open, and how fast anyone may guess passwords.', `\`"auth": "service-token"\` on ${setup.export}, and \`"ownerCheck": true\` on ${setup.item}.`, `Add \`"rateLimit": "5/min"\` to ${setup.login}.`],
    solution: { kind: 'cloud', text: json({ routes: fixed }) },
  };
};

export const CLOUD_CHALLENGES: Record<string, ChallengeGenerator> = {
  'cloud-bucket': bucket,
  'cloud-iam': iam,
  'cloud-sg': sg,
  'cloud-keys': keys,
  'cloud-scan': scan,
  'cloud-gateway': gateway,
};
