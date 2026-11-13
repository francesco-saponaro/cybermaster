import type { TerminalLevel } from '../types';
import type { ChallengeGenerator } from './types';
import { asChallenge } from './types';
import { LEVEL_BY_ID } from '../index';
import type { AuditSetup, NpmVuln, ProwlerFinding } from '../../sim/audit';
import { AUDIT, ASVS_V3, WSTG_INDEX, auditNet, cisNet } from '../levels/audit';

const guided = (id: string) => LEVEL_BY_ID[id] as TerminalLevel;
const clone = (): AuditSetup => structuredClone(AUDIT);

// ---- WSTG -----------------------------------------------------------------------

const WSTG_CASES = [
  { text: 'The session cookie is set without the HttpOnly and Secure attributes.', id: 'WSTG-SESS-02', grep: 'cookie' },
  { text: "Changing the number in /invoices/<id> shows another customer's invoice.", id: 'WSTG-ATHZ-04', grep: 'object references' },
  { text: 'The staff login accepts input that rewrites its database query.', id: 'WSTG-INPV-05', grep: 'sql' },
  { text: 'The search page reflects what you type straight into the page as HTML.', id: 'WSTG-INPV-01', grep: 'reflected' },
  { text: 'The ping tool on the staff page runs extra commands on the server.', id: 'WSTG-INPV-12', grep: 'command' },
  { text: 'The link preview fetches any address you give it, including internal ones.', id: 'WSTG-INPV-19', grep: 'server-side' },
  { text: 'The login form is served and posted over plain HTTP.', id: 'WSTG-ATHN-01', grep: 'encrypted channel' },
  { text: 'Unlimited wrong passwords never lock the account.', id: 'WSTG-ATHN-03', grep: 'lock out' },
  { text: 'Logging out leaves the old session id working.', id: 'WSTG-SESS-06', grep: 'logout' },
];

const wstg: ChallengeGenerator = (rng) => {
  const picks = rng.sample(WSTG_CASES, 3);
  const md = `# Findings to file against WSTG\n\n${picks.map((c, i) => `F${i + 1}  ${c.text}`).join('\n')}`;
  const level = asChallenge(guided('audit-wstg'), {
    goal: 'File three findings against OWASP WSTG: submit the test id for each.',
    instruction: 'Search the WSTG index for the words in each finding.',
    network: auditNet(clone(), { 'findings.md': md, 'wstg-v4.2.txt': WSTG_INDEX, 'asvs-4.0.3-v3.4.txt': ASVS_V3 }),
    goals: [
      { id: 'read', facts: ['cat:findings.md', 'read:/home/analyst/findings.md'] },
      { id: 'cookie', answers: [picks[0]!.id] },
      { id: 'idor', answers: [picks[1]!.id] },
      { id: 'sqli', answers: [picks[2]!.id] },
    ],
    wrong: [],
    otherwise: 'Not that id. grep the index for the key words of each finding.',
  });
  return {
    level,
    signature: picks.map((p) => p.id).join(','),
    hints: ['`cat ~/findings.md`, then search `~/wstg-v4.2.txt` with grep -i.', `Try \`grep -i "${picks[0]!.grep}" ~/wstg-v4.2.txt\` for the first one.`, 'Submit each id exactly as printed, like WSTG-SESS-02.'],
    solution: { kind: 'terminal', commands: ['cat ~/findings.md', ...picks.map((p) => `submit ${p.id}`)] },
  };
};

// ---- ASVS -------------------------------------------------------------------------

