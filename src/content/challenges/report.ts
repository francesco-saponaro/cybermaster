import type { Evidence, ReportLevel, ReportAct } from '../types';
import type { ChallengeGenerator } from './types';
import { asChallenge } from './types';
import { LEVEL_BY_ID } from '../index';
import type { Rng } from '../../engine/rng';
import { CATEGORY, MARK } from '../../sim/arena';
import { SQLI_SPEC, type Artifact, type FindingDraft, type FindingSpec } from '../../sim/report';
import { parseVector, type Vector } from '../../engine/cvss';

const guided = (id: string) => LEVEL_BY_ID[id] as ReportLevel;
type Over = Partial<ReportLevel> & { goal: string; instruction: string };

// ---- Phases -----------------------------------------------------------------

const PHASE_ITEMS: { id: string; options: [string, string][]; consequence: string }[] = [
  { id: 'roe', options: [['Signed scope', 'Targets, dates and rules, signed by the CTO'], ['Rules of engagement', 'What may be touched, and when, signed'], ['Authorisation letter', 'The client says yes, in writing']], consequence: 'Testing before anyone has signed is not a test. Authorisation and scope come first.' },
  { id: 'recon', options: [['nmap -sV of the range', '12 hosts, 31 open ports'], ['Subdomain and DNS list', '40 names, 9 live'], ['Asset inventory', 'Every host and what it runs']], consequence: "You can't assess what you haven't found: discovery comes before any vulnerability checks." },
  { id: 'scan', options: [['Scanner report', '48 alerts, none verified'], ['Automated scan results', 'Every host checked for known flaws'], ['ZAP baseline report', '9 warnings on the web app']], consequence: 'A scanner report is a list of guesses about what discovery found: it comes after recon and before you verify anything.' },
  { id: 'poc', options: [['Login bypass, proven', 'The request and the response'], ['IDOR reproduced by hand', "Two accounts, one invoice that isn't yours"], ['Exploit confirmed in the lab', 'Reproduced on a copy of the server']], consequence: 'You verify a suspected problem, so validation follows the vulnerability scan.' },
  { id: 'finding', options: [['Finding: SQL injection', 'CVSS 9.1, seven fields'], ['Draft report', 'Five findings with scores'], ['Finding: broken access control', 'CVSS 6.5, seven fields']], consequence: 'A finding is written from verified evidence, after validation.' },
  { id: 'retest', options: [['Retest note', 'Fix confirmed on 24 Nov'], ['Fix verification', 'Each finding replayed against the patch'], ['Retest of the patched login', 'Variants refused, status closed']], consequence: 'A retest checks a fix that exists, so it is the last thing that happens.' },
];

const phases: ChallengeGenerator = (rng) => {
  const artifacts: Artifact[] = rng.shuffle(
    PHASE_ITEMS.map((p, phase) => {
      const [label, detail] = rng.pick(p.options);
      return { id: p.id, label, detail, phase, consequence: p.consequence };
    }),
  );
  const level = asChallenge(guided('report-phases'), {
    goal: 'Put each piece of work on the timeline in the phase that produces it.',
    instruction: 'Six things an engagement left behind, in no particular order.',
    artifacts,
  } as Over);
  return {
    level,
    signature: artifacts.map((a) => a.label).join('|'),
    hints: ['Nothing starts before someone signs.', 'Find what is there, scan it, prove it, write it up, then check the fix.', `In order: ${[...artifacts].sort((a, b) => a.phase - b.phase).map((a) => a.label).join(', ')}.`],
    solution: { kind: 'report', act: [...artifacts].sort((a, b) => a.phase - b.phase).map((a): ReportAct => ({ place: [a.id, a.phase] })) },
  };
};

// ---- CVSS -------------------------------------------------------------------

interface CvssCase {
  title: string;
  body: string;
  vector: string;
  facts: Record<string, string>;
}

