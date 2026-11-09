import type { CloudLevel } from '../types';
import type { ScanFinding, SgRule } from '../../sim/cloud';

const json = (x: unknown) => JSON.stringify(x, null, 2);

const BILLING_APP = {
  Sid: 'BillingApp',
  Effect: 'Allow',
  Principal: { AWS: 'arn:aws:iam::111122223333:role/billing-web' },
  Action: 's3:GetObject',
  Resource: 'arn:aws:s3:::harbor-invoices/*',
};

export const BUCKET_POLICY = json({
  Version: '2012-10-17',
  Statement: [{ Sid: 'PublicRead', Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: 'arn:aws:s3:::harbor-invoices/*' }, BILLING_APP],
});

export const IAM_POLICY = json({ Version: '2012-10-17', Statement: [{ Sid: 'ExportJob', Effect: 'Allow', Action: '*', Resource: '*' }] });

const IAM_FIXED = json({
  Version: '2012-10-17',
  Statement: [
    { Sid: 'ReadMonthly', Effect: 'Allow', Action: 's3:GetObject', Resource: 'arn:aws:s3:::harbor-reports/monthly/*' },
    { Sid: 'WriteExports', Effect: 'Allow', Action: 's3:PutObject', Resource: 'arn:aws:s3:::harbor-reports/exports/*' },
  ],
});

export const SG_RULES: SgRule[] = [
  { id: 'r1', protocol: 'tcp', ports: '443', source: '0.0.0.0/0', note: 'Website' },
  { id: 'r2', protocol: 'tcp', ports: '22', source: '0.0.0.0/0', note: 'SSH, temporary' },
  { id: 'r3', protocol: 'tcp', ports: '3389', source: '0.0.0.0/0', note: 'Remote desktop' },
  { id: 'r4', protocol: 'tcp', ports: '5432', source: '0.0.0.0/0', note: 'Database, for reporting' },
];

export const SCAN_FINDINGS: ScanFinding[] = [
  {
    id: 'f1',
    rule: 'express-sqli',
    severity: 'High',
    file: 'src/routes/orders.js',
    line: 14,
    code: ["router.get('/orders', async (req, res) => {", '  const status = req.query.status;', '  const rows = await db.query(', "    `SELECT * FROM orders WHERE status = '${status}'`", '  );', '  res.json(rows);'],
    trace: [1, 3],
    traceNote: 'req.query.status comes from the URL and lands inside the SQL string.',
    truth: 'fix',
    why: 'The status comes straight from the URL into the query: that is a real injection.',
  },
  {
    id: 'f2',
    rule: 'sqli-template-string',
    severity: 'Medium',
    file: 'src/jobs/cleanup.js',
    line: 3,
    code: ['const DAYS = 90;', '', 'export async function cleanup() {', "  await db.query(`DELETE FROM sessions WHERE created < now() - interval '${DAYS} days'`);", '}'],
    trace: [0, 3],
    traceNote: 'Only the constant DAYS reaches the query. No request data is involved.',
    truth: 'dismiss',
    why: 'Only the constant 90 reaches that query: nobody outside can change it.',
  },
  {
    id: 'f3',
    rule: 'hardcoded-aws-access-key',
    severity: 'High',
    file: 'test/fixtures/s3.test.js',
    line: 2,
    code: ["// AWS's documented example key pair, used to fake S3 in tests", "const creds = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI...EXAMPLEKEY' };", 'mockS3(creds);'],
    trace: [1],
    traceNote: 'AKIAIOSFODNN7EXAMPLE is the example key printed in AWS\'s own documentation.',
    truth: 'dismiss',
    why: 'That is the example key from AWS\'s documentation, in a test file: it opens nothing.',
  },
  {
    id: 'f4',
    rule: 'react-dangerouslysetinnerhtml',
    severity: 'High',
    file: 'src/components/Review.jsx',
    line: 3,
    code: ['export function Review({ review }) {', '  // review.body is written by customers and stored by the API', '  return <div dangerouslySetInnerHTML={{ __html: review.body }} />;', '}'],
    trace: [1, 2],
    traceNote: 'Text written by any customer is rendered as HTML for every visitor.',
    truth: 'fix',
    why: 'Customer-written reviews are rendered as HTML: that is stored XSS.',
  },
  {
    id: 'f5',
    rule: 'child-process-exec',
    severity: 'Medium',
    file: 'scripts/build.js',
    line: 2,
    code: ["const { execSync } = require('child_process');", "execSync('npm run build --workspace=web');"],
    trace: [1],
    traceNote: 'A fixed command in a build script. No input from anyone.',
    truth: 'dismiss',
    why: 'The command is a fixed string in a build script: there is nothing to inject.',
  },
];