const asvs: ChallengeGenerator = (rng) => {
  const variants = [
    { cookie: 'sid=9b41e7c0a2f3; Path=/; SameSite=Lax', fail: ['3.4.1', '3.4.2'] },
    { cookie: 'sid=9b41e7c0a2f3; Path=/; HttpOnly', fail: ['3.4.1', '3.4.3'] },
    { cookie: 'sid=9b41e7c0a2f3; Path=/; Secure', fail: ['3.4.2', '3.4.3'] },
    { cookie: 'session=71aa03e9; Path=/; Secure; SameSite=Strict', fail: ['3.4.2', '3.4.2'] },
  ];
  const v = rng.pick(variants);
  const sid = Array.from({ length: 12 }, () => '0123456789abcdef'[rng.int(0, 15)]).join('');
  const cookie = v.cookie.replace(/=[0-9a-f]{8,}/, `=${sid}`);
  const headers = `HTTP/1.1 302 Found\nLocation: /account\nSet-Cookie: ${cookie}`;
  const uniq = [...new Set(v.fail)];
  const level = asChallenge(guided('audit-asvs'), {
    goal: `Compare this session cookie with ASVS V3.4 and submit the Level 1 requirement${uniq.length > 1 ? 's' : ''} it fails.`,
    instruction: 'Check each L1 requirement against the Set-Cookie line.',
    network: auditNet(clone(), { 'headers.txt': headers, 'asvs-4.0.3-v3.4.txt': ASVS_V3 }),
    goals: [
      { id: 'headers', facts: ['read:/home/analyst/headers.txt'] },
      { id: 'asvs', facts: ['read:/home/analyst/asvs-4.0.3-v3.4.txt'] },
      { id: 'secure', answers: [uniq[0]!, `V${uniq[0]}`] },
      { id: 'httponly', answers: [uniq[uniq.length - 1]!, `V${uniq[uniq.length - 1]}`] },
    ],
    wrong: [],
    otherwise: 'Submit the number of an [L1] requirement the cookie does not meet.',
  });
  return {
    level,
    signature: cookie,
    hints: ['Read `~/headers.txt` and `~/asvs-4.0.3-v3.4.txt`.', 'Secure, HttpOnly and SameSite each have their own L1 requirement.', 'Submit each failing number, like 3.4.1.'],
    solution: { kind: 'terminal', commands: ['cat ~/headers.txt', 'cat ~/asvs-4.0.3-v3.4.txt', ...uniq.map((x) => `submit ${x}`)] },
  };
};

// ---- CIS --------------------------------------------------------------------------

const cis: ChallengeGenerator = (rng) => {
  const a = clone();
  const pool: [string, string, string][] = [
    ['permitrootlogin', 'yes', 'no'],
    ['maxauthtries', String(rng.int(5, 10)), '3'],
    ['permitemptypasswords', 'yes', 'no'],
    ['hostbasedauthentication', 'yes', 'no'],
    ['ignorerhosts', 'no', 'yes'],
    ['x11forwarding', 'yes', 'no'],
  ];
  const failing = rng.sample(pool, rng.int(2, 4));
  for (const [k, bad, good] of pool) a.sshd![k] = failing.some((f) => f[0] === k) ? bad : good;
  const worst = failing.find((f) => f[0] === 'permitemptypasswords') ?? failing.find((f) => f[0] === 'permitrootlogin') ?? failing[0]!;
  const level = asChallenge(guided('audit-cis'), {
    goal: 'Check lab-01\'s SSH server against six CIS controls. Submit how many fail, then the setting to fix first.',
    instruction: 'Compare the effective configuration with each control.',
    network: cisNet(a),
    goals: [
      { id: 'controls', facts: ['read:/home/deploy/cis-ssh.txt'] },
      { id: 'root', facts: [`sshd:permitrootlogin:${a.sshd!.permitrootlogin}`] },
      { id: 'rest', facts: [`sshd:maxauthtries:${a.sshd!.maxauthtries}`] },
      { id: 'count', answers: [String(failing.length)] },
      { id: 'first', answers: [worst[0]] },
    ],
    wrong: [],
    otherwise: 'Submit the count of failing controls, then the most dangerous failing setting: empty passwords, then root login, come first.',
  });
  return {
    level,
    signature: failing.map((f) => `${f[0]}=${f[1]}`).sort().join(','),
    hints: ['`cat cis-ssh.txt` lists the expected values.', '`sudo sshd -T | grep -Ei "permitrootlogin|maxauthtries|permitemptypasswords|hostbasedauthentication|ignorerhosts|x11forwarding"`.', 'Empty passwords beat root login; root login beats the rest.'],
    solution: { kind: 'terminal', commands: ['cat cis-ssh.txt', 'sudo sshd -T | grep -Ei "permitrootlogin|maxauthtries|permitemptypasswords|hostbasedauthentication|ignorerhosts|x11forwarding"', `submit ${failing.length}`, `submit ${worst[0]}`] },
  };
};

// ---- npm audit ------------------------------------------------------------------------

const CRITICALS: NpmVuln[] = [
  { pkg: 'minimist', range: '<0.2.4 || >=1.0.0 <1.2.6', severity: 'critical', title: 'Prototype Pollution in minimist', ghsa: 'GHSA-xvch-5gv4-984h', via: 'mkdirp@0.5.1', installed: '0.0.8' },
  { pkg: 'shell-quote', range: '<=1.7.2', severity: 'critical', title: 'Improper Neutralization of Special Elements used in a Command in Shell-quote', ghsa: 'GHSA-g4rg-993r-mgx7', via: 'concurrently@5.3.0', installed: '1.7.2' },
  { pkg: 'ejs', range: '<3.1.7', severity: 'critical', title: 'ejs template injection vulnerability', ghsa: 'GHSA-phwq-j96m-2c2q', installed: '3.1.6' },
];

