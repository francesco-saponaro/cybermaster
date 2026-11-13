// The final exam's question bank, one group per block of the study roadmap.
// Each question has the reason behind its answer and the level to replay when
// it is missed. Typed answers are compared without case or extra spaces, and
// list the equivalent ways a professional would write them.

export interface ExamQuestion {
  id: string;
  area: string;
  q: string;
  /** Multiple choice: the options and the index of the right one. */
  options?: string[];
  answer?: number;
  /** Typed: every accepted spelling. */
  accept?: string[];
  why: string;
  level: string;
}

const C = (id: string, area: string, q: string, options: string[], answer: number, why: string, level: string): ExamQuestion => ({ id, area, q, options, answer, why, level });
const T = (id: string, area: string, q: string, accept: string[], why: string, level: string): ExamQuestion => ({ id, area, q, accept, why, level });

export const EXAM: ExamQuestion[] = [
  // ---- Weeks 1-2: networks, Linux, HTTP, Wireshark -----------------------------------------
  C('w1-subnet', 'w1', 'How many devices can use addresses in 10.0.5.64/26?', ['62', '64', '30', '126'], 0, 'A /26 is 64 addresses; the first is the network and the last the broadcast, so 62 are usable.', 'net-subnet'),
  C('w1-nat', 'w1', 'Your laptop is 192.168.1.20, but a website logs your visit from 203.0.113.45. Why?', ['The router translated your private address to its public one (NAT)', 'DNS changed your address', 'TLS hides your real address', 'The website guessed wrong'], 0, 'Private addresses never travel on the internet; the router rewrites them to its public address on the way out.', 'net-dns-nat'),
  C('w1-udp', 'w1', 'A UDP scan reports 123/udp open|filtered. What does that tell you?', ['Nothing came back, so nmap cannot tell open from filtered', 'The port is confirmed open', 'The port is closed', 'A firewall is definitely blocking it'], 0, 'UDP has no handshake; silence can mean a quiet service or a firewall dropping the packet.', 'net-tcp-udp'),
  C('w1-perms', 'w1', 'ls -l shows -rw-r--r-- for .env. Who can read it?', ['Every account on the machine', 'Only the owner', 'The owner and the group only', 'Nobody but root'], 0, 'The last r is "others: read". Secrets should be 600: owner only.', 'linux-perms'),
  C('w1-listen', 'w1', 'Which ss -tlnp line is reachable only from the machine itself?', ['127.0.0.1:6379', '0.0.0.0:6379', '[::]:6379', '*:6379'], 0, '127.0.0.1 is loopback; 0.0.0.0, [::] and * mean every network the machine is on.', 'linux-services'),
  C('w1-disable', 'w1', 'You ran sudo systemctl stop redis-server. What happens at the next reboot?', ['It starts again, because it is still enabled', 'It stays stopped', 'The machine refuses to boot', 'Redis is uninstalled'], 0, 'stop acts now; disable stops it starting at boot. disable --now does both.', 'linux-services'),
  C('w1-ufw', 'w1', 'You are connected over SSH and want deny-by-default with ufw. What must happen before ufw enable?', ['Allow SSH from your network', 'Restart sshd', 'Disable IPv6', 'Nothing: ufw keeps existing sessions'], 0, 'Enable first and the firewall drops your own session: allow port 22 from your address, then enable.', 'linux-firewall'),
  C('w1-handshake', 'w1', 'What are the first three packets of a TCP connection?', ['SYN, SYN-ACK, ACK', 'ACK, SYN, FIN', 'SYN, ACK, RST', 'HELLO, ACK, DATA'], 0, 'SYN asks, SYN-ACK agrees, ACK confirms; only then does data flow.', 'pcap-handshake'),
  T('w1-filter', 'w1', 'Type the Wireshark display filter that shows only HTTP requests sent by 10.0.0.5.', ['http.request && ip.src == 10.0.0.5', 'http.request and ip.src == 10.0.0.5', 'ip.src == 10.0.0.5 && http.request', 'ip.src == 10.0.0.5 and http.request', 'http.request&&ip.src==10.0.0.5', 'ip.src==10.0.0.5&&http.request', 'http.request && ip.src eq 10.0.0.5'], 'http.request keeps requests, ip.src the sender, && both.', 'pcap-filter'),
  C('w1-sni', 'w1', 'On the café Wi-Fi, what can someone watching see of your HTTPS visit to a shop?', ['The site name (SNI) and the addresses, not the pages or cookies', 'Everything, HTTPS only hides passwords', 'Nothing at all', 'The URL path but not the site name'], 0, 'TLS encrypts the content; the server name in the Client Hello, the DNS lookup, addresses and volume still show.', 'pcap-creds'),
  C('w1-httponly', 'w1', 'What does the HttpOnly flag on a session cookie do?', ['Stops scripts on the page reading it', 'Sends it only over HTTPS', 'Stops it being sent to other sites', 'Makes it expire when the tab closes'], 0, 'HttpOnly hides it from JavaScript, so an XSS cannot steal it. Secure is the HTTPS one.', 'wire-httponly'),

  // ---- Weeks 3-4: web security and Burp ---------------------------------------------------------
  C('w3-idor', 'w3', 'Changing /invoices/1042 to /invoices/1043 shows another customer\'s invoice. What is this?', ['IDOR (BOLA): a missing ownership check', 'SQL injection', 'Cross-site scripting', 'A CORS problem'], 0, 'The server checks you are logged in but not that the object is yours.', 'arena-idor'),
  C('w3-sqli-fix', 'w3', 'What is the real fix for SQL injection?', ['Parameterised queries', 'Blocking quotes with a filter', 'A web application firewall', 'Hiding error messages'], 0, 'Parameters keep data out of the query\'s structure; filters and WAFs are bypassed by variants.', 'arena-sqli'),
  C('w3-xss-fix', 'w3', 'User input appears inside an HTML page. What stops XSS there?', ['Encoding the output for HTML where it is placed', 'Removing the word script', 'Only allowing POST requests', 'Setting the Secure flag'], 0, 'Output encoding turns < and quotes into text in that context; blocklists miss variants.', 'arena-xss'),
  C('w3-authz', 'w3', 'Authentication against authorisation:', ['Who you are, against what you are allowed to do', 'The same thing', 'Passwords against tokens', 'Login against logout'], 0, 'Most access-control bugs are authorisation: you are logged in, just not allowed.', 'wire-cookie-role'),
  C('w3-repeater', 'w3', 'What is Burp Repeater for?', ['Changing and resending one request as many times as you like', 'Scanning a whole site automatically', 'Recording traffic to a file', 'Brute-forcing passwords'], 0, 'Repeater is manual testing: one request, edited and replayed.', 'wire-replay'),
  C('w3-jwt', 'w3', 'A server accepts a JWT whose header says "alg": "none". What does that mean?', ['It does not verify the signature, so anyone can forge tokens', 'It uses strong encryption', 'The token expired', 'Only admins can use it'], 0, 'alg none means no signature; a server that accepts it trusts whatever the payload says.', 'wire-jwt'),
  C('w3-ssrf', 'w3', 'A link preview fetches http://169.254.169.254/... on the server. What is this?', ['SSRF: the server fetches an address the attacker chose', 'XSS', 'CSRF', 'IDOR'], 0, 'Server-side request forgery reaches internal services, such as cloud metadata, from the server\'s position.', 'arena-ssrf'),
  C('w3-top10', 'w3', 'In the OWASP Top 10 (2021), which risk is A01?', ['Broken Access Control', 'Injection', 'Cryptographic Failures', 'Security Misconfiguration'], 0, 'Broken Access Control moved to first place in 2021: it was found in 94% of tested apps.', 'arena-idor'),

  // ---- Weeks 5-6: network vulnerability assessment --------------------------------------------
  C('w5-sn', 'w5', 'What does nmap -sn do?', ['Finds which hosts are up, without scanning ports', 'Scans every port', 'Detects versions', 'Runs vulnerability scripts'], 0, '-sn is host discovery only: a quick, quiet map before anything else.', 'perimeter-sweep'),
  C('w5-sv', 'w5', 'Which nmap option asks each open port for its software and version?', ['-sV', '-sn', '-Pn', '-p-'], 0, '-sV is version detection; -p- means every port, -Pn skips host discovery.', 'perimeter-versions'),
  C('w5-fp', 'w5', 'A scanner says Apache 2.4.49 (critical); curl -I shows Server: Apache/2.4.58. What do you do?', ['Treat it as a likely false positive and record the evidence', 'Report it as critical anyway', 'Exploit it to be sure', 'Ignore the curl result'], 0, 'The live banner shows a fixed version: the report was stale. Verify, then decide.', 'perimeter-false-positive'),
  C('w5-cvss', 'w5', 'A CVSS 3.1 base score of 9.8 is rated:', ['Critical', 'High', 'Medium', 'Severe'], 0, '9.0 to 10.0 is Critical, 7.0 to 8.9 High, 4.0 to 6.9 Medium.', 'report-cvss'),
  C('w5-qod', 'w5', 'In OpenVAS, a result with QoD 30% means:', ['The scanner only read a version string, so it may be wrong', 'It is 30% likely to be exploited', 'It affects 30% of hosts', 'It is a low severity'], 0, 'Quality of Detection is how sure the scanner is; 30% is a banner guess, 97% was checked from inside.', 'scan-qod'),
  C('w5-auth', 'w5', 'Why does an authenticated scan find more than an unauthenticated one?', ['It logs in and reads the installed packages', 'It scans more ports', 'It uses exploits', 'It runs for longer'], 0, 'From inside it sees local flaws, such as PwnKit, that no network service shows.', 'scan-auth'),
  C('w5-kev', 'w5', 'What does CISA\'s KEV catalog list?', ['Vulnerabilities with evidence of exploitation in the wild', 'Every CVE ever published', 'Vulnerabilities with a CVSS of 9 or more', 'Vendors with known bugs'], 0, 'KEV entries are being used by attackers: they go to the top of the fix list.', 'scan-kev'),
  C('w5-cve', 'w5', 'CVE against CVSS:', ['CVE is the flaw\'s identifier, CVSS its severity score', 'The same thing', 'CVE is the score, CVSS the id', 'CVSS lists exploited flaws'], 0, 'CVE-2015-3306 names a flaw; 9.8 is how bad it is.', 'perimeter-versions'),

  // ---- Weeks 7-8: pentesting and validation ------------------------------------------------------
  C('w7-aux', 'w7', 'Which kind of Metasploit module only gathers information?', ['auxiliary', 'exploit', 'payload', 'post'], 0, 'auxiliary/scanner/... modules read banners and answers; they never exploit.', 'msf-auxiliary'),
  C('w7-payload', 'w7', 'Exploit against payload:', ['The exploit abuses the flaw; the payload is the code left running afterwards', 'They are the same', 'The payload abuses the flaw; the exploit runs afterwards', 'A payload is a scanner'], 0, 'One flaw, many possible payloads: a command, a shell, Meterpreter.', 'msf-exploit-payload'),
  C('w7-reverse', 'w7', 'A reverse payload:', ['Makes the target connect back to LHOST, your address', 'Opens a port on the target and waits for you', 'Undoes the exploit', 'Only works on Windows'], 0, 'Outgoing connections usually pass firewalls that block incoming ones.', 'msf-exploit-payload'),
  C('w7-check', 'w7', 'On a verification-only job, check says "appears to be vulnerable". What next?', ['Report it with the check output; do not run the exploit', 'Run the exploit to be sure', 'Ignore it until proven', 'Run it with a different payload'], 0, 'check is the non-destructive proof the rules allow; firing needs written permission.', 'msf-check'),
  C('w7-nse', 'w7', 'Which NSE categories are out of bounds on a non-destructive engagement?', ['intrusive and exploit', 'safe and default', 'discovery and version', 'vuln and safe'], 0, 'Read --script-help first; "vuln and safe" keeps only harmless checks.', 'msf-nse'),
  T('w7-rhosts', 'w7', 'In msfconsole, type the command that sets the target to 10.0.9.9.', ['set RHOSTS 10.0.9.9', 'set rhosts 10.0.9.9', 'setg RHOSTS 10.0.9.9', 'set RHOST 10.0.9.9'], 'RHOSTS is the target option on every module.', 'msf-check'),
  C('w7-445', 'w7', 'MS17-010 (EternalBlue) spreads between machines over which port?', ['445', '3389', '22', '139 only'], 0, 'SMB on 445; WannaCry swept networks for it in 2017.', 'msf-boss'),
  C('w7-roe', 'w7', 'What do the rules of engagement define?', ['What, when and how you may test, signed by the client', 'The CVSS score of each finding', 'The tools you must use', 'The report template'], 0, 'No signature, no test: scope and rules come first.', 'perimeter-scope'),

  // ---- Weeks 9-10: cloud, API and code security ------------------------------------------------
  C('w9-s3', 'w9', 'A bucket policy grants s3:GetObject to Principal "*". What is the fix?', ['Remove the public statement and turn on Block Public Access', 'Encrypt the bucket', 'Rename the bucket', 'Enable versioning'], 0, 'Encrypted data that anyone can download is still public.', 'cloud-bucket'),
  C('w9-iam', 'w9', 'Least privilege for an export job means:', ['Only the actions it needs, on the resources it needs', 'Read-only on everything', 'Admin, but only at night', 'One user per developer'], 0, 'Name the actions (s3:GetObject) and the resources (one prefix), nothing more.', 'cloud-iam'),
  C('w9-key', 'w9', 'An AWS key was committed to git months ago. What comes first?', ['Deactivate and replace the key', 'Delete the file from the repository', 'Make the repository private', 'Rewrite the git history'], 0, 'The key is already copied; removing the file does not un-leak it.', 'cloud-keys'),
  C('w9-sg', 'w9', 'A security group allows 0.0.0.0/0 on port 22. That means:', ['SSH is open to the whole internet', 'SSH is open to the VPC only', 'SSH is blocked', 'Only AWS can connect'], 0, '0.0.0.0/0 is every address; admin ports belong to known addresses only.', 'cloud-sg'),
  C('w9-dev', 'w9', 'npm audit shows a high only in a devDependency. How do you rate it?', ['Lower priority, since it never runs in production, but still report it', 'Critical', 'Ignore it completely', 'The same as a production critical'], 0, 'npm audit --omit=dev separates what reaches production from build tools.', 'audit-deps'),
  C('w9-trivy', 'w9', 'Trivy reports DS002 on a Dockerfile. What is wrong?', ['There is no USER line, so the app runs as root', 'The base image is too big', 'There is no HEALTHCHECK', 'A port is exposed'], 0, 'DS002: image user should not be root. DS026 is the missing HEALTHCHECK.', 'audit-docker'),
  C('w9-trail', 'w9', 'CloudTrail shows PutBucketPolicy but not which objects were downloaded. Why?', ['S3 data events are not enabled on the trail', 'CloudTrail never logs S3', 'The attacker deleted the logs', 'Downloads are logged in IAM'], 0, 'Management events are on by default; object-level data events are not.', 'audit-cloudtrail'),
  C('w9-rate', 'w9', 'API rate limiting mainly protects against:', ['Brute force and bulk scraping', 'SQL injection', 'XSS', 'Stolen TLS certificates'], 0, 'It caps how fast one client can try passwords or walk through records.', 'cloud-gateway'),

  // ---- Weeks 11-12: full audit -----------------------------------------------------------------
  C('w11-l1', 'w11', 'An OWASP ASVS requirement tagged L1 is:', ['The minimum every application should meet', 'Only for banks', 'Optional', 'A level of CVSS'], 0, 'L1 for all apps, L2 for sensitive data, L3 for critical systems.', 'audit-asvs'),
  C('w11-cis', 'w11', 'CIS: "Ensure sshd PermitRootLogin is disabled". Which evidence passes?', ['permitrootlogin no', 'permitrootlogin without-password', '#PermitRootLogin no in sshd_config', 'permitrootlogin yes'], 0, 'Only no passes, read from sshd -T: a comment in a file proves nothing.', 'audit-cis'),
  C('w11-overall', 'w11', 'The overall risk in an executive summary is set by:', ['The worst confirmed finding', 'The average of all findings', 'The number of findings', 'The client\'s preference'], 0, 'One confirmed critical makes the whole picture critical.', 'audit-summary'),
  C('w11-retest', 'w11', 'How do you retest a finding confirmed with Metasploit\'s check?', ['Run the same check again and expect "not exploitable"', 'Ask the developers if it is fixed', 'Run a different scanner', 'Read the patch notes'], 0, 'The method that found it is the method that closes it.', 'report-retest'),
  C('w11-summary', 'w11', 'Which belongs in the executive summary rather than the technical body?', ['"48,211 customers\' addresses left through a link with no login"', 'The CVSS vector', 'The raw HTTP request', 'The WSTG test id'], 0, 'The summary speaks business; vectors, requests and ids go in the findings.', 'audit-summary'),
  C('w11-prowler', 'w11', 'Prowler shows two criticals: root MFA off, and a public bucket being read now. Which first?', ['The public bucket', 'Root MFA', 'Whichever has the lower check id', 'Neither until the full report is done'], 0, 'Active exposure before latent risk.', 'audit-prowler'),

  // ---- The tools ------------------------------------------------------------------------------
  C('tools-burp', 'tools', 'Which tool intercepts and changes HTTP requests between your browser and a site?', ['Burp Suite (or OWASP ZAP)', 'Wireshark', 'Nmap', 'Trivy'], 0, 'A proxy sits in the middle; Wireshark only watches.', 'wire-replay'),
  C('tools-ws', 'tools', 'Which tool records and inspects network traffic packet by packet?', ['Wireshark', 'Burp Suite', 'OpenVAS', 'Prowler'], 0, 'Wireshark reads captures; display filters cut them down.', 'pcap-filter'),
  C('tools-gvm', 'tools', 'Which tool runs infrastructure vulnerability scans with a feed of tests?', ['Greenbone / OpenVAS', 'Semgrep', 'Burp Suite', 'Wireshark'], 0, 'OpenVAS runs Vulnerability Tests (VTs) from the Greenbone feed against targets.', 'scan-task'),
  C('tools-nmap', 'tools', 'Which statement about Nmap is true?', ['It discovers hosts and services; NSE scripts add some checks, but it is not a full vulnerability scanner', 'It is a full vulnerability scanner', 'It exploits what it finds', 'It only works on Windows'], 0, 'The roadmap says it: Nmap finds; OpenVAS identifies; Metasploit validates; people verify.', 'perimeter-ports'),
  C('tools-semgrep', 'tools', 'Semgrep is used to:', ['Find risky patterns in source code', 'Scan cloud accounts', 'Capture traffic', 'Crack passwords'], 0, 'Static analysis: rules that match code, run in CI.', 'cloud-scan'),
  C('tools-nuclei', 'tools', 'Nuclei runs:', ['Template-based checks against many targets', 'Packet captures', 'Container builds', 'IAM policy simulations'], 0, 'Each YAML template describes one request and what a vulnerable answer looks like.', 'msf-nse'),

  // ---- Checklists and frameworks -------------------------------------------------------------
  C('fw-trio', 'frameworks', 'OWASP Top 10, ASVS and WSTG, in one line each:', ['Which risks to know; which requirements to meet; how to test them', 'Three versions of the same list', 'Web, mobile and API', 'Low, medium and high'], 0, 'The roadmap\'s own way to remember them.', 'audit-asvs'),
  T('fw-wstg', 'frameworks', 'Type the WSTG test id for "Testing for Cookies Attributes".', ['WSTG-SESS-02', 'wstg-sess-02'], 'Session management tests are SESS; cookie attributes is the second.', 'audit-wstg'),
  C('fw-cis', 'frameworks', 'CIS Benchmarks against CIS Controls:', ['Benchmarks harden one system; Controls are priorities for a whole organisation', 'The same thing', 'Controls are for Linux, Benchmarks for Windows', 'Benchmarks are paid, Controls are free'], 0, 'Benchmarks: settings and values. Controls: eighteen safeguards in Implementation Groups.', 'audit-cis'),
  C('fw-nist', 'frameworks', 'The NIST Cybersecurity Framework 2.0 functions are:', ['Govern, Identify, Protect, Detect, Respond, Recover', 'Plan, Do, Check, Act', 'Scan, Exploit, Report', 'Confidentiality, Integrity, Availability'], 0, 'Version 2.0 (2024) added Govern to the five original functions.', 'audit-summary'),
  C('fw-api', 'frameworks', 'In the OWASP API Security Top 10 (2023), API1 is:', ['Broken Object Level Authorization', 'Injection', 'Excessive Data Exposure', 'Lack of Rate Limiting'], 0, 'BOLA, the API name for IDOR, is the most common API flaw.', 'cloud-gateway'),

  // ---- The process and the finding -------------------------------------------------------------
  C('fd-first', 'finding', 'What is the first phase of any assessment?', ['Scope and authorisation', 'Reconnaissance', 'Running the scanner', 'Writing the report'], 0, 'Nothing is touched before the scope is signed.', 'report-phases'),
  C('fd-order', 'finding', 'Which order is right?', ['Recon, vulnerability assessment, validation, risk and report, remediation and retest', 'Validation, recon, report, scan', 'Report, scan, recon, retest', 'Scan, exploit, report, recon'], 0, 'Discover, find, prove, rate, fix, check again.', 'report-phases'),
  C('fd-fields', 'finding', 'Which set is the minimum format of a finding?', ['Title, asset and scope, impact, evidence, risk, fix, retest', 'Title and CVSS', 'Screenshot and fix', 'Scanner output'], 0, 'The roadmap\'s seven fields: each answers a question the client will ask.', 'report-finding'),
  C('fd-evidence', 'finding', 'Good evidence in a finding is:', ['The request and response or a screenshot, with personal data removed', 'The scanner\'s name', 'Your opinion of the risk', 'A link to the CVE only'], 0, 'Evidence lets someone else reproduce it, without leaking customer data.', 'report-finding'),
  C('fd-scope', 'finding', 'Mid-test, a name the client gave you resolves to someone else\'s hosting. You:', ['Stop, do not test it, and tell the client', 'Test it lightly', 'Scan it but do not exploit', 'Add it to the scope yourself'], 0, 'Testing a third party without permission is an attack, whoever asked.', 'perimeter-scope'),
  C('fd-principle', 'finding', 'The roadmap\'s guiding principle about scanners:', ['The scanner suggests; the professional verifies, assesses the impact and fixes it', 'A scanner\'s result is final', 'Only manual testing counts', 'Scanners replace pentests'], 0, '"Lo scanner suggerisce dove potrebbe esserci un problema."', 'perimeter-false-positive'),
];

export const EXAM_BY_ID = Object.fromEntries(EXAM.map((q) => [q.id, q])) as Record<string, ExamQuestion>;

export const EXAM_AREAS: { id: string; name: string }[] = [
  { id: 'w1', name: 'Networks, Linux, HTTP and Wireshark' },
  { id: 'w3', name: 'Web security and Burp' },
  { id: 'w5', name: 'Network vulnerability assessment' },
  { id: 'w7', name: 'Pentesting and validation' },
  { id: 'w9', name: 'Cloud, API and code security' },
  { id: 'w11', name: 'The full audit' },
  { id: 'tools', name: 'The tools' },
  { id: 'frameworks', name: 'Checklists and frameworks' },
  { id: 'finding', name: 'The process and the finding' },
];
