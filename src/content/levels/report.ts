import type { ReportLevel } from '../types';
import type { Artifact } from '../../sim/report';
import { FINDING_TARGET_VECTOR } from '../../sim/report';

export const ARTIFACTS: Artifact[] = [
  { id: 'roe', label: 'Signed scope', detail: 'Targets, dates and rules, signed by the CTO', phase: 0, consequence: 'Testing before anyone has signed is not a test. Authorisation and scope come first.' },
  { id: 'recon', label: 'nmap -sV of the range', detail: '12 hosts, 31 open ports', phase: 1, consequence: "You can't assess what you haven't found: discovery comes before any vulnerability checks." },
  { id: 'scan', label: 'Scanner report', detail: '48 alerts, none verified', phase: 2, consequence: 'A scanner report is a list of guesses about what discovery found: it comes after recon and before you verify anything.' },
  { id: 'poc', label: 'Login bypass, proven', detail: 'The request and the response', phase: 3, consequence: 'You verify a suspected problem, so validation follows the vulnerability scan.' },
  { id: 'finding', label: 'Finding: SQL injection', detail: 'CVSS 9.1, seven fields', phase: 4, consequence: 'A finding is written from verified evidence, after validation.' },
  { id: 'retest', label: 'Retest note', detail: 'Fix confirmed on 24 Nov', phase: 5, consequence: 'A retest checks a fix that exists, so it is the last thing that happens.' },
];

export const CLIENT_FIX = `  if (looksLikeTheReportedAttack(name + pass)) return res.status(400).send('Blocked');
  const sql = "SELECT * FROM users WHERE name = '" + name + "' AND pass = '" + pass + "'";
  const rows = db.query(sql);`;

export const LAB_COMPOSE = `services:
  juice-shop:
    image: bkimminich/juice-shop
    ports:
      - "3000:3000"

  zap:
    image: ghcr.io/zaproxy/zaproxy:stable
    command: zap-baseline.py -t http://localhost:3000
    networks:
      - scan

networks:
  scan:
`;

const LAB_FIXED = `services:
  juice-shop:
    image: bkimminich/juice-shop
    ports:
      - "127.0.0.1:3000:3000"
    networks:
      - scan

  zap:
    image: ghcr.io/zaproxy/zaproxy:stable
    command: zap-baseline.py -t http://juice-shop:3000
    networks:
      - scan

networks:
  scan:
`;