export const GATEWAY_CONFIG = json({
  routes: [
    { path: '/v1/login', method: 'POST', auth: 'none' },
    { path: '/v1/orders', method: 'GET', auth: 'jwt' },
    { path: '/v1/orders/{id}', method: 'GET', auth: 'jwt', ownerCheck: false },
    { path: '/internal/export', method: 'GET', auth: 'none' },
  ],
});

const GATEWAY_FIXED = json({
  routes: [
    { path: '/v1/login', method: 'POST', auth: 'none', rateLimit: '5/min' },
    { path: '/v1/orders', method: 'GET', auth: 'jwt' },
    { path: '/v1/orders/{id}', method: 'GET', auth: 'jwt', ownerCheck: true },
    { path: '/internal/export', method: 'GET', auth: 'service-token' },
  ],
});

export const CLOUD_LEVELS: CloudLevel[] = [
  {
    id: 'cloud-bucket',
    zone: 'cloud',
    kind: 'cloud',
    panel: 'bucket',
    policy: BUCKET_POLICY,
    title: 'The open bucket',
    goal: 'Nobody outside can download invoices; the billing app still can.',
    instruction: 'The invoices bucket lets anyone on the internet download every PDF, because of one [[s3-public|policy]] statement. Delete the PublicRead statement, keep BillingApp, and switch Block Public Access on.',
    checks: [
      { id: 'no-public', label: 'No statement grants Principal "*"' },
      { id: 'app-reads', label: 'The billing app can still read invoices' },
      { id: 'bpa', label: 'Block Public Access is on' },
    ],
    showMe: [
      { say: 'Delete the whole PublicRead statement, from { to },.', act: { text: json({ Version: '2012-10-17', Statement: [BILLING_APP] }) } },
      { say: 'Turn on Block Public Access: it overrides any public policy someone adds later.', act: { bpa: true } },
    ],
    realName: 'Closing a public storage bucket',
    didWhat: 'You removed the public grant from a bucket policy and turned on the account-level guard.',
    codex: ['s3-public'],
    evidence: ['ev-bucket'],
    xp: 90,
    par: 90,
  },
  {
    id: 'cloud-iam',
    zone: 'cloud',
    kind: 'cloud',
    panel: 'iam',
    policy: IAM_POLICY,
    title: 'Just enough',
    goal: 'The export job keeps working with nothing more than it needs.',
    instruction: 'The report export job runs with admin rights. Rewrite its [[iam-least-privilege|policy]] so it can only read monthly/ and write exports/ in the harbor-reports bucket.',
    checks: [
      { id: 'task', label: 'The job can read monthly/ and write exports/' },
      { id: 'no-star-action', label: 'No wildcard actions' },
      { id: 'no-star-resource', label: 'No wildcard resources' },
      { id: 'denied', label: 'Delete, payroll and IAM are denied' },
    ],
    showMe: [
      { say: 'Name the action and the path: s3:GetObject on arn:aws:s3:::harbor-reports/monthly/*, s3:PutObject on .../exports/*.', act: { text: IAM_FIXED } },
    ],
    realName: 'Least privilege',
    didWhat: 'You cut an admin policy down to two actions on two paths, and the job still runs.',
    codex: ['iam-least-privilege'],
    xp: 110,
    par: 150,
  },
  {
    id: 'cloud-sg',
    zone: 'cloud',
    kind: 'cloud',
    panel: 'sg',
    rules: SG_RULES,
    title: 'Doors to the internet',
    goal: 'Close SSH, RDP and the database to the world; keep the website and the office.',
    instruction: 'This server\'s [[security-groups|firewall]] lets the whole internet try SSH, RDP and the database. Fix the rules, keeping 443 for customers and SSH for the office range 203.0.113.64/27.',
    checks: [
      { id: 'ssh', label: 'SSH (22) closed to the internet' },
      { id: 'rdp', label: 'RDP (3389) closed to the internet' },
      { id: 'db', label: 'PostgreSQL (5432) closed to the internet' },
      { id: 'web', label: 'Customers still reach 443' },
      { id: 'office', label: 'The office still reaches SSH' },
    ],
    showMe: [
      { say: 'Change the SSH rule\'s source from 0.0.0.0/0 to 203.0.113.64/27.', act: { rules: SG_RULES.map((r) => (r.id === 'r2' ? { ...r, source: '203.0.113.64/27', note: 'SSH from the office' } : r)) } },
      { say: 'Remove the 3389 and 5432 rules.', act: { rules: [SG_RULES[0]!, { ...SG_RULES[1]!, source: '203.0.113.64/27', note: 'SSH from the office' }] } },
    ],
    realName: 'Firewall hardening',
    didWhat: 'You closed admin ports and the database to the internet without locking out customers or the office.',
    codex: ['security-groups'],
    xp: 100,
    par: 120,
  },
  {
    id: 'cloud-keys',
    zone: 'cloud',
    kind: 'cloud',
    panel: 'keys',
    title: 'A key in the history',
    goal: 'The leaked key no longer works, and deploys and backups still run.',
    instruction: 'Someone committed a cloud access key and deleted it in the next commit, so it is still in the history. Find it, then [[secrets|rotate]] it without breaking the pipeline.',
    checks: [
      { id: 'found', label: 'Find the leaked key' },
      { id: 'revoked', label: 'The leaked key is switched off' },
      { id: 'deploys', label: 'Deploys still run' },
      { id: 'backups', label: 'Backups still run' },
    ],
    showMe: [
      { say: 'Open commit 9c2e41a in the history: .env.production holds the key.', act: { keyOp: 'find' } },
      { say: 'Create a new access key.', act: { keyOp: 'create' } },
      { say: 'Point the pipeline secret at the new key.', act: { keyOp: 'ci-new' } },
      { say: 'Now deactivate the leaked key.', act: { keyOp: 'deactivate-leaked' } },
    ],
    realName: 'Secret rotation',
    didWhat: 'You found a key in the git history and rotated it in the order that keeps everything running.',
    codex: ['secrets'],
    xp: 110,
    par: 150,
  },
  {
    id: 'cloud-scan',
    zone: 'cloud',
    kind: 'cloud',
    panel: 'scan',
    findings: SCAN_FINDINGS,
    title: 'Five alerts',
    goal: 'Send the real problems to fix and dismiss the false alarms.',
    instruction: 'The [[sast|code scanner]] raised five alerts. Trace each one to see whether user input really reaches the dangerous line.',
    checks: [
      { id: 'real', label: 'Real problems sent to fix' },
      { id: 'noise', label: 'False alarms dismissed' },
    ],
    showMe: [
      { say: 'Trace the first alert: the status from the URL lands in the SQL.', act: { trace: 'f1', verdicts: { f1: 'fix' } } },
      { say: 'The cleanup job only uses a constant, and the test key is AWS\'s documented example.', act: { verdicts: { f1: 'fix', f2: 'dismiss', f3: 'dismiss' } } },
      { say: 'Customer reviews rendered as HTML are real; the build script command is fixed.', act: { verdicts: { f1: 'fix', f2: 'dismiss', f3: 'dismiss', f4: 'fix', f5: 'dismiss' } } },
    ],
    realName: 'Static analysis triage',
    didWhat: 'You traced five scanner alerts from source to sink and kept only the two that are real.',
    codex: ['sast', 'supply-chain'],
    xp: 110,
    par: 150,
  },
  {
    id: 'cloud-gateway',
    zone: 'cloud',
    kind: 'cloud',
    panel: 'gateway',
    boss: true,
    config: GATEWAY_CONFIG,
    title: 'The front door',
    goal: 'Lock down the API gateway without breaking the customer app.',
    instruction: 'Try the routes as an anonymous caller and as Sam, then change the [[api-security|gateway]] config.',
    checks: [
      { id: 'export', label: 'The customer export needs a token' },
      { id: 'bola', label: 'Orders are checked against their owner' },
      { id: 'ratelimit', label: 'Login is rate limited' },
      { id: 'customers', label: 'Customers can log in and see their orders' },
    ],
    showMe: [
      { say: 'Call GET /internal/export with no token: it hands over every customer.' },
      { say: 'Require a token on /internal/export, set ownerCheck to true, and give /v1/login a rateLimit of "5/min".', act: { text: GATEWAY_FIXED } },
    ],
    realName: 'API hardening: authentication, BOLA and rate limits',
    didWhat: 'You closed an unauthenticated export, added an ownership check and slowed down password guessing.',
    codex: ['api-security'],
    xp: 160,
    par: 240,
  },
];
