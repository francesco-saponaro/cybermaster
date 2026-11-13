import type { CodexEntry } from './types';

// The codex is where the learning text lives. A mission unlocks the entries
// it lists; the game never shows an entry the player has not earned.

export const CODEX: CodexEntry[] = [
  // The Basics
  {
    id: 'subnets',
    title: 'Subnets and CIDR notation',
    zone: 'basics',
    short: 'A subnet is a block of addresses; /24 says the first 24 bits are the network and the rest number the devices.',
    body: [
      'An IPv4 address is 32 bits, written as four numbers from 0 to 255. CIDR notation adds a slash and a prefix length: 192.168.40.0/24 means the first 24 bits (192.168.40) are fixed for the whole network, and the last 8 bits number the devices on it.',
      'Size: a /24 has 2^8 = 256 addresses, a /25 128, a /26 64, a /27 32, a /28 16. Each extra bit halves the block. The first address is the network address and the last is the broadcast address, so a /24 has 254 usable addresses and a /27 has 30. The netmask is the same idea written out: /24 is 255.255.255.0, /27 is 255.255.255.224.',
      'Why it matters in security: scope documents and firewall rules are written in CIDR, so misreading /16 for /24 means scanning 65,536 addresses instead of 256, many of them someone else\'s. Splitting a network into subnets (guests, staff, servers) and filtering between them is called segmentation, and a flat network where the guest Wi-Fi reaches the printers and servers is a common finding.',
      'Tools: ipcalc prints the range, mask and usable count for any block. Private ranges, which are never routed on the internet, are 10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16 (RFC 1918).',
    ],
  },
  {
    id: 'nat',
    title: 'Private addresses and NAT',
    zone: 'basics',
    short: 'Devices inside use private addresses; the router rewrites them to its one public address on the way out (NAT).',
    body: [
      'Inside a home or office, devices get private addresses (10.x, 172.16-31.x, 192.168.x). The internet never routes those. The router has one public address, and when a device talks to the internet the router rewrites the packet\'s source to its public address and remembers the mapping so the reply can come back. That rewriting is Network Address Translation, NAT.',
      'Consequences you meet on a job: a client allow-lists your public address, not your laptop\'s; a log on a web server shows the office\'s public address for everyone in that office; and nobody on the internet can start a connection to a device behind NAT unless the router forwards a port to it (port forwarding), which is exactly what attackers look for.',
      'ip addr shows your private address and ip route the router (the default gateway). A site like ifconfig.me shows the public address your traffic leaves from. DNS A records map names to public addresses, so dig tells you whether a name really points at you.',
    ],
  },
  {
    id: 'tcp-udp',
    title: 'TCP and UDP',
    zone: 'basics',
    short: 'TCP sets up a connection with a handshake and guarantees delivery; UDP just sends packets, with no handshake and no guarantee.',
    body: [
      'TCP opens every connection with a three-way handshake: SYN, SYN-ACK, ACK. It numbers and acknowledges every byte, resends what is lost and closes cleanly. Web (80, 443), SSH (22), mail (25), databases (3306, 5432) use it.',
      'UDP sends single datagrams with no handshake and no delivery guarantee. It is fast and simple, and is used for DNS (53), time (NTP, 123), SNMP (161), DHCP (67/68), VPNs such as WireGuard and IPsec (500), and video calls. DNS uses both: UDP for normal lookups, TCP for large answers and zone transfers.',
      'Scanning: nmap scans TCP by default, because a handshake gives a clear open or closed. A UDP scan (nmap -sU, needs root) sends a datagram and waits. A reply means open, an ICMP "port unreachable" means closed, and silence is reported as open|filtered because nmap cannot tell a quiet service from a firewall. UDP scans are slow, so people skip them, and that is why services like SNMP with the default community string "public" survive for years unnoticed.',
    ],
  },
  {
    id: 'linux-permissions',
    title: 'Linux file permissions',
    zone: 'basics',
    short: 'Each file has an owner, a group and nine permission bits: read, write and execute for the owner, the group and everyone else.',
    body: [
      'ls -l shows them as ten characters: the type (- file, d folder, l link), then rwx for the owner, rwx for the group and rwx for others. -rw-r--r-- is owner read and write, group read, everyone read. On a folder, x means you may enter it and r that you may list it.',
      'In numbers each triplet is a digit: read 4, write 2, execute 1, added up. 600 is owner read and write only, 644 adds read for everyone, 755 is the usual for programs and folders, 777 lets anyone do anything and is almost always a finding. chmod changes the mode, chown the owner, and only the owner or root can change either.',
      'What auditors look for: secrets (.env, private keys, database passwords) readable by others; scripts or config files writable by others, which lets any local user run code as whoever runs them next; and setuid programs (an s instead of x) that run as their owner. ssh refuses a private key that others can read, and many CIS Benchmark checks are permission checks like these.',
    ],
  },
  {
    id: 'linux-services',
    title: 'Processes, ports and services',
    zone: 'basics',
    short: 'A service is a program systemd keeps running; ss shows which ports it listens on and for which addresses.',
    body: [
      'Every running program is a process with a PID and the user it runs as (ps aux lists them). Long-running ones, such as web servers, databases and SSH, are services, started and supervised by systemd. systemctl status shows whether one is running and whether it starts at boot; stop and start act now, disable and enable act at the next boot, and disable --now does both.',
      'A service listening on a port is reachable by anyone who can reach that address. ss -tlnp lists listening TCP sockets with their process. 127.0.0.1 means only the machine itself can connect; 0.0.0.0 (or * or [::]) means every network the machine is on. A database or cache like Redis on 0.0.0.0 with no password is one of the most common real findings.',
      'Hardening order: remove what is not needed (the cheapest fix), bind what must stay to 127.0.0.1 if only local programs use it, require authentication, and only then rely on the firewall. Run services as their own unprivileged users, never root, so a bug in one does not hand over the whole box.',
    ],
  },
  {
    id: 'host-firewall',
    title: 'Host firewalls and ufw',
    zone: 'basics',
    short: 'A host firewall decides which connections reach a machine; deny by default and allow only what is needed.',
    body: [
      'A firewall compares each new connection with its rules (port, protocol, source address) and lets it in or drops it. A network firewall sits in front of many machines; a host firewall runs on the machine itself. Cloud security groups are the same idea managed by the provider.',
      'ufw (Uncomplicated Firewall) is the front end on Ubuntu. The safe recipe: ufw default deny incoming, then allow only what is needed (ufw allow 443/tcp for a public site, ufw allow from 192.168.40.0/24 to any port 22 proto tcp for admin access from one network), then ufw enable, then ufw status verbose to read it back. ufw limit 22/tcp also slows password guessing by refusing an address that connects six times in thirty seconds.',
      'Two classic mistakes: enabling deny-by-default over SSH before allowing yourself, which locks you out; and one broad allow (all ports from anywhere) that silently undoes the policy. Firewalls reduce exposure, they do not fix a weak service: SSH should still use keys, not passwords, and fail2ban or similar can ban addresses that keep failing.',
      'auth.log (/var/log/auth.log on Ubuntu) records every SSH login attempt. Hundreds of "Failed password" lines from one address within minutes is a brute-force attack; reading that log is one of the first things to do on an incident.',
    ],
  },
  // The Wire
  {
    id: 'http-anatomy',
    title: 'Anatomy of an HTTP exchange',
    zone: 'wire',
    short: 'An HTTP request is a method, a path, headers and an optional body; the response is a status code, headers and a body.',
    body: [
      'A request is a method (GET, POST, PUT, DELETE ...), a path, a version, then headers, a blank line and an optional body. A response is a status line (200, 302, 401, 403, 404, 500 ...), headers, a blank line and a body.',
      'HTTP itself has no memory. Everything that makes a user "logged in" lives in headers: a cookie, an Authorization header, sometimes a token in the body. That is why the headers are where you look first.',
    ],
  },
  {
    id: 'security-headers',
    title: 'The headers that protect a response',
    zone: 'wire',
    short: 'Response headers that tell the browser to be stricter: HSTS, Content-Security-Policy, nosniff, frame options.',
    body: [
      'Strict-Transport-Security tells the browser to use HTTPS only. Content-Security-Policy restricts where scripts and other resources may load from, which blunts XSS. X-Content-Type-Options: nosniff stops the browser guessing content types. X-Frame-Options (or CSP frame-ancestors) stops clickjacking.',
      'A missing header is a weakness, not a vulnerability on its own. It is reported as a hardening gap, usually low severity, unless it combines with something else such as a real XSS.',
    ],
  },
  {
    id: 'cookie-flags',
    title: 'Cookie flags: HttpOnly, Secure, SameSite',
    zone: 'wire',
    short: 'HttpOnly hides a cookie from scripts, Secure sends it only over HTTPS, SameSite keeps it off cross-site requests.',
    body: [
      'HttpOnly keeps the cookie out of JavaScript, so an XSS cannot read it. Secure means it is only sent over HTTPS. SameSite (Lax or Strict) stops the browser sending it on cross-site requests, which blocks most CSRF.',
      'A session cookie without HttpOnly or Secure is a classic finding. The fix is one line in the Set-Cookie header.',
    ],
  },
  {
    id: 'tokens-in-urls',
    title: 'Tokens do not belong in URLs',
    zone: 'wire',
    short: 'A token in a URL leaks into history, logs and Referer headers; credentials belong in headers or cookies.',
    body: [
      'A token in the query string ends up in browser history, server logs, proxy logs and the Referer header sent to other sites. Anyone who reads those logs holds the session.',
      'Credentials travel in headers (Authorization: Bearer ...) or cookies, over HTTPS, and never in the URL.',
    ],
  },
  {
    id: 'jwt-basics',
    title: 'JWTs and the "none" algorithm',
    zone: 'wire',
    short: 'A JSON Web Token is header.payload.signature in base64url; only the signature proves the server issued it.',
    body: [
      'A JSON Web Token is three base64url parts: header, payload and signature. The payload is readable by anyone; the signature is what proves the server issued it.',
      'Two classic mistakes: accepting "alg": "none" (a token with no signature), and verifying with whatever algorithm the token claims instead of the one the server expects. Both let an attacker write their own payload. Fix: pin the algorithm and the key on the server, and reject anything else.',
    ],
  },
  {
    id: 'sessions',
    title: 'Sessions that behave',
    zone: 'wire',
    short: 'A session id is a random value in a cookie that the server maps to a signed-in user.',
    body: [
      'A session id must be long and random, issued fresh after login (so a session fixed before login is useless), expire after inactivity, and die on logout, server side.',
      'Rate limiting and lockout on the login endpoint stop password guessing. Generic error messages ("invalid credentials") stop username enumeration.',
    ],
  },
  {
    id: 'authn-vs-authz',
    title: 'Authentication is not authorization',
    zone: 'wire',
    short: 'Authentication asks who you are; authorization asks whether you may do this. Most access bugs skip the second.',
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
    short: "OWASP's list of the ten risks that hurt web applications most, updated from real-world data.",
    body: [
      'A01 Broken Access Control. A02 Cryptographic Failures. A03 Injection (including XSS). A04 Insecure Design. A05 Security Misconfiguration. A06 Vulnerable and Outdated Components. A07 Identification and Authentication Failures. A08 Software and Data Integrity Failures. A09 Security Logging and Monitoring Failures. A10 Server-Side Request Forgery.',
      'It is an awareness list, updated every few years from real-world data. OWASP ASVS says what requirements an app should meet; the OWASP Web Security Testing Guide says how to test for them.',
    ],
  },
  {
    id: 'sqli',
    title: 'SQL injection',
    zone: 'arena',
    short: 'SQL injection: input pasted into a query changes the query. The fix is parameterised queries.',
    body: [
      'When user input is pasted into a query string, the input can change the query: a quote in the input ends the string early, and whatever follows is read as SQL.',
      'The fix is parameterised queries (prepared statements): the query structure is sent separately from the data, so data can never become code. Escaping and allow-lists are fallbacks, not the fix.',
    ],
  },
  {
    id: 'xss',
    title: 'Cross-site scripting',
    zone: 'arena',
    short: 'Cross-site scripting: input rendered into a page as HTML, so the browser runs it as script.',
    body: [
      'XSS is user input rendered into a page as HTML or script. Reflected XSS comes back in the same response; stored XSS is saved and served to other users; DOM XSS happens in the browser\'s own JavaScript.',
      'The fix is output encoding for the context the data lands in (HTML, attribute, JavaScript, URL), plus a Content-Security-Policy as a second layer. Input filtering alone is bypassed.',
    ],
  },
  {
    id: 'idor',
    title: 'IDOR and BOLA',
    zone: 'arena',
    short: "Insecure direct object reference: change an id in a request and get someone else's object, because nobody checks ownership.",
    body: [
      'Insecure Direct Object Reference: the app uses an id you can change (/orders/1042) and never checks the object belongs to you. In APIs the same bug is called Broken Object Level Authorization, number one in the OWASP API Security Top 10.',
      'The fix is an authorization check on every object access: load the object, compare its owner to the caller, deny by default. Unguessable ids help but are not the fix.',
    ],
  },
  {
    id: 'ssrf',
    title: 'Server-side request forgery',
    zone: 'arena',
    short: 'Server-side request forgery: the server fetches a URL you chose, from inside its own network.',
    body: [
      'SSRF is when the server fetches a URL the user controls. The attacker points it at internal services or the cloud metadata endpoint (169.254.169.254) to steal credentials.',
      'Fix: allow-list the destinations the server may fetch, resolve and check the address before connecting, block link-local and private ranges, and never return the raw response to the user.',
    ],
  },
  {
    id: 'csrf',
    title: 'Cross-site request forgery',
    zone: 'arena',
    short: 'Cross-site request forgery: another site makes your browser send a request with your cookies attached.',
    body: [
      'CSRF makes a logged-in user\'s browser send a request they did not intend, because the browser attaches cookies automatically.',
      'Defences: SameSite cookies, an anti-CSRF token tied to the session on every state-changing request, and checking the Origin header. GET requests must never change state.',
    ],
  },
  {
    id: 'misconfig-components',
    title: 'Misconfiguration and outdated components',
    zone: 'arena',
    short: 'Defaults left on, and software with known CVEs left unpatched.',
    body: [
      'Security misconfiguration is defaults left in place: directory listing, verbose errors, admin consoles open, debug mode in production, default credentials. The fix is hardening against a benchmark and repeatable configuration.',
      'Vulnerable and outdated components is the library or server with a known CVE. The fix is an inventory, software composition analysis (npm audit, Trivy, Dependabot) and patching on a schedule.',
    ],
  },
  {
    id: 'crypto-failures',
    title: 'Cryptographic failures',
    zone: 'arena',
    short: 'Data or tokens protected badly or not at all: no TLS, weak hashes, unsigned or badly verified tokens.',
    body: [
      'Data in transit without TLS, passwords stored as plain text or fast hashes (MD5, SHA-1), home-made crypto, hard-coded keys.',
      'Passwords are stored with a slow, salted hash (bcrypt, scrypt, Argon2). Everything in transit is TLS. Keys live in a secrets manager, not in code.',
    ],
  },
  {
    id: 'insecure-design',
    title: 'Insecure design and integrity failures',
    zone: 'arena',
    short: 'A flaw in the logic itself, which no amount of careful coding fixes.',
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
    short: 'A port is a numbered door on a host; the service is the program behind it; the version is which build.',
    body: [
      'A port is a numbered door; a service is the program behind it; the version is which build of that program. Common ones: 22 SSH, 25 SMTP, 53 DNS, 80 HTTP, 443 HTTPS, 445 SMB, 3306 MySQL, 3389 RDP, 5432 PostgreSQL, 6379 Redis.',
      'A database or an admin protocol reachable from the internet is a finding before you know its version. The version decides whether there are known CVEs on top.',
    ],
  },
  {
    id: 'nmap',
    title: 'What Nmap does and does not do',
    zone: 'perimeter',
    short: 'Nmap finds live hosts, open ports and service versions on a network.',
    body: [
      'Nmap discovers hosts and open ports, identifies services and versions (-sV) and runs scripts (NSE, -sC or --script). -sS is the default SYN scan, -p- scans all 65535 TCP ports, -Pn skips host discovery, -sU scans UDP.',
      'Nmap is not a full vulnerability scanner. Its scripts add checks, but a tool like Greenbone/OpenVAS looks for known vulnerabilities, and neither replaces manual verification.',
    ],
  },
  {
    id: 'cve',
    title: 'CVE: the catalogue of known vulnerabilities',
    zone: 'perimeter',
    short: 'A CVE id names one publicly known vulnerability in one product, like CVE-2011-2523.',
    body: [
      'A CVE id (CVE-2021-44228) names one publicly known vulnerability in one product. The year is when the id was assigned, not when the bug was found or fixed.',
      'A version with known CVEs is only a real finding if the vulnerable code path is reachable. Patching, upgrading and configuration are the usual fixes.',
    ],
  },
  {
    id: 'cvss',
    title: 'CVSS: scoring a vulnerability',
    zone: 'report',
    short: 'CVSS scores a vulnerability from 0 to 10 from eight metrics about how it is exploited and what it breaks.',
    body: [
      'CVSS v3.1 base metrics: Attack Vector, Attack Complexity, Privileges Required, User Interaction, Scope, and the impact on Confidentiality, Integrity and Availability. They combine into a score from 0 to 10: Low (0.1 to 3.9), Medium (4.0 to 6.9), High (7.0 to 8.9), Critical (9.0 to 10).',
      'The base score describes the vulnerability, not your risk. Temporal and environmental metrics adjust it; in a report CVSS supports your risk rating, it does not replace your judgement of impact and likelihood.',
    ],
  },
  {
    id: 'false-positives',
    title: 'False positives and verification',
    zone: 'perimeter',
    short: 'A scanner finding that is not real: the scanner guessed from a banner, an old result or a pattern.',
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
    short: 'A storage bucket readable by anyone on the internet, usually through a policy with Principal "*".',
    body: [
      'A bucket becomes public through a bucket policy with Principal "*", through an ACL that grants AllUsers, or by turning off Block Public Access. The policy and the setting both have to allow it; Block Public Access overrides the rest.',
      'Fix: Block Public Access on, no wildcard principals, and serve files through signed URLs or a CDN with its own access control.',
    ],
  },
  {
    id: 'iam-least-privilege',
    title: 'IAM and least privilege',
    zone: 'cloud',
    short: 'Least privilege: give each role only the actions it needs, on only the resources it needs.',
    body: [
      'An IAM policy with "Action": "*" on "Resource": "*" is administrator access. A role, user or service should hold only the actions it needs on the resources it needs.',
      'Long-lived access keys on the root account, keys in code and roles anyone can assume are the common findings. Use roles with short-lived credentials, MFA on humans, and CloudTrail to see who did what.',
    ],
  },
  {
    id: 'security-groups',
    title: 'Security groups',
    zone: 'cloud',
    short: 'A cloud firewall: rules that say which ports are open to which address ranges.',
    body: [
      'A security group is a firewall on an instance. A rule from 0.0.0.0/0 (or ::/0) opens that port to the whole internet. For 80 and 443 on a web server that is the point; for 22, 3389, 3306 or 6379 it is a finding.',
      'Admin ports are restricted to a bastion, a VPN or your own address range. Databases are reachable only from the application\'s security group.',
    ],
  },
  {
    id: 'api-security',
    title: 'API authorization, JWT verification and rate limits',
    zone: 'cloud',
    short: 'APIs fail most on three checks: object ownership, token verification and rate limits.',
    body: [
      'For an API the three checks that fail most are: the object belongs to the caller (BOLA), the token is really verified (signature, expiry, issuer, audience), and the endpoint is rate limited (so logins, OTP codes and expensive calls cannot be brute-forced).',
      'The OWASP API Security Top 10 starts with BOLA for a reason: it is the easiest to find and the most damaging.',
    ],
  },
  {
    id: 'secrets',
    title: 'Secrets in code',
    zone: 'cloud',
    short: 'Keys and passwords committed to a repository stay in its history even after a later delete.',
    body: [
      'An AWS access key starts with AKIA followed by 16 characters. A committed .env, a token in a Dockerfile, a private key in the repo: once pushed, it is in the history forever, even after a later delete.',
      'Rotate the secret first, then clean the history. Keep secrets in a secrets manager or injected environment variables, and run secret scanning in CI so the next one never lands.',
    ],
  },
  {
    id: 'supply-chain',
    title: 'Dependencies and containers',
    zone: 'cloud',
    short: 'Your dependencies and container images bring their own CVEs; scan and pin them.',
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
    short: 'Scope, recon, vulnerability assessment, validation, report, remediation and retest.',
    body: [
      'Scope and asset inventory: authorisation, targets, exclusions, what will be tested. Reconnaissance and discovery: hosts, ports, services, endpoints, technologies. Vulnerability assessment: scans and checks that find potential problems.',
      'Validation or exploitation: confirm with controlled, non-destructive tests. Risk assessment and report: evidence, impact, likelihood, priority. Remediation and retesting: fix, update, test again. Nothing is tested without written authorisation and a defined scope.',
    ],
  },
  {
    id: 'finding-format',
    title: 'The minimum format of a finding',
    zone: 'report',
    short: 'A finding has seven fields: title, asset, severity, description, impact, evidence and fix.',
    body: [
      'Title: a precise description of the problem. Asset and scope: the application, host or endpoint affected. Impact: what can happen and under what conditions. Evidence: requests and responses or screenshots, anonymised.',
      'Risk: likelihood, impact, CVSS when it applies. Fix: a concrete, verifiable change. Retest: the result of checking again after the fix. Seven fields; a finding missing any of them is not done.',
    ],
  },
  {
    id: 'scanner-principle',
    title: 'The scanner suggests, the analyst verifies',
    zone: 'report',
    short: 'The scanner suggests; the analyst verifies, measures the impact and writes it up.',
    body: [
      'A scanner says where a problem might be. The professional\'s work is to verify it, measure its real impact in this system, and get it fixed.',
      'Scanner output pasted into a report is not a finding. Each item is verified, rated and written so that the person fixing it can reproduce it.',
    ],
  },
  {
    id: 'standards',
    title: 'OWASP, CIS and NIST: which is for what',
    zone: 'report',
    short: 'OWASP says what to test, CIS how to harden, NIST how to manage the risk.',
    body: [
      'OWASP Top 10: which risks to know. OWASP ASVS: which requirements an application should meet. OWASP WSTG: how to test. OWASP API Security Top 10: the common risks of APIs.',
      'CIS Benchmarks: hardening guides for systems, platforms and services. CIS Controls: prioritised organisational and technical measures. NIST CSF: governance and management of cyber risk.',
    ],
  },
  {
    id: 'home-lab',
    title: 'A home lab',
    zone: 'report',
    short: 'An isolated set of machines and deliberately vulnerable apps where you can practise without permission issues.',
    body: [
      'An isolated virtual network with a tools machine (Kali Linux: Nmap, Burp Suite and the rest), a Linux test machine with services to scan, and a deliberately vulnerable web app such as OWASP Juice Shop. Greenbone can be added later; it needs more hardware.',
      'Use snapshots, never expose the vulnerable machines to the internet, and bind local apps to 127.0.0.1. The one rule: only test labs, your own systems, or assets you hold explicit written authorisation for, with scope and limits defined.',
    ],
  },
  // Added with the hands-on levels
  {
    id: 'forced-browsing',
    title: 'Forced browsing and robots.txt',
    zone: 'wire',
    short: 'Requesting pages nobody linked to. robots.txt often lists them, because it asks search engines not to index them.',
    body: [
      'robots.txt is a public file that asks search engines to skip some paths. It is not access control: anyone can read it, and a path listed there is often the one a team wanted to keep quiet.',
      'If a page must be private it needs authentication and authorization on the server. Not linking to it hides nothing from someone who types the URL.',
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies',
    zone: 'wire',
    short: 'Small values the server asks the browser to store and send back on every request to that site.',
    body: [
      'A server sets a cookie with a Set-Cookie response header; the browser sends it back in a Cookie request header. The user controls their own browser, so they can change any cookie to anything.',
      'A cookie can carry an opaque, random session id. It must never carry a decision the server trusts, like role=admin or price=10.',
    ],
  },
  {
    id: 'session-hijacking',
    title: 'Session hijacking',
    zone: 'wire',
    short: 'Using someone else\'s session id to act as them. Whoever holds the id is signed in.',
    body: [
      'A session id is a bearer credential: the server does not know who sent it, only that it is valid. Steal it from plain-HTTP traffic, a log, a URL or an XSS, and you are that user until it expires.',
      'Defences: HTTPS everywhere (and the Secure flag), HttpOnly against script theft, short idle timeouts, a new id at login, and invalidating it on logout.',
    ],
  },
  {
    id: 'cors',
    title: 'CORS',
    zone: 'wire',
    short: 'Cross-Origin Resource Sharing: headers that let a server say which other sites may read its responses in a browser.',
    body: [
      'Browsers stop a script on one origin from reading responses from another, unless the response says Access-Control-Allow-Origin with that origin. With cookies involved it must also say Access-Control-Allow-Credentials: true, and "*" is refused.',
      'The classic bug is a server that copies whatever Origin it receives into Allow-Origin, with credentials allowed: then any website can read a logged-in user\'s data. Allow a fixed list of your own origins.',
    ],
  },
  {
    id: 'command-injection',
    title: 'OS command injection',
    zone: 'arena',
    short: 'Input pasted into a shell command line, so ; or && or $( ) start a second command.',
    body: [
      'exec("ping " + host) hands the whole line to /bin/sh, which reads ; && | and $( ) as its own syntax. Whatever follows runs with the web server\'s rights.',
      'Pass the program and its arguments separately (execFile, or spawn with an argument list), so no shell ever parses the input. Validate the input against what it should be, like an IP address, as a second layer.',
    ],
  },
  {
    id: 'mass-assignment',
    title: 'Mass assignment',
    zone: 'arena',
    short: 'Saving a whole request body into a record, so a user can set fields they were never meant to, like role.',
    body: [
      'Frameworks make it easy to create a record straight from the request body. If the model has fields such as role, credits or verified, a user just adds them to the JSON.',
      'Copy only the fields the user may set (an allow-list), or use separate input types for create and update. OWASP\'s API Top 10 calls it Broken Object Property Level Authorization.',
    ],
  },
  {
    id: 'banner-grabbing',
    title: 'Banner grabbing',
    zone: 'perimeter',
    short: 'Connecting to a service and reading what it says about itself: its software and version.',
    body: [
      'FTP, SSH and SMTP servers greet every connection with a banner. Web servers answer with a Server header. nc and curl -I read them; nmap -sV does it for you.',
      'A banner is a claim, not proof. Distributions backport fixes without changing the version, and admins can change banners. Use it to decide what to verify.',
    ],
  },
  {
    id: 'scope',
    title: 'Scope and authorisation',
    zone: 'perimeter',
    short: 'The signed list of what you may test, when and how. Anything outside it is off limits.',
    body: [
      'An engagement starts with written authorisation from someone who owns the systems: targets, address ranges, dates, allowed techniques and contacts. Without it, scanning someone\'s server can be an offence.',
      'Names change owners. A subdomain can point at a third party\'s shared hosting, and that provider has not agreed to anything. Check where a name resolves before you touch it.',
    ],
  },
  {
    id: 'dns',
    title: 'DNS and whois',
    zone: 'perimeter',
    short: 'DNS turns names into addresses; whois says who registered a domain or holds an address block.',
    body: [
      'dig asks DNS for a record: A for an IPv4 address, MX for the mail servers, TXT for policies such as SPF. whois on an address returns the organisation that holds that range.',
      'Together they answer "whose machine is this?" before any scan does.',
    ],
  },
  {
    id: 'sast',
    title: 'Static analysis (SAST)',
    zone: 'cloud',
    short: 'A scanner that reads source code and flags patterns that might be vulnerabilities.',
    body: [
      'Tools such as Semgrep or CodeQL follow data from a source (a request parameter) to a sink (a query, a shell, the HTML). A finding is real when untrusted data really reaches the sink without being made safe.',
      'Expect noise: constants, test fixtures and values already escaped get flagged too. Triage means tracing each one, fixing the real ones and dismissing the rest with a reason.',
    ],
  },
  {
    id: 'retesting',
    title: 'Retesting',
    zone: 'report',
    short: 'Checking a reported issue again after the fix, with the original attack and its variants.',
    body: [
      'A retest replays the evidence from the finding, then tries variants: a fix that blocks one payload often misses the next one. The finding closes only when the root cause is gone.',
      'The retest result goes into the report: date, what was tried, and the outcome.',
    ],
  },
  {
    id: 'gvm-feed',
    title: 'OpenVAS and its feed',
    zone: 'scanner',
    short: 'OpenVAS runs vulnerability tests (VTs) from a feed; a scanner only finds flaws its feed already describes.',
    body: [
      'Greenbone builds OpenVAS: the scanner engine, a manager (gvmd) that stores targets, tasks and results, and a web console (GSA). The free Community Edition uses the Community Feed; the paid appliances use the Enterprise Feed, with more tests and faster updates.',
      'Each VT is a small script that checks one thing: a version, a behaviour, a missing package update. New tests arrive every day. A box whose feed is old scans happily and reports nothing for every flaw found since, which looks exactly like being safe.',
    ],
  },
  {
    id: 'gvm-target',
    title: 'Targets: addresses, ports and alive tests',
    zone: 'scanner',
    short: 'A target is the list of addresses to scan, the addresses to leave out, the port list and how to decide a host is up.',
    body: [
      'Hosts can be single addresses, ranges or blocks like 10.0.20.0/24; Exclude hosts removes the ones the scope forbids. The port list decides which doors are tried: a narrow list is faster and blind to everything else.',
      'The alive test decides which addresses are worth scanning. ICMP Ping skips anything that does not answer a ping, and firewalls often drop ping on purpose. Consider Alive scans every address, slower but complete.',
    ],
  },
  {
    id: 'gvm-task',
    title: 'Tasks and scan configs',
    zone: 'scanner',
    short: 'A task is a target plus a scan config; each run of a task produces a report.',
    body: [
      'The scan config chooses which tests run. Full and fast runs every test that matches what it finds and leaves out the ones that could crash a service. Discovery only inventories hosts, ports and products. Host Discovery only checks which hosts are up.',
      'Run the same task again and you get a second report of the same target, which is what makes comparisons possible.',
    ],
  },
  {
    id: 'gvm-severity',
    title: 'Severity in OpenVAS',
    zone: 'scanner',
    short: 'Each result carries the CVSS score of its test: High from 7.0, Medium from 4.0, Low above 0, and Log for information.',
    body: [
      'The score belongs to the flaw, not to your network: a High on a machine nobody can reach can matter less than a Medium on the internet. Read the host, the port and the solution type next to the number.',
      'Log results are not problems: they record what the scanner learned, like the operating system or an open port.',
    ],
  },
  {
    id: 'gvm-qod',
    title: 'Quality of detection (QoD)',
    zone: 'scanner',
    short: 'How sure OpenVAS is that a result is real, from 1% to 100%, set by the way the test detected it.',
    body: [
      'A test that proved the flaw scores 100%, one that compared an installed package with the fixed version 97%, one that read a version from a banner 80%. Banners that Linux distributions do not change when they backport a fix score 30%: they are guesses.',
      'Reports hide results under 70% by default. Lower the filter to see the guesses, then check them on the machine and keep or override each one.',
    ],
  },
  {
    id: 'gvm-override',
    title: 'Overrides and false positives',
    zone: 'scanner',
    short: 'An override changes how a result is shown in every report, for example to False Positive, and records why.',
    body: [
      'Overrides apply to a test on a host and port, so next week\'s scan inherits them. That is the point: nobody re-checks the same false alarm every Monday.',
      'Always write the reason and the proof. An override without a reason is a hole someone decided not to look at.',
    ],
  },
  {
    id: 'gvm-auth',
    title: 'Authenticated scans',
    zone: 'scanner',
    short: 'With a login (an SSH key or a Windows account), the scanner reads installed packages and finds flaws invisible from outside.',
    body: [
      'From outside, a scanner sees only what a service tells it. Logged in, it lists every package and compares each version with the vendor\'s fixed one: local privilege escalations like PwnKit or Baron Samedit show up with QoD 97%.',
      'Use a dedicated account with the least rights that still let it read package lists, and keep its key in the scanner\'s credential store only.',
    ],
  },
  {
    id: 'kev',
    title: 'CISA KEV: Known Exploited Vulnerabilities',
    zone: 'scanner',
    short: "CISA's catalog of vulnerabilities attackers have really used; KEV entries go to the top of the fix list.",
    body: [
      'CISA, the US Cybersecurity and Infrastructure Security Agency, keeps the catalog. A vulnerability is added when it has a CVE number, there is reliable evidence it has been exploited in the wild (attempted or successful, not just scanning, research or proof-of-concept code), and there is a clear fix, which can be removing an end-of-life product.',
      'Each entry has the CVE, the vendor and product, the date it was added, a due date and the required action. Binding Operational Directive 22-01 obliges US federal agencies to fix entries by their due dates; everyone else is urged to fix KEV entries first and to use the catalog in their prioritisation. It is free to download as CSV or JSON.',
      'Not being in KEV does not mean safe: it means no confirmed attacks yet. Use it next to severity and exposure, not instead of them.',
    ],
  },
  {
    id: 'gvm-delta',
    title: 'Vulnerability management and delta reports',
    zone: 'scanner',
    short: 'Scanning on a schedule and comparing each report with the last: what was fixed, what is new, what is still open.',
    body: [
      'A vulnerability assessment is one scan; vulnerability management is the cycle of scanning, prioritising, fixing and scanning again. A weekly schedule and a delta report make that cycle visible.',
      'The New column is where surprises live: machines plugged in without telling anyone, services switched on, new tests from the feed matching old software.',
    ],
  },
];

export const CODEX_BY_ID = Object.fromEntries(CODEX.map((c) => [c.id, c])) as Record<string, CodexEntry>;
