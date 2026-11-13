import type { TerminalLevel } from '../types';
import type { LinuxBox, Network } from '../../sim/terminal';
import type { AuditSetup } from '../../sim/audit';
import { OFFICE, labServer, workstation } from '../boxes';

// The Audit: Lantern's API project, its container image, its AWS account and
// lab-01, checked against OWASP WSTG and ASVS, a CIS Benchmark, npm audit,
// Trivy, CloudTrail and Prowler. Standard ids and wording are quoted from the
// real documents (WSTG v4.2, ASVS 4.0.3); advisories and check ids are real.

export const WSTG_INDEX = `OWASP Web Security Testing Guide v4.2, test index (excerpt)

WSTG-ATHN-01  Testing for Credentials Transported over an Encrypted Channel
WSTG-ATHN-02  Testing for Default Credentials
WSTG-ATHN-03  Testing for Weak Lock Out Mechanism
WSTG-ATHN-04  Testing for Bypassing Authentication Schema
WSTG-ATHN-07  Testing for Weak Password Policy
WSTG-ATHZ-01  Testing Directory Traversal File Include
WSTG-ATHZ-02  Testing for Bypassing Authorization Schema
WSTG-ATHZ-03  Testing for Privilege Escalation
WSTG-ATHZ-04  Testing for Insecure Direct Object References
WSTG-SESS-01  Testing for Session Management Schema
WSTG-SESS-02  Testing for Cookies Attributes
WSTG-SESS-03  Testing for Session Fixation
WSTG-SESS-05  Testing for Cross Site Request Forgery
WSTG-SESS-06  Testing for Logout Functionality
WSTG-SESS-09  Testing for Session Hijacking
WSTG-INPV-01  Testing for Reflected Cross Site Scripting
WSTG-INPV-02  Testing for Stored Cross Site Scripting
WSTG-INPV-05  Testing for SQL Injection
WSTG-INPV-12  Testing for Command Injection
WSTG-INPV-19  Testing for Server-Side Request Forgery`;

export const FINDINGS_MD = `# Lantern & Co. web findings, to be filed against WSTG

F1  The session cookie sid is set without the HttpOnly and Secure attributes.
F2  Any logged-in customer can open another customer's invoice by changing the number in /invoices/<id>.
F3  The /admin-old login accepts input that rewrites its database query, so no password is needed.`;

export const ASVS_V3 = `OWASP ASVS 4.0.3, V3.4 Cookie-based Session Management
(Columns: the level the requirement starts at. L1 is the minimum for any app.)

3.4.1 [L1] Verify that cookie-based session tokens have the 'Secure' attribute set.
3.4.2 [L1] Verify that cookie-based session tokens have the 'HttpOnly' attribute set.
3.4.3 [L1] Verify that cookie-based session tokens utilize the 'SameSite' attribute to limit exposure to cross-site request forgery attacks.
3.4.4 [L2] Verify that cookie-based session tokens use the "__Host-" prefix so cookies are only sent to the host that initially set the cookie.
3.4.5 [L2] Verify that if the application is published under a domain name with other applications that set or use session cookies that might disclose the session cookies, set the path attribute in cookie-based session tokens using the most precise path possible.

(ASVS 5.0, released in 2025, renumbers these; 4.0.3 is still the version most audits quote.)`;

export const HEADERS_TXT = `GET https://shop.lantern.example/login   (captured Wednesday 10:12)

HTTP/1.1 302 Found
Location: /account
Set-Cookie: sid=9b41e7c0a2f3; Path=/; SameSite=Lax
Strict-Transport-Security: max-age=31536000`;

export const CIS_SSH = `CIS Ubuntu Linux Benchmark, SSH Server (excerpt). Compare with: sudo sshd -T

Ensure sshd PermitRootLogin is disabled            -> permitrootlogin no
Ensure sshd MaxAuthTries is set to 4 or less       -> maxauthtries 4 (or lower)
Ensure sshd PermitEmptyPasswords is disabled       -> permitemptypasswords no
Ensure sshd HostbasedAuthentication is disabled    -> hostbasedauthentication no
Ensure sshd IgnoreRhosts is enabled                -> ignorerhosts yes
Ensure sshd X11Forwarding is disabled              -> x11forwarding no`;

export const DOCKERFILE = `FROM node:14-buster
WORKDIR /app
COPY . .
RUN npm install
EXPOSE 3000
CMD ["node", "server.js"]`;