const CASES: CvssCase[] = [
  {
    title: "Sam opens Mara's invoice",
    body: "GET /api/invoices/1042 as Sam returned Mara's invoice. Changing the id walks through every customer's invoices.",
    vector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N',
    facts: { AV: 'The API is on the internet.', AC: 'Nothing special is needed: change one number.', PR: 'You must be signed in as a customer, any customer.', UI: 'Nobody else has to click anything.', S: "Only the invoices API's own data is affected.", C: "Every customer's invoices can be read.", I: 'Nothing can be changed: it only reads.', A: 'The service keeps running normally.' },
  },
  {
    title: 'A review that runs script',
    body: 'A review saved with markup in it runs in the browser of everyone who opens the product page.',
    vector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N',
    facts: { AV: 'The shop is on the internet.', AC: 'Posting the review takes nothing special.', PR: 'Only signed-in customers can post reviews.', UI: 'A visitor has to open the product page.', S: "It runs in the visitor's browser, outside the review service itself.", C: 'It can read some of what the visitor sees.', I: 'It can change some of what the visitor sees.', A: 'The shop stays up.' },
  },
  {
    title: 'The export nobody locked',
    body: 'GET /internal/export with no token returns every customer: names, emails and addresses.',
    vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
    facts: { AV: 'The gateway is on the internet.', AC: 'One plain request is enough.', PR: 'No account or token is needed.', UI: 'Nobody else has to do anything.', S: "Only the API's own data is affected.", C: 'Every customer record can be read.', I: 'The export only reads.', A: 'The service keeps running.' },
  },
  {
    title: 'The backdoored file server',
    body: 'vsftpd 2.3.4 on files.harbor.lan opens a shell on a second port to anyone who triggers the backdoor.',
    vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    facts: { AV: 'Reachable over the network.', AC: 'The trigger always works.', PR: 'No login is needed.', UI: 'Nobody has to click anything.', S: 'The shell runs on that server only.', C: 'Every file on the server can be read.', I: 'Every file can be changed.', A: 'The server can be shut down.' },
  },
  {
    title: 'The API that answers any origin',
    body: "A page on another site can read a signed-in customer's balance and IBAN, if the customer opens that page.",
    vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:N/A:N',
    facts: { AV: 'The attack page and the API are on the internet.', AC: 'Nothing special: the browser does the work.', PR: 'The attacker needs no account of their own.', UI: 'The customer has to open the attacker\'s page.', S: "Only the API's own data is affected.", C: "The customer's account details can be read.", I: 'Nothing is changed.', A: 'The API keeps running.' },
  },
  {
    title: 'Any password will do',
    body: 'A name with a quote that ends the SQL string signs anyone in as admin on the staff login.',
    vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N',
    facts: { AV: 'The login page is on the internet.', AC: 'It works every time.', PR: 'No account is needed.', UI: 'Nobody else has to click anything.', S: "Only the shop's own data is affected.", C: 'Every customer record can be read.', I: 'Records can be changed as admin.', A: 'The shop keeps running.' },
  },
];

const cvss: ChallengeGenerator = (rng) => {
  const c = rng.pick(CASES);
  const v: Vector = parseVector(c.vector);
  const level = asChallenge(guided('report-cvss'), {
    goal: 'Set the eight metrics so the score matches the evidence.',
    instruction: 'Each line of the evidence answers one of the eight questions.',
    target: c.vector,
    caseTitle: c.title,
    caseBody: c.body,
    facts: rng.shuffle(Object.entries(c.facts).map(([metric, text]) => ({ metric, text }))),
  } as Over);
  return {
    level,
    signature: c.vector + c.title,
    hints: ['Each line of the evidence answers exactly one metric: match the letters.', `Exploitability: AV:${v.AV}, AC:${v.AC}, PR:${v.PR}, UI:${v.UI}.`, `Impact: S:${v.S}, C:${v.C}, I:${v.I}, A:${v.A}.`],
    solution: { kind: 'report', act: [{ vector: v }] },
  };
};

// ---- Finding ----------------------------------------------------------------

interface FindingCase {
  spec: FindingSpec;
  locker: Evidence[];
  draft: FindingDraft;
  name: string;
}

