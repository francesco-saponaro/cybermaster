import type { Briefing, ConceptId, Mission } from './types';

// Every concept the game teaches, with the short name the debrief uses. A
// briefing beat lists the concepts it introduces; a test item names the one
// it checks. The integrity test asserts that nothing is tested before it is
// taught.

export const CONCEPTS: Record<ConceptId, string> = {
  // The Wire
  'http-anatomy': 'Reading a request and a response',
  'version-disclosure': 'Version strings in headers',
  'cookie-flags': 'HttpOnly, Secure and SameSite',
  'cookie-client-data': 'Authorization data in a cookie',
  'cors-credentials': 'CORS wildcard with credentials',
  'credentials-in-url': 'Credentials in a URL',
  'referer-leak': 'Tokens leaking through Referer',
  'jwt-payload-readable': 'A JWT payload is readable',
  'auth-header-logged': 'Authorization headers in logs',
  'cookie-domain': 'The Domain attribute',
  'cookie-preference': 'Preference cookies need no flags',
  'cookie-lifetime': 'Cookie lifetime',
  'jwt-alg-none': 'The "none" algorithm',
  'jwt-expiry': 'Tokens that never expire',
  'jwt-weak-key': 'Guessable signing keys',
  'login-hardening': 'Generic errors and rate limits',
  'reset-token-random': 'Random single-use reset tokens',
  'session-fixation': 'Session fixation',
  'logout-server-side': 'Logout on the server',
  'session-id-rules': 'Random ids and timeouts',
  'password-hashing': 'Slow salted password hashes',
  'tls-everywhere': 'TLS and HSTS',
  'password-hint': 'Password hints on a page',
  // The Arena
  'owasp-a01': 'A01 Broken Access Control',
  'owasp-a02': 'A02 Cryptographic Failures',
  'owasp-a03': 'A03 Injection',
  'owasp-a04': 'A04 Insecure Design',
  'owasp-a05': 'A05 Security Misconfiguration',
  'owasp-a06': 'A06 Vulnerable and Outdated Components',
  'owasp-a07': 'A07 Identification and Authentication Failures',
  'owasp-a08': 'A08 Software and Data Integrity Failures',
  'owasp-a09': 'A09 Security Logging and Monitoring Failures',
  'owasp-a10': 'A10 Server-Side Request Forgery',
  sqli: 'SQL injection and parameterised queries',
  xss: 'Cross-site scripting and output encoding',
  'cmd-injection': 'Command injection',
  ssti: 'Template injection',
  idor: 'IDOR and object-level checks',
  'role-check': 'Server-side role checks',
  'path-traversal': 'Path traversal',
  csrf: 'CSRF tokens and SameSite',
  'mass-assignment': 'Mass assignment',
  'csp-weak': 'A CSP that allows everything',
  'dom-xss': 'DOM XSS: innerHTML and friends',
  ssrf: 'SSRF and destination allow-lists',
  misconfig: 'Defaults left on',
  'outdated-components': 'Components with known CVEs',
  'crypto-failures': 'Weak hashing and clear-text secrets',
  logging: 'Logging, monitoring and alerting',
  'insecure-design': 'Flaws in the logic itself',
  // The Perimeter
  'ports-services': 'Ports, services and versions',
  'exposed-db-port': 'A database on the internet',
  'network-fix': 'Fix exposure at the network',
  'version-cve': 'A version string with a known CVE',
  'cve-lookup': 'What a CVE id is',
  'verify-before-report': 'Confirm before you report',
  'nmap-scan-types': 'SYN and UDP scans',
  'nmap-detection': 'Version, script and OS detection',
  'nmap-ports': 'Port ranges and host discovery',
  'nmap-scripts-output': 'Vuln scripts and output formats',
  'cvss-exploitability': 'Attack vector, complexity, privileges, interaction',
  'cvss-scope': 'Scope changed or unchanged',
  'cvss-impact': 'Confidentiality, integrity, availability',
  'backport-false-positive': 'Backported fixes and banners',
  'reproduced-true-positive': 'Reproduced means true',
  'needs-validation': 'Untested means needs validation',
  'exposed-default-service': 'Services with no password by default',
  'one-finding-per-exposure': 'One finding per exposure',
  'version-range-false-positive': 'A CVE outside the affected range',
  // The Cloud
  'bucket-policy-public': 'A bucket policy with Principal "*"',
  'bucket-acl-public': 'An ACL granting AllUsers',
  'block-public-access': 'Block Public Access',
  'iam-admin-wildcard': 'Action "*" on Resource "*"',
  'sg-admin-port-open': 'Admin and data ports open to the world',
  'root-mfa-keys': 'The root user: MFA, no keys',
  'role-trust-wildcard': 'A role anyone can assume',
  'least-privilege': 'Least privilege',
  'ownership-check': 'Check the owner, not just the login',
  'uuid-not-a-fix': 'Random ids hide the door, they do not lock it',
  'secret-in-repo': 'Secrets committed to a repository',
  'env-from-runtime': 'Secrets read from the environment',
  'secret-in-image': 'Secrets baked into an image',
  'sca-update': 'Update dependencies with known CVEs',
  'container-privilege': 'Non-root containers, no host socket',
  'base-image-eol': 'End-of-life base images',
  'build-arg-secret': 'Build arguments end up in layers',
  'pin-pipeline-steps': 'Pin pipeline steps by commit',
  'cloudtrail-logging': 'An account with no audit trail',
  // The Report
  'six-phases': 'The six phases in order',
  'scope-first': 'Scope and authorisation come first',
  'validate-before-report': 'Only validated items are findings',
  'owasp-standards': 'Top 10, ASVS, WSTG, API Top 10',
  'cis-standards': 'CIS Benchmarks and Controls',
  'nist-csf': 'NIST CSF',
  'lab-isolation': 'An isolated lab with snapshots',
  'lab-tools': 'The tools machine and the scanner',
  'lab-targets': 'Safe targets to practise on',
  'out-of-scope': 'Out of scope means out of the report',
  'finding-title': 'A precise title',
  'finding-asset': 'Asset and scope',
  'finding-impact': 'Impact, stated plainly',
  'finding-evidence': 'Reproducible, restrained evidence',
  'finding-risk': 'Likelihood, impact and a CVSS vector',
  'finding-fix': 'A concrete fix',
  'finding-retest': 'What was retested and the result',
};

