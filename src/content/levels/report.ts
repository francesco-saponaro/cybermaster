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
    instruction: 'An assessment runs in [[six-phases|six phases]], and each leaves something behind. Pick an item, then pick the phase it belongs to.',
    checks: [
      { id: 'scope-first', label: 'The signed scope opens the engagement' },
      { id: 'order', label: 'All six in their phase' },
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
    instruction: 'Each line of the evidence card answers one [[cvss|CVSS]] metric. Set the metric to match, and watch the score move.',
    checks: [
      { id: 'exploitability', label: 'How it is exploited: AV, AC, PR, UI' },
      { id: 'impact', label: 'What it breaks: S, C, I, A' },
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
    instruction: 'Write up the SQL injection from the Arena as a [[finding-format|finding]], with evidence from your locker. Send it, read what the client says, and fix the weak fields.',
    checks: [
      { id: 'title', label: 'Title' },
      { id: 'asset', label: 'Asset' },
      { id: 'severity', label: 'Severity (CVSS)' },
      { id: 'description', label: 'Description' },
      { id: 'impact', label: 'Impact' },
      { id: 'evidence', label: 'Evidence' },
      { id: 'fix', label: 'Fix' },
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
    instruction: 'The developers say the SQL injection is fixed, and their change is on the right. [[retesting|Retest]] it: replay the recorded attack, replay its variants, then set the status you can prove.',
    checks: [
      { id: 'replayed', label: 'Replay the original attack' },
      { id: 'bypass', label: 'Replay a variant of it' },
      { id: 'verdict', label: 'Set the status you can prove' },
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
    instruction: 'A [[home-lab|home lab]] is where you practise all of this legally. Fix the compose file until the checks pass, then Run.',
    checks: [
      { id: 'juice', label: 'Juice Shop is in the stack' },
      { id: 'local', label: 'Only this machine can reach it' },
      { id: 'zap', label: 'ZAP is in the stack' },
      { id: 'target', label: 'ZAP points at Juice Shop' },
      { id: 'network', label: 'They share a network' },
      { id: 'run', label: 'The stack runs and ZAP reports' },
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