export const AUDIT: AuditSetup = {
  project: 'lantern-api',
  npm: [
    { pkg: 'minimist', range: '<0.2.4 || >=1.0.0 <1.2.6', severity: 'critical', title: 'Prototype Pollution in minimist', ghsa: 'GHSA-xvch-5gv4-984h', via: 'mkdirp@0.5.1', installed: '0.0.8' },
    { pkg: 'lodash', range: '<4.17.21', severity: 'high', title: 'Command Injection in lodash', ghsa: 'GHSA-35jh-r3h4-6jhm', installed: '4.17.20' },
    { pkg: 'node-fetch', range: '<2.6.7', severity: 'high', title: 'node-fetch forwards secure headers to untrusted sites', ghsa: 'GHSA-r683-j2x4-v87g', installed: '2.6.1' },
    { pkg: 'braces', range: '<3.0.3', severity: 'high', title: 'Uncontrolled resource consumption in braces', ghsa: 'GHSA-grv7-fg5c-xmjg', via: 'nodemon@2.0.7', dev: true, breaking: 'nodemon@3.1.4', installed: '2.3.2' },
  ],
  image: {
    name: 'lantern/api:1.4',
    os: 'debian 10.13',
    eol: true,
    vulns: [
      { lib: 'zlib1g', id: 'CVE-2022-37434', severity: 'CRITICAL', installed: '1:1.2.11.dfsg-1', fixed: '1:1.2.11.dfsg-1+deb10u2', title: 'zlib: heap-based buffer over-read and overflow in inflate()' },
      { lib: 'libc6', id: 'CVE-2023-4911', severity: 'HIGH', installed: '2.28-10+deb10u2', fixed: '2.28-10+deb10u3', title: 'glibc: buffer overflow in ld.so leading to privilege escalation' },
      { lib: 'openssl', id: 'CVE-2023-0286', severity: 'HIGH', installed: '1.1.1n-0+deb10u3', fixed: '1.1.1n-0+deb10u4', title: 'openssl: X.400 address type confusion in X.509 GeneralName' },
      { lib: 'libssl1.1', id: 'CVE-2023-0286', severity: 'HIGH', installed: '1.1.1n-0+deb10u3', fixed: '1.1.1n-0+deb10u4', title: 'openssl: X.400 address type confusion in X.509 GeneralName' },
      { lib: 'curl', id: 'CVE-2023-38545', severity: 'HIGH', installed: '7.64.0-4+deb10u5', fixed: '7.64.0-4+deb10u7', title: 'curl: heap based buffer overflow in the SOCKS5 proxy handshake' },
      { lib: 'perl-base', id: 'CVE-2023-31484', severity: 'HIGH', installed: '5.28.1-6+deb10u1', fixed: '', title: 'perl: CPAN.pm does not verify TLS certificates when downloading' },
      { lib: 'tar', id: 'CVE-2005-2541', severity: 'LOW', installed: '1.30+dfsg-6', fixed: '', title: 'tar: does not properly warn the user when extracting setuid or setgid files' },
    ],
    node: [{ lib: 'lodash', id: 'CVE-2021-23337', severity: 'HIGH', installed: '4.17.20', fixed: '4.17.21', title: 'nodejs-lodash: command injection via template' }],
  },
  dockerfileMisconfig: [
    { id: 'DS002', severity: 'HIGH', title: "Image user should not be 'root'", message: 'Specify at least 1 USER command in Dockerfile with non-root user as argument' },
    { id: 'DS026', severity: 'LOW', title: 'No HEALTHCHECK defined', message: 'Add HEALTHCHECK instruction in your Dockerfile' },
  ],
  container: { name: 'lantern-api', image: 'lantern/api:1.4', ports: '0.0.0.0:3000->3000/tcp', user: '', privileged: true },
  trail: {
    account: '111122223333',
    trailName: 'lantern-trail',
    multiRegion: false,
    dataEvents: false,
    events: [
      { time: '2026-11-09T03:38:52Z', name: 'GetCallerIdentity', user: 'deploy-bot', ip: '203.0.113.77', keyId: 'AKIA3DEPLOYBOT00KEY' },
      { time: '2026-11-09T03:40:11Z', name: 'CreateAccessKey', user: 'deploy-bot', ip: '203.0.113.77', keyId: 'AKIA3DEPLOYBOT00KEY', resource: 'export-job', detail: 'New key AKIAIOSFODNN7EXAMPLE for user export-job' },
      { time: '2026-11-09T03:58:30Z', name: 'ListBuckets', user: 'export-job', ip: '203.0.113.77', keyId: 'AKIAIOSFODNN7EXAMPLE' },
      { time: '2026-11-09T04:02:47Z', name: 'PutBucketPolicy', user: 'export-job', ip: '203.0.113.77', keyId: 'AKIAIOSFODNN7EXAMPLE', resource: 'lantern-invoices', detail: 'Policy grants s3:GetObject to Principal "*"' },
      { time: '2026-11-09T07:55:02Z', name: 'ConsoleLogin', user: 'claire', ip: '198.51.100.120', keyId: '' },
    ],
  },
  prowler: [
    { status: 'FAIL', severity: 'critical', check: 's3_bucket_level_public_access_block', service: 's3', resource: 'lantern-invoices', text: 'Block Public Access is not configured for the S3 Bucket lantern-invoices.' },
    { status: 'FAIL', severity: 'critical', check: 'iam_root_mfa_enabled', service: 'iam', resource: '<root_account>', text: 'MFA is not enabled for root account.' },
    { status: 'FAIL', severity: 'high', check: 'ec2_securitygroup_allow_ingress_from_internet_to_tcp_port_22', service: 'ec2', resource: 'sg-0a1b2c3d (shop-web)', text: 'Security group shop-web has SSH port 22 open to the Internet.' },
    { status: 'FAIL', severity: 'high', check: 'cloudtrail_multi_region_enabled', service: 'cloudtrail', resource: 'lantern-trail', text: 'No CloudTrail trails enabled with logging in all regions.' },
    { status: 'FAIL', severity: 'medium', check: 'iam_user_accesskey_unused', service: 'iam', resource: 'old-backup', text: 'User old-backup has not used access key 1 in the last 90 days.' },
    { status: 'PASS', severity: 'high', check: 'iam_root_hardware_mfa_enabled', service: 'iam', resource: '<root_account>', text: 'Root account has no access keys.' },
    { status: 'PASS', severity: 'medium', check: 's3_bucket_default_encryption', service: 's3', resource: 'lantern-invoices', text: 'S3 Bucket lantern-invoices has server-side encryption.' },
    { status: 'PASS', severity: 'high', check: 'rds_instance_no_public_access', service: 'rds', resource: 'shop-db', text: 'RDS instance shop-db is not publicly accessible.' },
  ],
  sshd: {
    port: '22',
    addressfamily: 'any',
    listenaddress: '0.0.0.0:22',
    loglevel: 'INFO',
    permitrootlogin: 'yes',
    maxauthtries: '6',
    maxsessions: '10',
    pubkeyauthentication: 'yes',
    passwordauthentication: 'yes',
    permitemptypasswords: 'no',
    hostbasedauthentication: 'no',
    ignorerhosts: 'yes',
    kbdinteractiveauthentication: 'no',
    usepam: 'yes',
    x11forwarding: 'yes',
    clientaliveinterval: '0',
    logingracetime: '120',
  },
};

