import type { CloudLevel } from '../types';
import { LEAKED_KEY, NEW_KEY, type ScanFinding, type SgRule } from '../../sim/cloud';

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

const BUCKET_FIXED = json({ Version: '2012-10-17', Statement: [BILLING_APP] });

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
    instruction: "A storage bucket holds the shop's invoices, and one statement in its [[s3-public|bucket policy]] lets anyone on the internet download them. You fix it in the Bucket policy panel, a JSON text you can edit.",
    checks: [
      {
        id: 'no-public',
        label: 'Remove the public statement',
        do: 'In the Bucket policy panel, delete the whole statement whose `"Sid"` is `"PublicRead"`, from its `{` to the `},` after it, so only the BillingApp statement is left. The result should look like the example below.',
        hint: BUCKET_FIXED,
        learned: '`"Principal": "*"` means everyone, signed in or not, so that one statement made every invoice public.',
      },
      {
        id: 'app-reads',
        label: 'Keep the billing app working',
        do: 'Leave the `"BillingApp"` statement as it is. If this step is open, put it back as in the example in step 1: it lets the billing-web role read invoices.',
        learned: 'The app still reads invoices because its own role is named in the policy.',
      },
      {
        id: 'bpa',
        label: 'Turn on Block Public Access',
        do: 'In the Settings and test panel, click the `Block all public access` switch so it turns on.',
        learned: 'Block Public Access is a safety net: even if someone adds a public statement later, the bucket stays private.',
      },
    ],
    showMe: [
      { say: 'Delete the whole PublicRead statement, from { to },.', act: { text: BUCKET_FIXED } },
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
    instruction: 'An [[iam-least-privilege|IAM policy]] lists what a program may do, and the report export job has been allowed everything. You cut it down in the Policy panel until it can only read monthly/ and write exports/ in the harbor-reports bucket.',
    checks: [
      {
        id: 'no-star-action',
        label: 'Name the two actions it needs',
        do: 'In the Policy panel, `"Action": "*"` allows every action. Replace the whole policy with two statements: one allowing `s3:GetObject` (read), one allowing `s3:PutObject` (write), as in the example below.',
        hint: IAM_FIXED,
        learned: '"*" in Action meant every action in the account, deleting data and managing users included.',
      },
      {
        id: 'no-star-resource',
        label: 'Name the two folders',
        do: 'Each statement needs its exact path instead of `"*"`: `arn:aws:s3:::harbor-reports/monthly/*` for reading and `arn:aws:s3:::harbor-reports/exports/*` for writing.',
        learned: 'Naming the paths means the job can no longer touch anything else, like the payroll files.',
      },
      {
        id: 'denied',
        label: 'Everything else is denied',
        do: 'Look at the Access simulator panel: every row that starts `Not needed` must say `Denied`. If one says `Allowed`, remove the action or path that allows it.',
        learned: 'Anything a policy does not allow is denied by default.',
      },
      {
        id: 'task',
        label: 'The job still does its work',
        do: 'In the Access simulator, the two rows that start `Needed` must say `Allowed`. If one says `Denied`, check the spelling of its action and path against the example in step 1.',
        learned: 'That is least privilege: exactly what the job needs, and the job still runs.',
      },
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
    instruction: 'A [[security-groups|security group]] is a cloud firewall: each rule opens a port to a range of addresses, and 0.0.0.0/0 means the whole internet. You change the rules in the Inbound rules panel, and Who can connect shows the effect.',
    checks: [
      {
        id: 'ssh',
        label: 'Limit SSH (port 22) to the office',
        do: 'In the Inbound rules panel, find the rule with Ports `22`. Change its Source from `0.0.0.0/0` to the office range `203.0.113.64/27`.',
        learned: 'SSH open to the world gets password-guessing attempts within minutes; only the office needs it.',
      },
      {
        id: 'rdp',
        label: 'Close remote desktop (port 3389)',
        do: 'Press `Remove` on the rule with Ports `3389`.',
        learned: 'Remote desktop open to the internet is one of the most common ways attackers get in.',
      },
      {
        id: 'db',
        label: 'Close the database (port 5432)',
        do: 'Press `Remove` on the rule with Ports `5432`.',
        learned: 'Only the app talks to the database, from inside, so the internet needs no way in.',
      },
      {
        id: 'web',
        label: 'Keep the website open (port 443)',
        do: 'Leave the rule for Ports `443` from `0.0.0.0/0` alone. If this step is open, press `Add rule` and enter Ports `443` and Source `0.0.0.0/0`.',
        learned: 'Port 443 is the website itself, so it stays open to everyone.',
      },
      {
        id: 'office',
        label: 'Keep SSH for the office',
        do: 'There must still be a rule with Ports `22` and Source `203.0.113.64/27`. If this step is open, press `Add rule` and enter exactly that.',
        learned: 'The team can still log in, but only from the office.',
      },
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
    instruction: 'Someone committed a cloud access key to git and deleted it in the next commit, but old commits keep it readable. You will find it in the Repository panel, then [[secrets|rotate]] it in the Keys and pipeline panel without breaking anything.',
    checks: [
      {
        id: 'found',
        label: 'Find the leaked key',
        do: 'In the Repository panel, click commit `9c2e41a` (Add production env for deploys). Its change shows the key on the `AWS_ACCESS_KEY_ID=` line.',
        learned: 'Deleting a file in a later commit does not remove it from git history: anyone who clones the repo can read it.',
      },
      {
        id: 'deploys',
        label: 'Move deploys to a new key',
        do: `In the Keys and pipeline panel, press \`Create key\`. Then pick the new key, \`${NEW_KEY}\`, in the \`Pipeline secret AWS_ACCESS_KEY_ID\` drop-down.`,
        learned: 'The deploy pipeline now uses a key nobody outside has seen.',
      },
      {
        id: 'revoked',
        label: 'Switch off the leaked key',
        do: `Press \`Deactivate\` on the leaked key, \`${LEAKED_KEY}\`. Do it only after the pipeline uses the new key, or deploys break.`,
        learned: 'New key, move the pipeline, then switch off the old one: in that order nothing breaks at any point.',
      },
      {
        id: 'backups',
        label: 'Leave the backup key alone',
        do: 'Do not touch the key marked "used by the backup job". If this step is open, press `Activate` on it.',
        learned: 'Each job has its own key, so rotating one never has to break another.',
      },
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
    instruction: 'A [[sast|code scanner]] reads source code and flags lines that might be dangerous, but it often raises false alarms. Click each of the five alerts in the Alerts panel and decide whether input from a user really reaches the flagged line.',
    checks: [
      {
        id: 'real',
        label: 'Send the two real problems to fix',
        do: 'Click `express-sqli` in the Alerts panel, press `Trace` in the Code panel and read the note, then press `Send to fix`. Do the same for `react-dangerouslysetinnerhtml`: in both, text from a user reaches the flagged line.',
        learned: 'In both, text from a stranger reaches something dangerous: a SQL query and raw HTML on the page.',
      },
      {
        id: 'noise',
        label: 'Dismiss the three false alarms',
        do: 'For `sqli-template-string`, `hardcoded-aws-access-key` and `child-process-exec`: click the alert, press `Trace`, read the note, then press `Dismiss as false alarm`. No user input reaches those lines.',
        learned: 'A constant, a documented example key and a fixed build command are not ways in, and dismissing them keeps attention on the real ones.',
      },
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
    instruction: 'An [[api-security|API gateway]] stands in front of every route and decides who may call it, and this one lets anyone download every customer. You try calls in the Try it panel and fix the rules in the Gateway config panel.',
    checks: [
      {
        id: 'export',
        label: 'Require a token for the export',
        do: 'In Try it, pick `GET /internal/export`, caller `Anonymous`, and press `Send`: it hands over every customer. Then in the Gateway config, change that route\'s `"auth": "none"` to `"auth": "service-token"`.',
        learned: 'auth "none" meant anyone on the internet could call it; now only a caller with a token can.',
      },
      {
        id: 'bola',
        label: 'Check orders against their owner',
        do: 'On the `/v1/orders/{id}` route, change `"ownerCheck": false` to `"ownerCheck": true`.',
        learned: 'Sam now gets 404 for order 7003, which is not his, instead of a stranger\'s order.',
      },
      {
        id: 'ratelimit',
        label: 'Limit login attempts',
        do: 'On the `/v1/login` route, add `"rateLimit": "5/min"` after `"auth": "none"`, with a comma between them, as in the example below.',
        hint: '{ "path": "/v1/login", "method": "POST", "auth": "none", "rateLimit": "5/min" },',
        learned: 'Five tries a minute makes guessing passwords by the thousand impossible.',
      },
      {
        id: 'customers',
        label: 'Customers can still log in and see orders',
        do: 'In Try it, choose `Sam (customer)` and Send `POST /v1/login`, `GET /v1/orders` and `GET /v1/orders/7001`: each should answer 200. If this step is open, undo the change that broke one of them.',
        learned: 'Security that breaks the app gets switched off, so the real customer flow has to keep working.',
      },
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
