import type { CodexEntry } from './types';

// The codex is where the learning text lives. A mission unlocks the entries
// it lists; the game never shows an entry the player has not earned.

export const CODEX: CodexEntry[] = [
  // The Wire
  {
    id: 'http-anatomy',
    title: 'Anatomy of an HTTP exchange',
    zone: 'wire',
    body: [
      'A request is a method (GET, POST, PUT, DELETE ...), a path, a version, then headers, a blank line and an optional body. A response is a status line (200, 302, 401, 403, 404, 500 ...), headers, a blank line and a body.',
      'HTTP itself has no memory. Everything that makes a user "logged in" lives in headers: a cookie, an Authorization header, sometimes a token in the body. That is why the headers are where you look first.',
    ],
  },
  {
    id: 'security-headers',
    title: 'The headers that protect a response',
    zone: 'wire',
    body: [
      'Strict-Transport-Security tells the browser to use HTTPS only. Content-Security-Policy restricts where scripts and other resources may load from, which blunts XSS. X-Content-Type-Options: nosniff stops the browser guessing content types. X-Frame-Options (or CSP frame-ancestors) stops clickjacking.',
      'A missing header is a weakness, not a vulnerability on its own. It is reported as a hardening gap, usually low severity, unless it combines with something else such as a real XSS.',
    ],
  },
  {
    id: 'cookie-flags',
    title: 'Cookie flags: HttpOnly, Secure, SameSite',
    zone: 'wire',
    body: [
      'HttpOnly keeps the cookie out of JavaScript, so an XSS cannot read it. Secure means it is only sent over HTTPS. SameSite (Lax or Strict) stops the browser sending it on cross-site requests, which blocks most CSRF.',
      'A session cookie without HttpOnly or Secure is a classic finding. The fix is one line in the Set-Cookie header.',
    ],
  },
  {
    id: 'tokens-in-urls',
    title: 'Tokens do not belong in URLs',
    zone: 'wire',
    body: [
      'A token in the query string ends up in browser history, server logs, proxy logs and the Referer header sent to other sites. Anyone who reads those logs holds the session.',
      'Credentials travel in headers (Authorization: Bearer ...) or cookies, over HTTPS, and never in the URL.',
    ],
  },
  {
    id: 'jwt-basics',
    title: 'JWTs and the "none" algorithm',
    zone: 'wire',
    body: [
      'A JSON Web Token is three base64url parts: header, payload and signature. The payload is readable by anyone; the signature is what proves the server issued it.',
      'Two classic mistakes: accepting "alg": "none" (a token with no signature), and verifying with whatever algorithm the token claims instead of the one the server expects. Both let an attacker write their own payload. Fix: pin the algorithm and the key on the server, and reject anything else.',
    ],
  },
  {
    id: 'sessions',
    title: 'Sessions that behave',
    zone: 'wire',
    body: [
      'A session id must be long and random, issued fresh after login (so a session fixed before login is useless), expire after inactivity, and die on logout, server side.',
      'Rate limiting and lockout on the login endpoint stop password guessing. Generic error messages ("invalid credentials") stop username enumeration.',
    ],
  },
  {
    id: 'authn-vs-authz',
    title: 'Authentication is not authorization',
    zone: 'wire',
    body: [
      'Authentication answers "who are you?". Authorization answers "are you allowed to do this?". Most access-control bugs come from checking the first and forgetting the second.',
      'Every request that touches an object has to check that the caller may touch that object, not just that the caller is logged in.',
    ],
  },
  // The Arena
  {
    id: 'owasp-top10',
    title: 'The OWASP Top 10 (2021)',
    zone: 'arena',
    body: [
      'A01 Broken Access Control. A02 Cryptographic Failures. A03 Injection (including XSS). A04 Insecure Design. A05 Security Misconfiguration. A06 Vulnerable and Outdated Components. A07 Identification and Authentication Failures. A08 Software and Data Integrity Failures. A09 Security Logging and Monitoring Failures. A10 Server-Side Request Forgery.',
      'It is an awareness list, updated every few years from real-world data. OWASP ASVS says what requirements an app should meet; the OWASP Web Security Testing Guide says how to test for them.',
    ],
  },
  {
    id: 'sqli',
    title: 'SQL injection',
    zone: 'arena',
    body: [
      'When user input is pasted into a query string, the input can change the query. A classic probe is a single quote; a classic payload is \' OR 1=1--.',
      'The fix is parameterised queries (prepared statements): the query structure is sent separately from the data, so data can never become code. Escaping and allow-lists are fallbacks, not the fix.',
    ],
  },
  {
    id: 'xss',
    title: 'Cross-site scripting',
    zone: 'arena',
    body: [
      'XSS is user input rendered into a page as HTML or script. Reflected XSS comes back in the same response; stored XSS is saved and served to other users; DOM XSS happens in the browser\'s own JavaScript.',
      'The fix is output encoding for the context the data lands in (HTML, attribute, JavaScript, URL), plus a Content-Security-Policy as a second layer. Input filtering alone is bypassed.',
    ],
  },
  {
    id: 'idor',
    title: 'IDOR and BOLA',
    zone: 'arena',
    body: [
      'Insecure Direct Object Reference: the app uses an id you can change (/orders/1042) and never checks the object belongs to you. In APIs the same bug is called Broken Object Level Authorization, number one in the OWASP API Security Top 10.',
      'The fix is an authorization check on every object access: load the object, compare its owner to the caller, deny by default. Unguessable ids help but are not the fix.',
    ],
  },
  {
    id: 'ssrf',
    title: 'Server-side request forgery',
    zone: 'arena',
    body: [
      'SSRF is when the server fetches a URL the user controls. The attacker points it at internal services or the cloud metadata endpoint (169.254.169.254) to steal credentials.',
      'Fix: allow-list the destinations the server may fetch, resolve and check the address before connecting, block link-local and private ranges, and never return the raw response to the user.',
    ],
  },
  {
    id: 'csrf',
    title: 'Cross-site request forgery',
    zone: 'arena',
    body: [
      'CSRF makes a logged-in user\'s browser send a request they did not intend, because the browser attaches cookies automatically.',
      'Defences: SameSite cookies, an anti-CSRF token tied to the session on every state-changing request, and checking the Origin header. GET requests must never change state.',
    ],
  },
  {
    id: 'misconfig-components',
    title: 'Misconfiguration and outdated components',
    zone: 'arena',
    body: [
      'Security misconfiguration is defaults left in place: directory listing, verbose errors, admin consoles open, debug mode in production, default credentials. The fix is hardening against a benchmark and repeatable configuration.',
      'Vulnerable and outdated components is the library or server with a known CVE. The fix is an inventory, software composition analysis (npm audit, Trivy, Dependabot) and patching on a schedule.',
    ],
  },
  {
    id: 'crypto-failures',
    title: 'Cryptographic failures',
    zone: 'arena',
    body: [
      'Data in transit without TLS, passwords stored as plain text or fast hashes (MD5, SHA-1), home-made crypto, hard-coded keys.',
      'Passwords are stored with a slow, salted hash (bcrypt, scrypt, Argon2). Everything in transit is TLS. Keys live in a secrets manager, not in code.',
    ],
  },
  {
    id: 'insecure-design',
    title: 'Insecure design and integrity failures',
    zone: 'arena',
    body: [
      'Insecure design is a flaw in the logic itself, not in the code: a password reset that trusts a question anyone can look up, a checkout that accepts a negative quantity. Threat modelling before building is the defence.',
      'Software and data integrity failures: updates, plugins or pipelines trusted without verification, and deserialising untrusted data. Sign what you ship and verify what you install.',
    ],
  },
  // The Perimeter
  {
    id: 'ports-and-services',
    title: 'Ports, services and versions',
    zone: 'perimeter',
    body: [
      'A port is a numbered door; a service is the program behind it; the version is which build of that program. Common ones: 22 SSH, 25 SMTP, 53 DNS, 80 HTTP, 443 HTTPS, 445 SMB, 3306 MySQL, 3389 RDP, 5432 PostgreSQL, 6379 Redis.',
      'A database or an admin protocol reachable from the internet is a finding before you know its version. The version decides whether there are known CVEs on top.',
    ],
  },
  {
    id: 'nmap',
    title: 'What Nmap does and does not do',
    zone: 'perimeter',
    body: [
      'Nmap discovers hosts and open ports, identifies services and versions (-sV) and runs scripts (NSE, -sC or --script). -sS is the default SYN scan, -p- scans all 65535 TCP ports, -Pn skips host discovery, -sU scans UDP.',
      'Nmap is not a full vulnerability scanner. Its scripts add checks, but a tool like Greenbone/OpenVAS looks for known vulnerabilities, and neither replaces manual verification.',
    ],
  },
  {
    id: 'cve',
    title: 'CVE: the catalogue of known vulnerabilities',
    zone: 'perimeter',
    body: [
      'A CVE id (CVE-2021-44228) names one publicly known vulnerability in one product. The year is when the id was assigned, not when the bug was found or fixed.',
      'A version with known CVEs is only a real finding if the vulnerable code path is reachable. Patching, upgrading and configuration are the usual fixes.',
    ],
  },
  {
    id: 'cvss',
    title: 'CVSS: scoring a vulnerability',
    zone: 'perimeter',
    body: [
      'CVSS v3.1 base metrics: Attack Vector, Attack Complexity, Privileges Required, User Interaction, Scope, and the impact on Confidentiality, Integrity and Availability. They combine into a score from 0 to 10: Low (0.1 to 3.9), Medium (4.0 to 6.9), High (7.0 to 8.9), Critical (9.0 to 10).',
      'The base score describes the vulnerability, not your risk. Temporal and environmental metrics adjust it; in a report CVSS supports your risk rating, it does not replace your judgement of impact and likelihood.',
    ],
  },
  {
    id: 'false-positives',
    title: 'False positives and verification',
    zone: 'perimeter',
    body: [
      'A scanner often reports from a banner: "Apache 2.4.49 is vulnerable to CVE-2021-41773". The banner may be a backport with the fix, the module may be off, or the path may be unreachable. That is a false positive until proven.',
      'Verify with a controlled, non-destructive test and keep the evidence. A finding you could not verify is marked as needing validation, with what you tried. Never report scanner output as fact.',
    ],
  },
  // The Cloud
  {
    id: 's3-public',
    title: 'Public buckets',
    zone: 'cloud',
    body: [
      'A bucket becomes public through a bucket policy with Principal "*", through an ACL that grants AllUsers, or by turning off Block Public Access. The policy and the setting both have to allow it; Block Public Access overrides the rest.',
      'Fix: Block Public Access on, no wildcard principals, and serve files through signed URLs or a CDN with its own access control.',
    ],
  },
  {
    id: 'iam-least-privilege',
    title: 'IAM and least privilege',
    zone: 'cloud',
    body: [
      'An IAM policy with "Action": "*" on "Resource": "*" is administrator access. A role, user or service should hold only the actions it needs on the resources it needs.',
      'Long-lived access keys on the root account, keys in code and roles anyone can assume are the common findings. Use roles with short-lived credentials, MFA on humans, and CloudTrail to see who did what.',
    ],
  },
  {
    id: 'security-groups',
    title: 'Security groups',
    zone: 'cloud',
    body: [
      'A security group is a firewall on an instance. A rule from 0.0.0.0/0 (or ::/0) opens that port to the whole internet. For 80 and 443 on a web server that is the point; for 22, 3389, 3306 or 6379 it is a finding.',
      'Admin ports are restricted to a bastion, a VPN or your own address range. Databases are reachable only from the application\'s security group.',
    ],
  },
  {
    id: 'api-security',
    title: 'API authorization, JWT verification and rate limits',
    zone: 'cloud',
    body: [
      'For an API the three checks that fail most are: the object belongs to the caller (BOLA), the token is really verified (signature, expiry, issuer, audience), and the endpoint is rate limited (so logins, OTP codes and expensive calls cannot be brute-forced).',
      'The OWASP API Security Top 10 starts with BOLA for a reason: it is the easiest to find and the most damaging.',
    ],
  },
  {
    id: 'secrets',
    title: 'Secrets in code',
    zone: 'cloud',
    body: [
      'An AWS access key starts with AKIA followed by 16 characters. A committed .env, a token in a Dockerfile, a private key in the repo: once pushed, it is in the history forever, even after a later delete.',
      'Rotate the secret first, then clean the history. Keep secrets in a secrets manager or injected environment variables, and run secret scanning in CI so the next one never lands.',
    ],
  },
  {
    id: 'supply-chain',
    title: 'Dependencies and containers',
    zone: 'cloud',
    body: [
      'npm audit and tools like Trivy list dependencies with known CVEs. A container running as root, built from an old base image, with the secret baked into a layer, is the usual trio.',
      'Pin versions, update on a schedule, scan images in the pipeline, run as a non-root user, and keep secrets out of images.',
    ],
  },
  // The Report
  {
    id: 'six-phases',
    title: 'The six phases of an assessment',
    zone: 'report',
    body: [
      'Scope and asset inventory: authorisation, targets, exclusions, what will be tested. Reconnaissance and discovery: hosts, ports, services, endpoints, technologies. Vulnerability assessment: scans and checks that find potential problems.',
      'Validation or exploitation: confirm with controlled, non-destructive tests. Risk assessment and report: evidence, impact, likelihood, priority. Remediation and retesting: fix, update, test again. Nothing is tested without written authorisation and a defined scope.',
    ],
  },
  {
    id: 'finding-format',
    title: 'The minimum format of a finding',
    zone: 'report',
    body: [
      'Title: a precise description of the problem. Asset and scope: the application, host or endpoint affected. Impact: what can happen and under what conditions. Evidence: requests and responses or screenshots, anonymised.',
      'Risk: likelihood, impact, CVSS when it applies. Fix: a concrete, verifiable change. Retest: the result of checking again after the fix. Seven fields; a finding missing any of them is not done.',
    ],
  },
  {
    id: 'scanner-principle',
    title: 'The scanner suggests, the analyst verifies',
    zone: 'report',
    body: [
      'A scanner says where a problem might be. The professional\'s work is to verify it, measure its real impact in this system, and get it fixed.',
      'Scanner output pasted into a report is not a finding. Each item is verified, rated and written so that the person fixing it can reproduce it.',
    ],
  },
  {
    id: 'standards',
    title: 'OWASP, CIS and NIST: which is for what',
    zone: 'report',
    body: [
      'OWASP Top 10: which risks to know. OWASP ASVS: which requirements an application should meet. OWASP WSTG: how to test. OWASP API Security Top 10: the common risks of APIs.',
      'CIS Benchmarks: hardening guides for systems, platforms and services. CIS Controls: prioritised organisational and technical measures. NIST CSF: governance and management of cyber risk.',
    ],
  },
  {
    id: 'home-lab',
    title: 'A home lab',
    zone: 'report',
    body: [
      'An isolated virtual network with a tools machine (Kali Linux: Nmap, Burp Suite and the rest), a Linux test machine with services to scan, and a deliberately vulnerable web app such as OWASP Juice Shop. Greenbone can be added later; it needs more hardware.',
      'Use snapshots, never expose the vulnerable machines to the internet, and bind local apps to 127.0.0.1. The one rule: only test labs, your own systems, or assets you hold explicit written authorisation for, with scope and limits defined.',
    ],
  },
];

export const CODEX_BY_ID = Object.fromEntries(CODEX.map((c) => [c.id, c])) as Record<string, CodexEntry>;