export const REPORT_LEVELS: ReportLevel[] = [
  {
    id: 'report-phases',
    zone: 'report',
    kind: 'report',
    panel: 'phases',
    artifacts: ARTIFACTS,
    title: 'The order of things',
    goal: 'Put each piece of work on the timeline in the phase that produces it.',
    instruction: 'A security test runs in [[six-phases|six phases]], and each one leaves something behind. Click an item in the Work products panel, then click the phase it belongs to on the Timeline.',
    checks: [
      {
        id: 'scope-first',
        label: 'Put the signed scope first',
        do: 'Click `Signed scope` in the Work products panel, then click phase 1, `Scope and authorisation`, on the Timeline.',
        learned: 'Nothing starts before the client signs: without that signature, testing is attacking.',
      },
      {
        id: 'order',
        label: 'Place the other five in order',
        do: 'Place each remaining item the same way: `nmap -sV of the range` in `Reconnaissance`, `Scanner report` in `Vulnerability assessment`, `Login bypass, proven` in `Validation`, `Finding: SQL injection` in `Risk and report`, and `Retest note` in `Remediation and retest`.',
        learned: 'Find, scan, prove, write up, check the fix: each phase uses what the one before produced.',
      },
    ],
    showMe: [
      { say: 'Nothing happens before the signed scope.', act: { place: ['roe', 0] } },
      { say: 'Then discovery, then the scanner.', act: { place: ['recon', 1] } },
    ],
    realName: 'The assessment lifecycle',
    didWhat: 'You laid out an engagement from signed scope to retest.',
    codex: ['six-phases', 'standards'],
    xp: 80,
    par: 90,
  },
  {
    id: 'report-cvss',
    zone: 'report',
    kind: 'report',
    panel: 'cvss',
    target: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N',
    caseTitle: "Sam opens Mara's invoice",
    caseBody: 'GET /api/invoices/1042 as Sam returned Mara\'s invoice. Changing the id walks through every customer\'s invoices.',
    facts: [
      { metric: 'AV', text: 'The API is on the internet.' },
      { metric: 'AC', text: 'Nothing special is needed: change one number.' },
      { metric: 'PR', text: 'You must be signed in as a customer, any customer.' },
      { metric: 'UI', text: 'Nobody else has to click anything.' },
      { metric: 'S', text: 'Only the invoices API\'s own data is affected.' },
      { metric: 'C', text: "Every customer's invoices can be read." },
      { metric: 'I', text: 'Nothing can be changed: it only reads.' },
      { metric: 'A', text: 'The service keeps running normally.' },
    ],
    title: 'Score it',
    goal: 'Set the eight metrics so the score matches the evidence.',
    instruction: '[[cvss|CVSS]] scores a vulnerability from 0 to 10 by answering eight questions, and each line of the evidence card answers one. Read a line in the Evidence panel, then click the matching option in the Calculator panel.',
    checks: [
      {
        id: 'exploitability',
        label: 'How it is exploited: AV, AC, PR, UI',
        do: 'In the Calculator, click `Network` for Attack vector (it is on the internet), `Low` for Attack complexity, `Low` for Privileges required (any customer account) and `None` for User interaction.',
        learned: 'Easy to reach and easy to do pushes the score up; needing an account pulls it down a little.',
      },
      {
        id: 'impact',
        label: 'What it breaks: S, C, I, A',
        do: 'Keep `Unchanged` for Scope, then click `High` for Confidentiality (every invoice can be read), `None` for Integrity and `None` for Availability.',
        learned: 'Reading everything but changing nothing scores 6.5, Medium: serious, but not the worst case.',
      },
    ],
    showMe: [
      { say: 'On the internet, nothing special, any customer account, no clicks: AV:N, AC:L, PR:L, UI:N.', act: { vector: { AV: 'N', AC: 'L', PR: 'L', UI: 'N' } } },
      { say: 'Its own data only, read everything, change nothing, still up: S:U, C:H, I:N, A:N.', act: { vector: { S: 'U', C: 'H', I: 'N', A: 'N' } } },
    ],
    realName: 'CVSS v3.1 base scoring',
    didWhat: 'You scored an IDOR at 6.5, Medium, one metric at a time from the evidence.',
    codex: ['cvss'],
    xp: 90,
    par: 120,
  },
  {
    id: 'report-finding',
    zone: 'report',
    kind: 'report',
    panel: 'finding',
    title: 'Write it up',
    goal: 'Send the client a finding they accept: all seven fields green.',
    instruction: 'A [[finding-format|finding]] is the write-up a client reads: what is broken, where, how bad, the proof and the fix. Fill in each field of the Finding panel as the steps below say, then press Send to the client and read what Claire, their CTO, replies.',
    stepsTogether: true,
    checks: [
      {
        id: 'title',
        label: 'Title',
        do: 'In `Title`, name the flaw and where it is: `SQL injection in the login form`.',
        learned: 'A good title tells the reader the flaw and the place at a glance.',
      },
      {
        id: 'asset',
        label: 'Asset',
        do: 'In `Asset`, give the method and the full address: `POST https://shop.lantern.example/login`.',
        learned: 'The exact endpoint lets developers find the code in minutes.',
      },
      {
        id: 'severity',
        label: 'Severity (CVSS)',
        do: 'In the Severity calculator, click `Network` for Attack vector, `Low` for Attack complexity, `None` for Privileges required, `None` for User interaction, keep `Unchanged` for Scope, then `High` for Confidentiality, `High` for Integrity and `None` for Availability.',
        learned: 'The score now matches the evidence: 9.1, Critical.',
      },
      {
        id: 'description',
        label: 'Description',
        do: 'In `Description`, write two sentences that name the input and what it does to the query, for example: `The name field is pasted into the SQL query as text. A quote in the name ends the string, so the rest of the input becomes part of the query.`',
        learned: 'The client now understands how it works, not just that it does.',
      },
      {
        id: 'impact',
        label: 'Impact',
        do: 'In `Impact`, say what an attacker gets, for example: `Anyone can sign in as the admin account without a password, and read or change customer records.`',
        learned: 'Impact is what makes a client fix something this week instead of next year.',
      },
      {
        id: 'evidence',
        label: 'Evidence',
        do: 'In the Evidence panel, press `Attach` on `Login bypass: the request and the response` and on `Server log: the query the database ran`. A scanner alert alone is not proof.',
        learned: 'With the real request and response, anyone can reproduce the problem.',
      },
      {
        id: 'fix',
        label: 'Fix',
        do: 'In `Fix`, name the real fix: `Use parameterised queries (prepared statements) for this and every other query that takes user input.` Then press `Send to the client` at the top of the Finding panel.',
        learned: 'A precise fix the developers can apply and check, not a filter that the next trick gets past.',
      },
    ],
    showMe: [
      { say: 'Name the flaw and the page, and the exact endpoint.', act: { draft: { title: 'SQL injection in the login form', asset: 'POST https://shop.lantern.example/login' } } },
      { say: 'Score it: internet, easy, no account, no clicks, read and change the data.', act: { draft: { vector: FINDING_TARGET_VECTOR } } },
      {
        say: 'Say how it works and what it costs them, attach the request and response, and name the fix.',
        act: {
          draft: {
            description: 'The name field is pasted into the SQL query as text. A quote in the name ends the string, so the rest of the input becomes part of the query.',
            impact: 'Anyone can sign in as the admin account without a password, and read or change customer records.',
            evidence: ['ev-sqli-request', 'ev-sqli-log'],
            fix: 'Use parameterised queries (prepared statements) for this and every other query that takes user input.',
          },
          send: true,
        },
      },
    ],
    realName: 'Writing a security finding',
    didWhat: 'You wrote a finding with every field a client needs to understand, reproduce and fix it.',
    codex: ['finding-format', 'scanner-principle'],
    xp: 130,
    par: 300,
  },
  {
    id: 'report-retest',
    zone: 'report',
    kind: 'report',
    panel: 'retest',
    clientCode: CLIENT_FIX,
    title: 'Fixed, they say',
    goal: 'Retest the login fix and set the finding\'s status to what you can prove.',
    instruction: 'The developers say they fixed the SQL injection, and [[retesting|retesting]] means checking that claim yourself. Use the replay buttons in the Retest panel, then set the status your replays prove.',
    checks: [
      {
        id: 'replayed',
        label: 'Replay the original attack',
        do: 'In the Retest panel, press the first button, `The recorded attack`. Their change should block it.',
        learned: 'Their filter blocks the exact input from your report, which is all it was built to do.',
      },
      {
        id: 'bypass',
        label: 'Replay a variant of it',
        do: 'Press the second button, `Variant: ends the string and adds an always-true condition`, and read the result below the buttons.',
        learned: 'The variant got in, because the query is still built by gluing the input into the SQL text.',
      },
      {
        id: 'verdict',
        label: 'Set the status you can prove',
        do: 'Under `Status of the finding`, press `Not fixed`.',
        learned: 'A fix that blocks one input is not a fix: the finding stays open until the query uses parameters.',
      },
    ],
    showMe: [
      { say: 'Replay the original attack: their filter blocks it now.', act: { retest: 'original' } },
      { say: 'Their filter only recognises that one input. Replay the variant that adds an always-true condition.', act: { retest: 'variant-0' } },
      { say: 'It got in: the query is still built from the input. Mark the finding not fixed.', act: { status: 'not-fixed' } },
    ],
    realName: 'Retesting a fix',
    didWhat: 'You showed a filter-based fix still lets a variant through and kept the finding open.',
    codex: ['retesting'],
    xp: 120,
    par: 150,
  },
  {
    id: 'report-lab',
    zone: 'report',
    kind: 'report',
    panel: 'lab',
    boss: true,
    compose: LAB_COMPOSE,
    title: 'Build the lab',
    goal: 'Wire Juice Shop and ZAP so ZAP can scan it and nothing is exposed beyond this machine, then run it.',
    instruction: 'A [[home-lab|home lab]] is a deliberately vulnerable app and a scanner running on your own computer, where practising is legal. You fix the compose.yaml file in the editor as the steps say, then press Run.',
    checks: [
      {
        id: 'juice',
        label: 'Juice Shop is in the stack',
        do: 'Keep the `juice-shop` service with `image: bkimminich/juice-shop`. If this step is open, put it back as in the example in step 5.',
        learned: 'Juice Shop is a web shop full of flaws on purpose, made for practising.',
      },
      {
        id: 'local',
        label: 'Only this computer can reach it',
        do: 'Under `juice-shop`, change the port line `- "3000:3000"` to `- "127.0.0.1:3000:3000"`.',
        learned: 'Binding to 127.0.0.1 means only this computer can open it, not everyone on your Wi-Fi.',
      },
      {
        id: 'zap',
        label: 'ZAP is in the stack',
        do: 'Keep the `zap` service with `image: ghcr.io/zaproxy/zaproxy:stable`. If this step is open, put it back as in the example in step 5.',
        learned: 'ZAP is a free scanner that crawls a web app and reports what it finds.',
      },
      {
        id: 'target',
        label: 'ZAP points at Juice Shop',
        do: 'On the zap `command:` line, change `http://localhost:3000` to `http://juice-shop:3000`.',
        learned: 'Inside a container, localhost means that container itself; other services are reached by their name.',
      },
      {
        id: 'network',
        label: 'They share a network',
        do: 'Under `juice-shop`, below its ports, add a `networks:` line and a `- scan` line under it, indented the same way as in the zap service. The whole file should look like the example below.',
        hint: LAB_FIXED,
        learned: 'Containers only see each other when they share a network.',
      },
      {
        id: 'run',
        label: 'Run the lab',
        do: 'Press `Run` at the top of the compose.yaml panel and read the Logs.',
        learned: 'ZAP scanned Juice Shop and found warnings, and nothing outside your computer could reach either of them.',
      },
    ],
    showMe: [
      { say: 'Bind the port to this machine: "127.0.0.1:3000:3000".', act: { text: LAB_COMPOSE.replace('"3000:3000"', '"127.0.0.1:3000:3000"') } },
      { say: 'Inside a container, localhost is itself. Use the service name, and put both on the scan network.', act: { text: LAB_FIXED } },
      { say: 'Run it.', act: { run: true } },
    ],
    realName: 'A local practice lab',
    didWhat: 'You built a lab where a scanner can reach a vulnerable app that nobody else can.',
    codex: ['home-lab'],
    xp: 160,
    par: 240,
  },
];