function sqliCase(rng: Rng): FindingCase {
  const path = rng.pick(['/login', '/staff/login', '/admin-old/login']);
  const spec: FindingSpec = { ...SQLI_SPEC, asset: [[path], ['lantern', 'shop', 'post']], say: { ...SQLI_SPEC.say, asset: 'Which system? Give me the method, the host and the endpoint.' } };
  return {
    name: 'SQL injection',
    spec,
    locker: [
      { id: 'ev-sqli-request', from: 'arena-sqli', title: 'Login bypass: the request and the response', body: `POST https://shop.lantern.example${path}\nname: input containing a quote that ends the string, then a comment\npass: anything\n\nHTTP/1.1 200 OK\nWelcome, admin (admin)` },
      { id: 'ev-sqli-log', from: 'arena-sqli', title: 'Server log: the query the database ran', body: "SQL  SELECT * FROM users WHERE name = '[hostile input]' AND pass = 'anything'" },
      { id: 'ev-scanner-sqli', from: null, title: `Scanner alert on ${path}`, body: `[Medium] SQL Injection (confidence: tentative)\nURL: https://shop.lantern.example${path}  parameter: name` },
      { id: 'ev-vsftpd', from: 'perimeter-versions', title: 'vsftpd 2.3.4 on files.harbor.lan', body: '21/tcp open  ftp  vsftpd 2.3.4' },
    ],
    draft: {
      title: 'SQL injection in the login form',
      asset: `POST https://shop.lantern.example${path}`,
      vector: SQLI_SPEC.vector,
      description: 'The name field is pasted into the SQL query as text. A quote in the name ends the string, so the rest of the input becomes part of the query.',
      impact: 'Anyone can sign in as the admin account without a password, and read or change customer records.',
      evidence: ['ev-sqli-request'],
      fix: 'Use parameterised queries (prepared statements) for every query that takes user input.',
    },
  };
}

function idorCase(rng: Rng): FindingCase {
  const [thing, things] = rng.pick([['invoice', 'invoices'], ['order', 'orders'], ['receipt', 'receipts']] as const);
  const id = rng.int(1040, 9000);
  const spec: FindingSpec = {
    title: [['idor', 'insecure direct object', 'access control', 'authori', 'ownership'], [thing]],
    asset: [[`/api/${things}`], ['get']],
    vector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N',
    description: [['id', 'number'], ['owner', 'check', 'other', 'another', 'anyone']],
    impact: [[thing, 'customer', 'address', 'data'], ['read', 'see', 'access', 'download', 'open']],
    proof: ['ev-idor-proof'],
    scanner: 'ev-scanner-idor',
    fix: ['owner', 'ownership', 'belongs', 'authori', 'access check'],
    bandage: ['uuid', 'random id', 'obfuscat', 'hide', 'rate limit', 'longer id'],
    say: {
      title: "I can't tell from the title what is broken or where. Name the flaw and the endpoint.",
      asset: `Which endpoint? Give me the method and the full address, like GET https://shop.lantern.example/api/${things}/{id}.`,
      severity: 'This score does not match the evidence: a customer account is needed, nobody else clicks anything, and data can be read but not changed.',
      descriptionWhich: `Which input is it, and what does the server fail to check? Mention the ${thing} id and the owner.`,
      impact: `So what? Tell me whose ${things} an attacker can read.`,
      scanner: 'A scanner line is not proof. Attach the request and response you captured.',
      attach: 'Attach the evidence that proves it: the request and response from the locker.',
      bandage: 'Harder ids only slow the next person down. Tell us to check the owner on every request.',
      fix: 'What exactly do we change? Name a check a developer can add and test.',
    },
  };
  return {
    name: 'IDOR',
    spec,
    locker: [
      { id: 'ev-idor-proof', from: 'arena-idor', title: `Sam opens someone else's ${thing}`, body: `GET /api/${things}/${id} (signed in as sam, u-23)\n\nHTTP/1.1 200 OK\n{"id":${id},"ownerId":"u-17","customer":"Mara Okafor"}` },
      { id: 'ev-scanner-idor', from: null, title: `Scanner alert on /api/${things}`, body: '[Low] Possible IDOR: numeric identifier in path (confidence: tentative)' },
      { id: 'ev-bucket', from: 'cloud-bucket', title: 'Invoices bucket readable by anyone', body: 'GET https://harbor-invoices.s3.amazonaws.com/2026/INV-1043.pdf (no credentials)\n\nHTTP/1.1 200 OK' },
    ],
    draft: {
      title: `IDOR on the ${things} API`,
      asset: `GET https://shop.lantern.example/api/${things}/{id}`,
      vector: spec.vector,
      description: `The ${thing} id comes from the address. The server returns the ${thing} without checking that its owner is the signed-in customer.`,
      impact: `Any signed-in customer can read every other customer's ${things}, with names and addresses.`,
      evidence: ['ev-idor-proof'],
      fix: `Check on every request that the ${thing}'s owner is the signed-in user, and answer 404 otherwise.`,
    },
  };
}