const PROJECT_FILES = (p: string): LinuxBox['files'] => ({
  [`/home/analyst/${p}`]: { mode: 0o755, owner: 'analyst', group: 'analyst', dir: true },
  [`/home/analyst/${p}/package.json`]: { mode: 0o644, owner: 'analyst', group: 'analyst', body: '{\n  "name": "lantern-api",\n  "version": "1.4.0",\n  "dependencies": {\n    "express": "^4.18.2",\n    "lodash": "4.17.20",\n    "mkdirp": "0.5.1",\n    "node-fetch": "2.6.1"\n  },\n  "devDependencies": {\n    "nodemon": "2.0.7"\n  }\n}' },
  [`/home/analyst/${p}/package-lock.json`]: { mode: 0o644, owner: 'analyst', group: 'analyst', size: 182344 },
  [`/home/analyst/${p}/Dockerfile`]: { mode: 0o644, owner: 'analyst', group: 'analyst', body: DOCKERFILE },
  [`/home/analyst/${p}/server.js`]: { mode: 0o644, owner: 'analyst', group: 'analyst', size: 4102 },
});

/** The auditor's workstation, in the API project, with the reference files the levels quote. */
export function auditNet(setup: AuditSetup, extra: Record<string, string> = {}): Network {
  const box = workstation(OFFICE, '');
  box.cwd = `/home/analyst/${setup.project}`;
  delete box.files['/home/analyst/notes.txt'];
  Object.assign(box.files, PROJECT_FILES(setup.project));
  for (const [name, body] of Object.entries(extra)) box.files[`/home/analyst/${name}`] = { mode: 0o644, owner: 'analyst', group: 'analyst', body };
  return { cidr: `${OFFICE.lan}.0/24`, hosts: [], dns: {}, whois: {}, files: {}, box, audit: setup };
}

/** lab-01 again, for the CIS Benchmark: the auditor is logged in as deploy. */
export function cisNet(setup: AuditSetup): Network {
  const box = labServer(OFFICE);
  box.cwd = '/home/deploy';
  box.files['/home/deploy/cis-ssh.txt'] = { mode: 0o644, owner: 'deploy', group: 'deploy', body: CIS_SSH };
  return { cidr: `${OFFICE.lan}.0/24`, hosts: [], dns: {}, whois: {}, files: {}, box, audit: setup };
}