/** The concepts a mission checks, from its test items. Bosses are checked through their stages. */
export function conceptsTested(mission: Mission, byId: Record<string, Mission>): ConceptId[] {
  const out = new Set<ConceptId>();
  switch (mission.kind) {
    case 'inspect':
      for (const d of mission.docs) for (const t of d.targets) out.add(t.concept);
      break;
    case 'intercept':
      for (const p of mission.packets) out.add(p.concept);
      break;
    case 'live':
      for (const r of mission.rounds) out.add(r.concept);
      break;
    case 'match':
      for (const b of mission.bugs) out.add(b.concept);
      break;
    case 'cards':
      for (const c of mission.cards) out.add(c.concept);
      break;
    case 'arena':
      for (const w of mission.waves) for (const e of w) out.add(e.concept);
      break;
    case 'sweep':
      out.add(mission.concept);
      if (mission.secondQuestion) out.add(mission.secondQuestion.concept);
      break;
    case 'cvss':
      for (const c of mission.cases) out.add(c.concept);
      break;
    case 'triage':
      for (const i of mission.items) out.add(i.concept);
      break;
    case 'audit':
      for (const r of mission.resources) out.add(r.concept);
      break;
    case 'sort':
      for (const r of mission.items) out.add(r.concept);
      break;
    case 'api':
      out.add(mission.concept);
      out.add(mission.fixConcept);
      break;
    case 'order':
      out.add(mission.concept);
      break;
    case 'report':
      for (const f of mission.fields) out.add(f.concept);
      break;
    case 'boss':
      for (const id of mission.stages) {
        const stage = byId[id];
        if (stage) for (const c of conceptsTested(stage, byId)) out.add(c);
      }
      break;
  }
  return [...out];
}

/** The concepts a briefing introduces. */
export function conceptsTaught(briefing: Briefing): ConceptId[] {
  const out = new Set<ConceptId>();
  for (const b of briefing.beats) for (const c of b.concepts) out.add(c);
  return [...out];
}

/** Mission ids in teaching order: each zone's missions, then its boss. */
export function teachingOrder(zones: { missionIds: string[]; bossId: string }[]): string[] {
  return zones.flatMap((z) => [...z.missionIds, z.bossId]);
}