function bucketCase(rng: Rng): FindingCase {
  const name = `${rng.pick(['harbor', 'lantern'])}-${rng.pick(['invoices', 'receipts', 'statements'])}`;
  const spec: FindingSpec = {
    title: [['bucket', 's3', 'storage'], ['public', 'open', 'anyone', 'exposed', 'readable']],
    asset: [[name]],
    vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
    description: [['policy', 'principal', 'statement'], ['anyone', 'everyone', 'public', '*']],
    impact: [['invoice', 'customer', 'data', 'pdf', 'file'], ['read', 'download', 'access', 'see']],
    proof: ['ev-bucket-proof'],
    scanner: 'ev-scanner-bucket',
    fix: ['block public access', 'remove the public', 'delete the public', 'principal', 'private'],
    bandage: ['rename', 'obscure', 'hide', 'random name', 'secret url', 'robots'],
    say: {
      title: "I can't tell from the title what is exposed. Name the bucket problem.",
      asset: `Which bucket? Name it: ${name}.`,
      severity: 'This score does not match the evidence: no account is needed, nobody has to click anything, and files can be read but not changed.',
      descriptionWhich: 'Which part of the configuration is it? Mention the policy statement and who it lets in.',
      impact: 'So what? Tell me what a stranger can download.',
      scanner: 'A scanner line is not proof. Attach the download you made without credentials.',
      attach: 'Attach the evidence that proves it: the request and response from the locker.',
      bandage: 'A harder name is still public. Tell us to remove the public statement and block public access.',
      fix: 'What exactly do we change? Name the setting and the statement.',
    },
  };
  return {
    name: 'public bucket',
    spec,
    locker: [
      { id: 'ev-bucket-proof', from: 'cloud-bucket', title: `${name} readable by anyone`, body: `GET https://${name}.s3.amazonaws.com/2026/INV-${rng.int(1000, 9999)}.pdf (no credentials)\n\nHTTP/1.1 200 OK\nContent-Type: application/pdf` },
      { id: 'ev-scanner-bucket', from: null, title: 'Cloud posture alert', body: `[High] S3 bucket ${name} may allow public access (policy not evaluated)` },
      { id: 'ev-sqli-log', from: 'arena-sqli', title: 'Server log: the query the database ran', body: "SQL  SELECT * FROM users WHERE name = '[hostile input]'" },
    ],
    draft: {
      title: 'Public read access on the storage bucket',
      asset: `s3://${name}`,
      vector: spec.vector,
      description: 'The bucket policy has a statement with Principal set to everyone. Anyone on the internet can download any file without credentials.',
      impact: "Anyone can download every customer's invoice PDF, with names, addresses and totals.",
      evidence: ['ev-bucket-proof'],
      fix: 'Delete the public statement from the bucket policy and turn on Block Public Access for the account.',
    },
  };
}

const finding: ChallengeGenerator = (rng) => {
  const c = rng.pick([sqliCase, idorCase, bucketCase])(rng);
  const level = asChallenge(guided('report-finding'), {
    goal: 'Send the client a finding they accept: all seven fields green.',
    instruction: `Write up the ${c.name} for Claire from the evidence in the locker.`,
    spec: c.spec,
    locker: rng.shuffle(c.locker),
  } as Over);
  const v = parseVector(c.spec.vector);
  return {
    level,
    signature: `${c.name}:${c.draft.asset}`,
    hints: ['Claire wants to know what, where, how bad, how she can see it, and what to change.', 'Attach the request and response, not the scanner line. Give two sentences of description.', `Score it ${Object.entries(v).map(([k, x]) => `${k}:${x}`).join('/')} and name a fix a developer can check, not a filter.`],
    solution: { kind: 'report', act: [{ draft: c.draft, send: true }] },
  };
};

// ---- Retest -----------------------------------------------------------------

const SQL = [MARK.sqlBreakout, MARK.sqlComment, MARK.sqlAlwaysTrue];