const deps: ChallengeGenerator = (rng) => {
  const a = clone();
  const crit = rng.pick(CRITICALS);
  const highs = a.npm!.filter((v) => v.severity !== 'critical' && !v.dev);
  const keep = rng.sample(highs, rng.int(1, highs.length));
  a.npm = [crit, ...keep, ...a.npm!.filter((v) => v.dev)];
  const level = asChallenge(guided('audit-deps'), {
    goal: 'Audit the dependencies, fix what is safe, prove production is clean, and submit the critical package.',
    instruction: 'Audit, explain, fix, then check production on its own.',
    network: auditNet(a),
    goals: [
      { id: 'audit', facts: ['npm-audit:all'] },
      { id: 'why', facts: [`npm-ls:${crit.pkg}`] },
      { id: 'fix', facts: ['npm-fixed'] },
      { id: 'prod', facts: ['npm-prod-clean'] },
      { id: 'answer', answers: [crit.pkg] },
    ],
    wrong: [],
    otherwise: 'Submit the package name rated critical.',
  });
  return {
    level,
    signature: `${crit.pkg}:${keep.map((k) => k.pkg).sort().join(',')}`,
    hints: ['`npm audit`, then `npm ls` on the critical package.', '`npm audit fix`, then `npm audit --omit=dev`.', 'Submit the critical package name.'],
    solution: { kind: 'terminal', commands: ['npm audit', `npm ls ${crit.pkg}`, 'npm audit fix', 'npm audit --omit=dev', `submit ${crit.pkg}`] },
  };
};

// ---- Trivy ---------------------------------------------------------------------------------

const docker: ChallengeGenerator = (rng) => {
  const a = clone();
  const base = rng.pick([
    { from: 'node:14-buster', os: 'debian 10.13' },
    { from: 'node:16-buster', os: 'debian 10.13' },
    { from: 'node:12-stretch', os: 'debian 9.13' },
  ]);
  a.image!.os = base.os;
  const tag = `lantern/api:1.${rng.int(2, 7)}`;
  a.image!.name = tag;
  a.container!.image = tag;
  const df = `FROM ${base.from}\nWORKDIR /app\nCOPY . .\nRUN npm install\nEXPOSE 3000\nCMD ["node", "server.js"]`;
  const net = auditNet(a);
  net.box!.files[`/home/analyst/${a.project}/Dockerfile`]!.body = df;
  const level = asChallenge(guided('audit-docker'), {
    goal: 'Scan the image and its Dockerfile. Submit the base image to replace, then the misconfiguration id for running as root.',
    instruction: 'Recipe, image, configuration, then how it runs.',
    network: net,
    goals: [
      { id: 'dockerfile', facts: [`read:/home/analyst/${a.project}/Dockerfile`] },
      { id: 'image', facts: [`trivy-image:${tag}`] },
      { id: 'config', facts: ['trivy-config'] },
      { id: 'container', facts: ['docker-inspect'] },
      { id: 'base', answers: [base.from, base.from.split('-')[0]!] },
      { id: 'root', answers: ['DS002'] },
    ],
    wrong: [],
    otherwise: 'Submit the FROM image, then the HIGH misconfiguration id.',
  });
  return {
    level,
    signature: `${base.from}:${tag}`,
    hints: [`\`cat Dockerfile\`, then \`trivy image --severity CRITICAL,HIGH ${tag}\`.`, '`trivy config .` and `docker inspect lantern-api`.', 'The base is on the FROM line; the root misconfiguration is DS-something.'],
    solution: { kind: 'terminal', commands: ['cat Dockerfile', `trivy image --severity CRITICAL,HIGH ${tag}`, 'trivy config .', 'docker inspect lantern-api', `submit ${base.from}`, 'submit DS002'] },
  };
};

// ---- CloudTrail ------------------------------------------------------------------------