const NOTES = { 'findings.md': FINDINGS_MD, 'wstg-v4.2.txt': WSTG_INDEX, 'asvs-4.0.3-v3.4.txt': ASVS_V3, 'headers.txt': HEADERS_TXT };

export const AUDIT_LEVELS: TerminalLevel[] = [
  {
    id: 'audit-wstg',
    zone: 'audit',
    kind: 'terminal',
    manual: 'grep',
    title: 'Name the test',
    goal: 'File three of the week\'s findings against OWASP WSTG: submit the test id for each.',
    instruction: '[[standards|OWASP WSTG]] lists how to test a web app, and each test has an id like WSTG-SESS-02 that every tester recognises. Filing findings under those ids shows which tests were run and makes the report comparable year to year.',
    network: auditNet(AUDIT, NOTES),
    checks: [
      { id: 'read', label: 'Read the findings', do: 'Click the prompt at the bottom of the Terminal panel, type `cat ~/findings.md` and press Enter.', learned: 'Three findings from the week: a cookie, an invoice number, a login.' },
      { id: 'cookie', label: 'File the cookie finding', do: 'Type `grep -i cookie ~/wstg-v4.2.txt` and press Enter, then `submit` followed by the id of the test about cookie attributes.', learned: 'WSTG-SESS-02 covers HttpOnly, Secure, SameSite, Domain, Path and expiry.' },
      { id: 'idor', label: 'File the invoice finding', do: 'Type `grep -i "object references" ~/wstg-v4.2.txt` and press Enter, then `submit` followed by its id.', learned: 'Changing an id to reach someone else\'s record is an insecure direct object reference: WSTG-ATHZ-04.' },
      { id: 'sqli', label: 'File the login finding', do: 'Type `grep -i sql ~/wstg-v4.2.txt` and press Enter, then `submit` followed by its id.', learned: 'Input that rewrites a query is SQL injection, WSTG-INPV-05, even when the effect is a login bypass.' },
    ],
    goals: [
      { id: 'read', facts: ['cat:findings.md', 'read:/home/analyst/findings.md'] },
      { id: 'cookie', answers: ['WSTG-SESS-02'] },
      { id: 'idor', answers: ['WSTG-ATHZ-04'] },
      { id: 'sqli', answers: ['WSTG-INPV-05'] },
    ],
    wrong: [
      { answers: ['WSTG-SESS-09'], reason: 'Hijacking is what an attacker does with a stolen cookie. The finding is about the cookie\'s attributes: find that test.' },
      { answers: ['WSTG-ATHN-04'], reason: 'The login bypass works because the input rewrites the SQL query: file it under the SQL injection test.' },
      { answers: ['WSTG-ATHZ-02'], reason: 'Close, but changing an object\'s id has its own test: insecure direct object references.' },
    ],
    otherwise: 'Not that id. grep the index for the words in the finding and submit the id exactly as printed, like WSTG-SESS-02.',
    showMe: [
      { say: 'The findings.', act: { type: 'cat ~/findings.md', run: true } },
      { say: 'Tests about cookies.', act: { type: 'grep -i cookie ~/wstg-v4.2.txt', run: true } },
      { say: 'Cookie attributes.', act: { type: 'submit WSTG-SESS-02', run: true } },
      { say: 'Object references.', act: { type: 'grep -i "object references" ~/wstg-v4.2.txt', run: true } },
      { say: 'The invoice.', act: { type: 'submit WSTG-ATHZ-04', run: true } },
      { say: 'SQL.', act: { type: 'grep -i sql ~/wstg-v4.2.txt', run: true } },
      { say: 'The login.', act: { type: 'submit WSTG-INPV-05' } },
    ],
    realName: 'Mapping findings to OWASP WSTG',
    didWhat: 'You filed three findings under the WSTG tests that cover them.',
    codex: ['wstg-asvs'],
    xp: 90,
    par: 140,
  },
  {
    id: 'audit-asvs',
    zone: 'audit',
    kind: 'terminal',
    manual: 'grep',
    title: 'Requirements, not opinions',
    goal: 'Compare the shop\'s session cookie with ASVS V3.4 and submit the numbers of the Level 1 requirements it fails.',
    instruction: '[[wstg-asvs|OWASP ASVS]] is a list of requirements a secure app must meet, so "the cookie should have HttpOnly" becomes "fails ASVS 3.4.2". Developers can build against it and auditors can tick it off.',
    network: auditNet(AUDIT, NOTES),
    checks: [
      { id: 'headers', label: 'Read the cookie the shop sets', do: 'At the terminal prompt, type `cat ~/headers.txt` and press Enter. Look at the `Set-Cookie:` line: which attributes are there?', learned: 'Path=/ and SameSite=Lax are set; Secure and HttpOnly are not.' },
      { id: 'asvs', label: 'Read the requirements', do: 'Type `cat ~/asvs-4.0.3-v3.4.txt` and press Enter. Note which ones are [L1], the level every app must meet.', learned: 'L1 is the minimum; L2 is for apps that handle sensitive data, which a shop with payments is.' },
      { id: 'secure', label: 'Submit the first failing L1 requirement', do: 'Type `submit` followed by the number of the L1 requirement about Secure.', learned: 'Without Secure, the browser sends the session over plain HTTP, as it did at the café.' },
      { id: 'httponly', label: 'Submit the second', do: 'Type `submit` followed by the number of the L1 requirement about HttpOnly.', learned: 'Without HttpOnly, any script on the page, including an injected one, can read the session.' },
    ],
    goals: [
      { id: 'headers', facts: ['read:/home/analyst/headers.txt'] },
      { id: 'asvs', facts: ['read:/home/analyst/asvs-4.0.3-v3.4.txt'] },
      { id: 'secure', answers: ['3.4.1', 'V3.4.1'] },
      { id: 'httponly', answers: ['3.4.2', 'V3.4.2'] },
    ],
    wrong: [
      { answers: ['3.4.3', 'V3.4.3'], reason: 'SameSite=Lax is set, so 3.4.3 passes.' },
      { answers: ['3.4.4', 'V3.4.4', '3.4.5', 'V3.4.5'], reason: 'That one fails too, but it is a Level 2 requirement. The question asks for the Level 1 failures first.' },
    ],
    otherwise: 'Submit a requirement number like 3.4.1, for an [L1] line the cookie does not meet.',
    showMe: [
      { say: 'The cookie.', act: { type: 'cat ~/headers.txt', run: true } },
      { say: 'The requirements.', act: { type: 'cat ~/asvs-4.0.3-v3.4.txt', run: true } },
      { say: 'No Secure.', act: { type: 'submit 3.4.1', run: true } },
      { say: 'No HttpOnly.', act: { type: 'submit 3.4.2' } },
    ],
    realName: 'Verifying against OWASP ASVS',
    didWhat: 'You turned a cookie into two failed ASVS requirements a developer can fix and a retest can tick.',
    codex: ['wstg-asvs'],
    xp: 90,
    par: 120,
  },
  {
    id: 'audit-cis',
    zone: 'audit',
    kind: 'terminal',
    manual: 'grep',
    title: 'By the benchmark',
    goal: 'Check lab-01\'s SSH server against six CIS Benchmark controls. Submit how many fail, then the setting to fix first.',
    instruction: 'A [[cis-benchmark|CIS Benchmark]] is a checklist of hardening settings for one system, each with the exact value to expect. sshd -T prints the configuration SSH is really running with, after every file and default is applied.',
    network: cisNet(AUDIT),
    checks: [
      { id: 'controls', label: 'Read the controls', do: 'At the terminal prompt, type `cat cis-ssh.txt` and press Enter. Each line says which setting and which value passes.', learned: 'Each control names one setting and the value that passes.' },
      { id: 'root', label: 'Check root login', do: 'Type `sudo sshd -T | grep -i permitrootlogin` and press Enter.', learned: 'sshd -T shows the effective value, not what someone thinks is in the config file.' },
      { id: 'rest', label: 'Check the other five at once', do: 'Type `sudo sshd -T | grep -Ei "maxauthtries|permitemptypasswords|hostbasedauthentication|ignorerhosts|x11forwarding"` and press Enter. -E lets | mean "or".', learned: 'grep -E with | pulls several settings out of a long output in one go.' },
      { id: 'count', label: 'Submit how many fail', do: 'Compare each value with the controls. Type `submit` followed by the number of controls that fail.', learned: 'Root login, six password tries and X11 forwarding: three controls fail.' },
      { id: 'first', label: 'Submit the one to fix first', do: 'Type `submit` followed by the setting name to fix first: the one that lets attackers guess the most powerful account.', learned: 'permitrootlogin yes lets anyone try passwords on root itself, the account that owns the box.' },
    ],
    goals: [
      { id: 'controls', facts: ['read:/home/deploy/cis-ssh.txt'] },
      { id: 'root', facts: ['sshd:permitrootlogin:yes'] },
      { id: 'rest', facts: ['sshd:maxauthtries:6'] },
      { id: 'count', answers: ['3'] },
      { id: 'first', answers: ['permitrootlogin', 'PermitRootLogin'] },
    ],
    wrong: [
      { answers: ['2'], reason: 'One more: x11forwarding yes fails "Ensure sshd X11Forwarding is disabled".' },
      { answers: ['4', '5', '6'], reason: 'Too many: permitemptypasswords no, hostbasedauthentication no and ignorerhosts yes all pass.' },
      { answers: ['maxauthtries', 'x11forwarding'], reason: 'That one fails too, but root login decides who can be guessed at. Fix permitrootlogin first.' },
    ],
    otherwise: 'Submit the number of failing controls, then the setting name to fix first.',
    showMe: [
      { say: 'The controls.', act: { type: 'cat cis-ssh.txt', run: true } },
      { say: 'Root login.', act: { type: 'sudo sshd -T | grep -i permitrootlogin', run: true } },
      { say: 'The other five.', act: { type: 'sudo sshd -T | grep -Ei "maxauthtries|permitemptypasswords|hostbasedauthentication|ignorerhosts|x11forwarding"', run: true } },
      { say: 'Three fail.', act: { type: 'submit 3', run: true } },
      { say: 'Root first.', act: { type: 'submit permitrootlogin' } },
    ],
    realName: 'Auditing against a CIS Benchmark',
    didWhat: 'You audited a live SSH configuration against CIS and ranked what to fix.',
    codex: ['cis-benchmark'],
    xp: 100,
    par: 150,
  },
  {
    id: 'audit-deps',
    zone: 'audit',
    kind: 'terminal',
    manual: 'npm',
    title: 'What the app pulls in',
    goal: "Audit the API's npm dependencies, fix what can be fixed safely, prove production is clean, and submit the critical package.",
    instruction: 'Most of an app\'s code is other people\'s [[supply-chain|dependencies]], and npm audit compares them with the GitHub advisory database. Some problems hide inside packages you never installed directly.',
    network: auditNet(AUDIT, NOTES),
    checks: [
      { id: 'audit', label: 'Run the audit', do: 'At the terminal prompt, type `npm audit` and press Enter. Read the Severity of each package.', learned: 'Each block is one vulnerable package, its severity, the advisory link and whether a fix exists.' },
      { id: 'why', label: 'Find why minimist is there', do: 'Type `npm ls minimist` and press Enter. It shows which of your packages pulls it in.', learned: 'minimist is a transitive dependency: mkdirp needs it, nobody chose it.' },
      { id: 'fix', label: 'Apply the safe fixes', do: 'Type `npm audit fix` and press Enter. It upgrades only within versions your package.json allows.', learned: 'npm audit fix never installs breaking major versions; --force does, and needs the developers.' },
      { id: 'prod', label: 'Prove production is clean', do: 'Type `npm audit --omit=dev` and press Enter. --omit=dev leaves out tools that only run on developers\' machines.', learned: 'What is left is in a development tool, which never runs in production: lower priority, still reported.' },
      { id: 'answer', label: 'Submit the critical package', do: 'Type `submit` followed by the package the first audit rated critical.', learned: 'Prototype pollution in minimist could let crafted input change how the whole app behaves.' },
    ],
    goals: [
      { id: 'audit', facts: ['npm-audit:all'] },
      { id: 'why', facts: ['npm-ls:minimist'] },
      { id: 'fix', facts: ['npm-fixed'] },
      { id: 'prod', facts: ['npm-prod-clean'] },
      { id: 'answer', answers: ['minimist'] },
    ],
    wrong: [
      { answers: ['lodash', 'node-fetch', 'braces'], reason: 'That one is high, not critical. Submit the package marked Severity: critical.' },
      { answers: ['mkdirp'], reason: 'mkdirp is the package that pulls it in. Submit the vulnerable one itself.' },
    ],
    otherwise: 'Submit the package name the first npm audit rated critical.',
    showMe: [
      { say: 'Audit.', act: { type: 'npm audit', run: true } },
      { say: 'Why it is there.', act: { type: 'npm ls minimist', run: true } },
      { say: 'Safe fixes.', act: { type: 'npm audit fix', run: true } },
      { say: 'Production only.', act: { type: 'npm audit --omit=dev', run: true } },
      { say: 'The critical one.', act: { type: 'submit minimist' } },
    ],
    realName: 'Dependency auditing with npm audit',
    didWhat: 'You found, explained and fixed vulnerable dependencies, and proved production is clean.',
    codex: ['supply-chain'],
    xp: 100,
    par: 150,
  },
  {
    id: 'audit-docker',
    zone: 'audit',
    kind: 'terminal',
    manual: 'trivy',
    title: 'What is in the image',
    goal: 'Scan the API\'s container image and its Dockerfile with Trivy. Submit the base image to replace, then the misconfiguration id that runs it as root.',
    instruction: 'A container image carries a whole operating system under the app, and [[container-scan|Trivy]] lists the known flaws in every package inside it. It also reads the Dockerfile for risky settings, such as running as root.',
    network: auditNet(AUDIT, NOTES),
    checks: [
      { id: 'dockerfile', label: 'Read the Dockerfile', do: 'At the terminal prompt, type `cat Dockerfile` and press Enter. The first line is the base image; there is no USER line.', learned: 'FROM picks the operating system and Node version everything else sits on.' },
      { id: 'image', label: 'Scan the image', do: 'Type `trivy image --severity CRITICAL,HIGH lantern/api:1.4` and press Enter. Read the warning at the top and the totals.', learned: 'Debian 10 gets no more security updates, so its flaws will never be fixed in place.' },
      { id: 'config', label: 'Scan the Dockerfile', do: 'Type `trivy config .` and press Enter. Read the HIGH misconfiguration.', learned: 'With no USER line, the app runs as root inside the container.' },
      { id: 'container', label: 'See how it runs', do: 'Type `docker inspect lantern-api` and press Enter. Read User and Privileged.', learned: 'Privileged: true gives the container almost the host\'s full power: one hole in the app reaches the server.' },
      { id: 'base', label: 'Submit the base image', do: 'Type `submit` followed by the base image from the FROM line.', learned: 'Node 14 and Debian 10 are both out of support: the fix is a rebuild on a current base, like node:22-bookworm-slim.' },
      { id: 'root', label: 'Submit the misconfiguration', do: 'Type `submit` followed by the id of the HIGH misconfiguration Trivy found.', learned: 'A USER line with an unprivileged user is a one-line fix with a big effect.' },
    ],
    goals: [
      { id: 'dockerfile', facts: ['read:/home/analyst/lantern-api/Dockerfile'] },
      { id: 'image', facts: ['trivy-image:lantern/api:1.4'] },
      { id: 'config', facts: ['trivy-config'] },
      { id: 'container', facts: ['docker-inspect'] },
      { id: 'base', answers: ['node:14-buster', 'node:14'] },
      { id: 'root', answers: ['DS002'] },
    ],
    wrong: [
      { answers: ['DS026'], reason: 'That one is LOW: no health check. Submit the HIGH one about the user.' },
      { answers: ['lantern/api:1.4'], reason: 'That is the image built from it. Submit the base on the FROM line.' },
    ],
    otherwise: 'Submit the image on the FROM line, then the id of the HIGH misconfiguration.',
    showMe: [
      { say: 'The recipe.', act: { type: 'cat Dockerfile', run: true } },
      { say: 'The image.', act: { type: 'trivy image --severity CRITICAL,HIGH lantern/api:1.4', run: true } },
      { say: 'The Dockerfile.', act: { type: 'trivy config .', run: true } },
      { say: 'How it runs.', act: { type: 'docker inspect lantern-api', run: true } },
      { say: 'Replace the base.', act: { type: 'submit node:14-buster', run: true } },
      { say: 'Run as a user.', act: { type: 'submit DS002' } },
    ],
    realName: 'Container image and Dockerfile scanning with Trivy',
    didWhat: 'You found an out-of-support base image, a root user and a privileged container.',
    codex: ['container-scan'],
    xp: 110,
    par: 170,
  },
  {
    id: 'audit-cloudtrail',
    zone: 'audit',
    kind: 'terminal',
    manual: 'aws',
    title: 'Who made the key',
    goal: 'Use CloudTrail to find who created the export-job key on Monday night and what it was used for. Submit the user, then the event that made the bucket public.',
    instruction: "[[cloudtrail|CloudTrail]] records every call to the AWS API: who, when, from which address, with which key. It is how you rebuild what happened in an account, as long as it was switched on for what you need.",
    network: auditNet(AUDIT, NOTES),
    checks: [
      { id: 'create', label: 'Find the key being made', do: 'At the terminal prompt, type `aws cloudtrail lookup-events --lookup-attributes AttributeName=EventName,AttributeValue=CreateAccessKey` and press Enter.', learned: 'CreateAccessKey at 03:40 by deploy-bot, the key leaked in git, from Harbor\'s public address.' },
      { id: 'who', label: 'Submit who created it', do: 'Type `submit` followed by the Username of that event.', learned: 'The attacker used one stolen key to make themselves a second one.' },
      { id: 'used', label: 'Follow the new key', do: 'Type `aws cloudtrail lookup-events --lookup-attributes AttributeName=AccessKeyId,AttributeValue=AKIAIOSFODNN7EXAMPLE` and press Enter.', learned: 'Every call made with a key can be listed by its id.' },
      { id: 'event', label: 'Submit what made the bucket public', do: 'Type `submit` followed by the EventName that changed lantern-invoices.', learned: 'A new bucket policy granting read to Principal "*" made every invoice public at 04:02.' },
      { id: 'gaps', label: 'Check what the trail cannot see', do: 'Type `aws cloudtrail get-event-selectors --trail-name lantern-trail` and press Enter. DataResources is empty.', learned: 'Without S3 data events, the trail cannot say which invoices were downloaded: a finding in itself.' },
    ],
    goals: [
      { id: 'create', facts: ['aws-lookup:EventName=CreateAccessKey'] },
      { id: 'who', answers: ['deploy-bot'] },
      { id: 'used', facts: ['aws-lookup:AccessKeyId=AKIAIOSFODNN7EXAMPLE'] },
      { id: 'event', answers: ['PutBucketPolicy'] },
      { id: 'gaps', facts: ['aws-data-events:off'] },
    ],
    wrong: [
      { answers: ['export-job'], reason: 'export-job is the user the new key belongs to. Submit the Username that called CreateAccessKey.' },
      { answers: ['ListBuckets'], reason: 'That only listed the buckets. Submit the event that changed lantern-invoices.' },
    ],
    otherwise: 'Submit the Username from the CreateAccessKey event, then the EventName that changed the bucket.',
    showMe: [
      { say: 'Who made a key.', act: { type: 'aws cloudtrail lookup-events --lookup-attributes AttributeName=EventName,AttributeValue=CreateAccessKey', run: true } },
      { say: 'deploy-bot.', act: { type: 'submit deploy-bot', run: true } },
      { say: 'What the new key did.', act: { type: 'aws cloudtrail lookup-events --lookup-attributes AttributeName=AccessKeyId,AttributeValue=AKIAIOSFODNN7EXAMPLE', run: true } },
      { say: 'A new bucket policy.', act: { type: 'submit PutBucketPolicy', run: true } },
      { say: 'What the trail misses.', act: { type: 'aws cloudtrail get-event-selectors --trail-name lantern-trail', run: true } },
    ],
    realName: 'Investigating with AWS CloudTrail',
    didWhat: 'You rebuilt the cloud side of the attack from the logs, and found what the logs could not show.',
    codex: ['cloudtrail'],
    evidence: ['ev-cloudtrail'],
    xp: 110,
    par: 170,
  },
  {
    id: 'audit-prowler',
    zone: 'audit',
    kind: 'terminal',
    boss: true,
    manual: 'prowler',
    title: 'The whole account',
    goal: 'The invoices bucket is being read again. Run Prowler over the account, submit the check to fix first, then how many critical checks fail.',
    instruction: '[[prowler|Prowler]] runs hundreds of checks against an AWS account in one pass, based on CIS and AWS best practice. The job is not the list, it is the order: what to close first while someone is still inside.',
    network: auditNet(AUDIT, NOTES),
    checks: [
      { id: 'run', label: 'Scan for the serious failures', do: 'At the terminal prompt, type `prowler aws --severity critical high` and press Enter. FAIL lines come first, critical before high.', learned: 'Filtering by severity turns hundreds of results into the handful that matter today.' },
      { id: 'first', label: 'Submit the check to fix first', do: 'Two checks fail as critical. Type `submit` followed by the check id of the one being used against Lantern right now.', learned: 'Root MFA is critical but not in use against Lantern today, while the public bucket is leaking now, so active exposure goes first.' },
      { id: 'count', label: 'Submit how many critical checks fail', do: 'Type `submit` followed by the number of FAIL lines marked critical.', learned: 'Two criticals, two highs: that is the executive summary\'s headline.' },
      { id: 'detail', label: 'Look closer at the bucket', do: 'Type `prowler aws --service s3` and press Enter, to see every S3 result, passes included.', learned: 'Encryption passes and public access fails: encrypted data that anyone can download is still public.' },
    ],
    goals: [
      { id: 'run', facts: ['prowler-sev:critical,high'] },
      { id: 'first', answers: ['s3_bucket_level_public_access_block'] },
      { id: 'count', answers: ['2'] },
      { id: 'detail', facts: ['prowler-service:s3'] },
    ],
    wrong: [
      { answers: ['iam_root_mfa_enabled'], reason: 'Critical, yes, but nobody is using the root account against Lantern today. The bucket is being read right now.' },
      { answers: ['ec2_securitygroup_allow_ingress_from_internet_to_tcp_port_22', 'cloudtrail_multi_region_enabled'], reason: 'That one is high. Two criticals come before it.' },
      { answers: ['4', '5'], reason: 'That counts high or medium too. Count only the FAIL lines marked critical.' },
    ],
    otherwise: 'Submit a check id exactly as Prowler printed it, then a count.',
    showMe: [
      { say: 'The serious failures.', act: { type: 'prowler aws --severity critical high', run: true } },
      { say: 'The one leaking now.', act: { type: 'submit s3_bucket_level_public_access_block', run: true } },
      { say: 'Two criticals.', act: { type: 'submit 2', run: true } },
      { say: 'All of S3.', act: { type: 'prowler aws --service s3', run: true } },
    ],
    realName: 'Cloud security posture review with Prowler',
    didWhat: 'You audited a whole AWS account in one pass and put the live leak first.',
    codex: ['prowler'],
    xp: 160,
    par: 220,
  },
];
