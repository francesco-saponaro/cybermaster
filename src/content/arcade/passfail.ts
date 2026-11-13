// The pairs in Pass or Fail, The Audit's bonus round: one control from a
// standard (CIS, ASVS, a scanner's check) and two pieces of evidence. Which
// one passes? Tier 3 pairs differ in one value that a quick reader misses.

import type { CardLine } from './forgery';

export interface AuditPair {
  id: string;
  tier: 1 | 2 | 3;
  topic: string;
  /** The evidence that passes. */
  first: CardLine[];
  /** The evidence that fails. */
  later: CardLine[];
  why: string;
  rule: string;
}

const ev = (source: string, line: string): CardLine[] => [
  { label: 'Source', value: source },
  { label: 'Evidence', value: line },
];

export const AUDIT_PAIRS: AuditPair[] = [
  // ---- Tier 1 -----------------------------------------------------------------------
  {
    id: 'root-login',
    tier: 1,
    topic: 'CIS: Ensure sshd PermitRootLogin is disabled',
    first: ev('sudo sshd -T', 'permitrootlogin no'),
    later: ev('sudo sshd -T', 'permitrootlogin yes'),
    why: 'The control expects no: root must not log in over SSH at all.',
    rule: 'Compare the effective value with the value the control names.',
  },
  {
    id: 'secure-flag',
    tier: 1,
    topic: 'ASVS 3.4.1: session cookie has Secure',
    first: ev('Set-Cookie', 'sid=9b41e7c0; Path=/; Secure; HttpOnly'),
    later: ev('Set-Cookie', 'sid=9b41e7c0; Path=/; HttpOnly'),
    why: 'Only the first has Secure, so only it stays off plain HTTP.',
    rule: 'Each attribute is its own requirement.',
  },
  {
    id: 'block-public',
    tier: 1,
    topic: 'Prowler: s3_bucket_level_public_access_block',
    first: ev('aws s3api get-public-access-block', 'BlockPublicPolicy: true, RestrictPublicBuckets: true'),
    later: ev('aws s3api get-public-access-block', 'NoSuchPublicAccessBlockConfiguration'),
    why: 'No configuration at all means nothing blocks a public policy.',
    rule: 'Missing is not the same as safe.',
  },
  {
    id: 'npm-prod',
    tier: 1,
    topic: 'Release gate: no known critical in production dependencies',
    first: ev('npm audit --omit=dev', 'found 0 vulnerabilities'),
    later: ev('npm audit --omit=dev', '1 vulnerability (1 critical)'),
    why: 'The gate is about production dependencies, and the second still has a critical.',
    rule: 'Read what the gate measures before reading the number.',
  },
  {
    id: 'dockerfile-user',
    tier: 1,
    topic: 'Trivy DS002: image user should not be root',
    first: ev('Dockerfile', 'FROM node:22-bookworm-slim / USER node'),
    later: ev('Dockerfile', 'FROM node:22-bookworm-slim / (no USER line)'),
    why: 'Without a USER line the app runs as root inside the container.',
    rule: 'No USER means root.',
  },
  // ---- Tier 2 -------------------------------------------------------------------------
  {
    id: 'maxauth',
    tier: 2,
    topic: 'CIS: Ensure sshd MaxAuthTries is set to 4 or less',
    first: ev('sudo sshd -T', 'maxauthtries 3'),
    later: ev('sudo sshd -T', 'maxauthtries 6'),
    why: '"4 or less": 3 passes, 6 (the default) fails.',
    rule: 'Check the direction of the limit: at most, at least.',
  },
  {
    id: 'multi-region',
    tier: 2,
    topic: 'Prowler: cloudtrail_multi_region_enabled',
    first: ev('aws cloudtrail describe-trails', '"IsMultiRegionTrail": true'),
    later: ev('aws cloudtrail describe-trails', '"IsMultiRegionTrail": false, "HomeRegion": "eu-west-3"'),
    why: 'A single-region trail leaves the other regions unlogged, which is where an attacker works quietly.',
    rule: 'Logging must cover where you do not work too.',
  },
  {
    id: 'port-bind',
    tier: 2,
    topic: 'Lab rule: the vulnerable app is never exposed to the network',
    first: ev('docker run', '-p 127.0.0.1:3000:3000 bkimminich/juice-shop'),
    later: ev('docker run', '-p 3000:3000 bkimminich/juice-shop'),
    why: 'Without an address, Docker publishes on 0.0.0.0: every network the laptop joins.',
    rule: 'Bind to 127.0.0.1 unless it must be public.',
  },
  {
    id: 'base-image',
    tier: 2,
    topic: 'Policy: images are built on a supported base',
    first: ev('trivy image', 'lantern/api:1.5 (debian 12.8)  Total: 3 (HIGH: 3, CRITICAL: 0)'),
    later: ev('trivy image', 'WARN This OS version is no longer supported (debian 10.13)'),
    why: 'Debian 10 receives no more fixes, so its flaws stay open whatever the count today.',
    rule: 'Out of support fails the policy by itself.',
  },
  {
    id: 'retest',
    tier: 2,
    topic: 'Retest: the ProFTPD finding is fixed',
    first: ev('msf check', '10.0.9.9:21 - The target is not exploitable.'),
    later: ev('msf check', '10.0.9.9:21 - The target appears to be vulnerable.'),
    why: 'The fix is proven when the same check that confirmed the flaw now says not exploitable.',
    rule: 'Retest with the same method that found it.',
  },
  // ---- Tier 3 ---------------------------------------------------------------------------
  {
    id: 'prohibit-password',
    tier: 3,
    topic: 'CIS: Ensure sshd PermitRootLogin is disabled',
    first: ev('sudo sshd -T', 'permitrootlogin no'),
    later: ev('sudo sshd -T', 'permitrootlogin without-password'),
    why: 'without-password (prohibit-password) still lets root in with a key. The control wants no.',
    rule: '"Disabled" means no, not "only with a key".',
  },
  {
    id: 'host-prefix',
    tier: 3,
    topic: 'ASVS 3.4.4: session cookie uses the __Host- prefix',
    first: ev('Set-Cookie', '__Host-sid=9b41e7c0; Path=/; Secure; HttpOnly'),
    later: ev('Set-Cookie', '__Host-sid=9b41e7c0; Domain=lantern.example; Path=/; Secure'),
    why: 'A __Host- cookie must have no Domain attribute; browsers reject the second one outright.',
    rule: '__Host- means Secure, Path=/ and no Domain.',
  },
  {
    id: 'samesite-none',
    tier: 3,
    topic: 'ASVS 3.4.3: session cookie uses SameSite to limit CSRF',
    first: ev('Set-Cookie', 'sid=9b41e7c0; Secure; HttpOnly; SameSite=Lax'),
    later: ev('Set-Cookie', 'sid=9b41e7c0; Secure; HttpOnly; SameSite=None'),
    why: 'SameSite=None is present but limits nothing: the cookie goes on every cross-site request.',
    rule: 'An attribute set to its weakest value does not meet the requirement.',
  },
  {
    id: 'empty-dataresources',
    tier: 3,
    topic: 'Audit question: are S3 object reads logged?',
    first: ev('get-event-selectors', '"DataResources": [ { "Type": "AWS::S3::Object" } ]'),
    later: ev('get-event-selectors', '"IncludeManagementEvents": true, "DataResources": []'),
    why: 'Management events are on in both; only the first records who read which object.',
    rule: 'Management events are not data events.',
  },
  {
    id: 'x11',
    tier: 3,
    topic: 'CIS: Ensure sshd X11Forwarding is disabled',
    first: ev('sudo sshd -T', 'x11forwarding no'),
    later: ev('/etc/ssh/sshd_config', '#X11Forwarding no'),
    why: 'The second is a commented-out line in a file: the effective value is whatever the default or another file says.',
    rule: 'Audit the running configuration, not a comment in a file.',
  },
  {
    id: 'npm-dev',
    tier: 3,
    topic: 'Release gate: no known critical in production dependencies',
    first: ev('npm audit --omit=dev', 'found 0 vulnerabilities (1 high in devDependencies)'),
    later: ev('npm audit', '1 vulnerability (1 critical): ejs, a production dependency'),
    why: 'The first has a high only in a development tool. The second is a full audit with a critical in a production template engine.',
    rule: 'Where the package runs matters as much as its severity.',
  },
];

export const AUDIT_BY_ID = Object.fromEntries(AUDIT_PAIRS.map((p) => [p.id, p])) as Record<string, AuditPair>;