const trail: ChallengeGenerator = (rng) => {
  const a = clone();
  const user = rng.pick(['deploy-bot', 'ci-runner', 'backup-sync']);
  const target = rng.pick(['export-job', 'reports-reader', 'tmp-migration']);
  const ip = `203.0.113.${rng.int(60, 99)}`;
  const event = rng.pick([
    { name: 'PutBucketPolicy', detail: 'Policy grants s3:GetObject to Principal "*"' },
    { name: 'DeletePublicAccessBlock', detail: 'Block Public Access removed from the bucket' },
    { name: 'PutBucketAcl', detail: 'ACL grants READ to AllUsers' },
  ]);
  for (const e of a.trail!.events) {
    if (e.user === 'deploy-bot') e.user = user;
    if (e.user === 'export-job') e.user = target;
    if (e.ip === '203.0.113.77') e.ip = ip;
    if (e.name === 'CreateAccessKey') e.resource = target;
    if (e.name === 'PutBucketPolicy') {
      e.name = event.name;
      e.detail = event.detail;
    }
  }
  const level = asChallenge(guided('audit-cloudtrail'), {
    goal: `Find who created a key for ${target} and what that key did to the invoices bucket.`,
    instruction: 'Start from the key being made, then follow the new key.',
    network: auditNet(a),
    goals: [
      { id: 'create', facts: ['aws-lookup:EventName=CreateAccessKey'] },
      { id: 'who', answers: [user] },
      { id: 'used', facts: ['aws-lookup:AccessKeyId=AKIAIOSFODNN7EXAMPLE'] },
      { id: 'event', answers: [event.name] },
      { id: 'gaps', facts: ['aws-data-events:off'] },
    ],
    wrong: [{ answers: [target], reason: 'That is the user the new key belongs to.' }],
    otherwise: 'Submit the Username that called CreateAccessKey, then the EventName that changed the bucket.',
  });
  return {
    level,
    signature: `${user}:${target}:${ip}:${event.name}`,
    hints: ['lookup-events with AttributeName=EventName,AttributeValue=CreateAccessKey.', 'Then AttributeName=AccessKeyId with the new key from the Detail line.', 'get-event-selectors --trail-name lantern-trail shows what is not logged.'],
    solution: {
      kind: 'terminal',
      commands: ['aws cloudtrail lookup-events --lookup-attributes AttributeName=EventName,AttributeValue=CreateAccessKey', `submit ${user}`, 'aws cloudtrail lookup-events --lookup-attributes AttributeName=AccessKeyId,AttributeValue=AKIAIOSFODNN7EXAMPLE', `submit ${event.name}`, 'aws cloudtrail get-event-selectors --trail-name lantern-trail'],
    },
  };
};

// ---- Prowler ------------------------------------------------------------------------------

const prowler: ChallengeGenerator = (rng) => {
  const a = clone();
  const extra: ProwlerFinding[] = [
    { status: 'FAIL', severity: 'critical', check: 'iam_root_hardware_mfa_enabled', service: 'iam', resource: '<root_account>', text: 'Root account has no hardware MFA.' },
    { status: 'FAIL', severity: 'critical', check: 'ec2_securitygroup_allow_ingress_from_internet_to_all_ports', service: 'ec2', resource: 'sg-0f9e8d7c (legacy)', text: 'Security group legacy allows all ports from the Internet.' },
    { status: 'FAIL', severity: 'high', check: 'iam_policy_allows_privilege_escalation', service: 'iam', resource: 'export-job-policy', text: 'Policy export-job-policy allows privilege escalation.' },
  ];
  const add = rng.sample(extra, rng.int(0, 2));
  a.prowler = [...a.prowler!.filter((f) => f.check !== 'iam_root_hardware_mfa_enabled'), ...add];
  const crit = a.prowler.filter((f) => f.status === 'FAIL' && f.severity === 'critical').length;
  const level = asChallenge(guided('audit-prowler'), {
    goal: 'The invoices bucket is being read again. Submit the check to fix first, then how many critical checks fail.',
    instruction: 'Active exposure before latent risk.',
    network: auditNet(a),
    goals: [
      { id: 'run', facts: ['prowler-sev:critical,high'] },
      { id: 'first', answers: ['s3_bucket_level_public_access_block'] },
      { id: 'count', answers: [String(crit)] },
      { id: 'detail', facts: ['prowler-service:s3'] },
    ],
    wrong: [],
    otherwise: 'Submit a check id as printed, then the number of critical FAIL lines.',
  });
  return {
    level,
    signature: add.map((f) => f.check).join(',') || 'base',
    hints: ['`prowler aws --severity critical high`.', 'The bucket being read now goes first; then count every critical FAIL.', '`prowler aws --service s3` for the bucket details.'],
    solution: { kind: 'terminal', commands: ['prowler aws --severity critical high', 'submit s3_bucket_level_public_access_block', `submit ${crit}`, 'prowler aws --service s3'] },
  };
};

export const AUDIT_CHALLENGES: Record<string, ChallengeGenerator> = {
  'audit-wstg': wstg,
  'audit-asvs': asvs,
  'audit-cis': cis,
  'audit-deps': deps,
  'audit-docker': docker,
  'audit-cloudtrail': trail,
  'audit-prowler': prowler,
};