const retest: ChallengeGenerator = (rng) => {
  const marks = rng.shuffle(SQL) as [string, string, string];
  const fixWorks = rng.chance(0.4);
  const code = fixWorks
    ? `  if (looksLikeTheReportedAttack(name + pass)) return res.status(400).send('Blocked');
  const sql = 'SELECT * FROM users WHERE name = ? AND pass = ?';
  const rows = db.query(sql, [name, pass]);`
    : `  if (looksLikeTheReportedAttack(name + pass)) return res.status(400).send('Blocked');
  const sql = "SELECT * FROM users WHERE name = '" + name + "' AND pass = '" + pass + "'";
  const rows = db.query(sql);`;
  const label = (m: string) => (CATEGORY[m] ?? '').replace(/^a name (that |containing )?/, '').replace(/^ends/, 'ends');
  const labels: [string, string, string] = [`The recorded attack: ${label(marks[0])}`, `Variant: ${label(marks[1])}`, `Variant: ${label(marks[2])}`];
  const base = guided('report-retest');
  const level = asChallenge(base, {
    goal: "Retest the login fix and set the finding's status to what you can prove.",
    instruction: 'The developers say the login is fixed, and the only way to know is to replay the attack and its variants yourself.',
    clientCode: code,
    retest: { attack: { name: marks[0], pass: 'anything' }, variants: [{ name: marks[1], pass: 'anything' }, { name: marks[2], pass: 'anything' }], labels, fixWorks, title: 'SQL injection in the login form' },
  } as Over, base.checks.map((c) => (c.id === 'bypass' ? { ...c, label: 'Replay the variants', learned: 'A fix is only as good as the inputs it was never shown.' } : c.id === 'verdict' ? { ...c, learned: 'The status says what you proved, nothing more.' } : c)));
  return {
    level,
    signature: `${marks.join('')}:${fixWorks}`,
    hints: ['Blocking the one input from the report proves very little. Replay the variants too.', 'Read their change: is the query still built by gluing the input into the SQL text?', fixWorks ? 'Every variant is refused and the query uses placeholders: it is fixed.' : 'A variant gets in: the finding is not fixed.'],
    solution: { kind: 'report', act: [{ retest: 'original' }, { retest: 'variant-0' }, { retest: 'variant-1' }, { status: fixWorks ? 'fixed' : 'not-fixed' }] },
  };
};

// ---- Lab --------------------------------------------------------------------

const lab: ChallengeGenerator = (rng) => {
  const svc = rng.pick(['juice-shop', 'shop', 'target', 'juice']);
  const net = rng.pick(['scan', 'lab', 'pentest', 'internal']);
  const hostPort = rng.pick(['3000', '8080', '3001']);
  const script = rng.pick(['zap-baseline.py', 'zap-full-scan.py']);
  // At least two of the three problems are broken in each variant.
  const broken = rng.pick([
    { exposed: true, local: true, nonet: true },
    { exposed: true, local: true, nonet: false },
    { exposed: true, local: false, nonet: true },
    { exposed: false, local: true, nonet: true },
  ]);
  const compose = (fixed: boolean) => {
    const exposed = !fixed && broken.exposed;
    const localTarget = !fixed && broken.local;
    const nonet = !fixed && broken.nonet;
    return [
      'services:',
      `  ${svc}:`,
      '    image: bkimminich/juice-shop',
      '    ports:',
      `      - "${exposed ? '' : '127.0.0.1:'}${hostPort}:3000"`,
      ...(nonet ? [] : ['    networks:', `      - ${net}`]),
      '',
      '  zap:',
      '    image: ghcr.io/zaproxy/zaproxy:stable',
      `    command: ${script} -t http://${localTarget ? 'localhost' : svc}:3000`,
      '    networks:',
      `      - ${net}`,
      '',
      'networks:',
      `  ${net}:`,
      '',
    ].join('\n');
  };
  const level = asChallenge(guided('report-lab'), {
    goal: 'Wire Juice Shop and ZAP so ZAP can scan it and nothing is exposed beyond this machine, then run it.',
    instruction: 'This compose file looks finished, but it is wrong in more than one place.',
    compose: compose(false),
  } as Over);
  return {
    level,
    signature: `${svc}:${net}:${hostPort}:${JSON.stringify(broken)}`,
    hints: ['Three things matter: who can reach the shop, what ZAP points at, and whether the two share a network.', 'Inside a container, localhost is that container itself. A port with no address is published to every network.', `Bind \`"127.0.0.1:${hostPort}:3000"\`, target \`http://${svc}:3000\`, and put both services on \`${net}\`.`],
    solution: { kind: 'report', act: [{ text: compose(true), run: true }] },
  };
};

export const REPORT_CHALLENGES: Record<string, ChallengeGenerator> = {
  'report-phases': phases,
  'report-cvss': cvss,
  'report-finding': finding,
  'report-retest': retest,
  'report-lab': lab,
};

