// Every acronym on the roadmap and in the game: what the letters stand for,
// what it means in one or two plain sentences, and an example. Drilled on the
// Study page with flashcards and a quiz.

export type AcronymArea = 'web' | 'network' | 'vuln' | 'standards' | 'cloud' | 'appsec' | 'defence';

export const AREA_NAMES: Record<AcronymArea, string> = {
  web: 'Web and APIs',
  network: 'Networks and systems',
  vuln: 'Vulnerabilities and scoring',
  standards: 'Standards and organisations',
  cloud: 'Cloud and containers',
  appsec: 'Code and pipelines',
  defence: 'Defence and monitoring',
};

export interface Acronym {
  abbr: string;
  full: string;
  meaning: string;
  example?: string;
  area: AcronymArea;
}

export const ACRONYMS: Acronym[] = [
  // ---- Vulnerabilities and scoring -----------------------------------------------
  { abbr: 'CVE', full: 'Common Vulnerabilities and Exposures', area: 'vuln', meaning: 'The public ID system for known vulnerabilities in specific products. Each flaw gets one number, so everyone talks about the same thing.', example: 'CVE-2021-4034 is PwnKit, a root flaw in polkit.' },
  { abbr: 'KEV', full: 'Known Exploited Vulnerabilities (catalog)', area: 'vuln', meaning: "CISA's list of CVEs that attackers are really exploiting. A CVE in KEV goes to the top of the fix list.", example: 'CVE-2017-7494 (SambaCry) is in KEV; it was added on 30 March 2023.' },
  { abbr: 'CVSS', full: 'Common Vulnerability Scoring System', area: 'vuln', meaning: 'A score from 0 to 10 for how severe a vulnerability is, worked out from eight questions about how it is reached and what it breaks. Version 3.1 is the most used; 4.0 came out in 2023.', example: 'CVSS 9.8 = Critical: network, no login, no click, full impact.' },
  { abbr: 'CWE', full: 'Common Weakness Enumeration', area: 'vuln', meaning: 'A catalogue of kinds of mistake, not specific bugs. A CVE is one flaw in one product; a CWE is the type of flaw it is.', example: 'CWE-89 is SQL injection; CWE-79 is cross-site scripting.' },
  { abbr: 'NVD', full: 'National Vulnerability Database', area: 'vuln', meaning: "NIST's database that takes each CVE and adds a CVSS score, the CWE and the affected product versions.", example: 'Look up a CVE on nvd.nist.gov to see its score and affected versions.' },
  { abbr: 'EPSS', full: 'Exploit Prediction Scoring System', area: 'vuln', meaning: 'A probability from FIRST that a CVE will be exploited in the next 30 days. It complements CVSS (how bad) with how likely.' },
  { abbr: 'SSVC', full: 'Stakeholder-Specific Vulnerability Categorization', area: 'vuln', meaning: 'A decision tree that turns facts like "is it exploited?" and "is it exposed?" into an action: track, attend or act. CISA uses it.' },
  { abbr: 'PoC', full: 'Proof of Concept', area: 'vuln', meaning: 'Code that shows a vulnerability can be exploited. It makes attacks easier but is not evidence of real attacks.' },
  { abbr: 'RCE', full: 'Remote Code Execution', area: 'vuln', meaning: 'A flaw that lets someone run their own code on a machine from across the network. Usually the worst kind.', example: 'regreSSHion (CVE-2024-6387) is an RCE in OpenSSH.' },
  { abbr: 'LPE', full: 'Local Privilege Escalation', area: 'vuln', meaning: 'A flaw that lets someone who already has a normal account become administrator or root.', example: 'PwnKit and Baron Samedit are LPEs.' },
  { abbr: 'EOL', full: 'End of Life', area: 'vuln', meaning: 'A product version that no longer gets security updates. Every new flaw in it stays open.' },
  { abbr: 'VA', full: 'Vulnerability Assessment', area: 'vuln', meaning: 'Finding and listing vulnerabilities, usually with scanners, then checking them. One step of the work, not the whole programme.' },
  { abbr: 'VT', full: 'Vulnerability Test (NVT: Network Vulnerability Test)', area: 'vuln', meaning: 'One check in OpenVAS, usually for one flaw. The feed is the collection of all of them.' },
  { abbr: 'QoD', full: 'Quality of Detection', area: 'vuln', meaning: 'How sure OpenVAS is that a result is real, from 1% to 100%, set by how the test detected it.', example: '97% = checked the installed package; 30% = read a version from a banner.' },
  { abbr: 'GVM', full: 'Greenbone Vulnerability Management', area: 'vuln', meaning: 'The whole Greenbone system around the OpenVAS scanner: the manager that stores targets, tasks and results, and the web console.' },
  { abbr: 'SBOM', full: 'Software Bill of Materials', area: 'vuln', meaning: 'The list of every component and version inside a piece of software, so you can tell at once whether a new CVE affects you.' },
  { abbr: 'CSAF', full: 'Common Security Advisory Framework', area: 'vuln', meaning: 'A standard, machine-readable format for vendors to publish security advisories.' },

  // ---- Standards and organisations --------------------------------------------------
  { abbr: 'OWASP', full: 'Open Worldwide Application Security Project', area: 'standards', meaning: 'A non-profit that publishes free application security guides and tools, such as the Top 10, ASVS, WSTG, ZAP and Juice Shop. It was called Open Web Application Security Project until 2023.' },
  { abbr: 'ASVS', full: 'Application Security Verification Standard', area: 'standards', meaning: "OWASP's list of testable security requirements for an application, in three levels of strictness.", example: 'Requirement: session tokens are invalidated at logout.' },
  { abbr: 'WSTG', full: 'Web Security Testing Guide', area: 'standards', meaning: "OWASP's method for testing a web application, with a test case for each area.", example: 'WSTG-ATHN covers authentication tests.' },
  { abbr: 'CIS', full: 'Center for Internet Security', area: 'standards', meaning: 'A non-profit that publishes the CIS Benchmarks (hardening settings for each system) and the CIS Controls (priority security measures).', example: 'The CIS Benchmark for Ubuntu says to disable SSH root login.' },
  { abbr: 'NIST', full: 'National Institute of Standards and Technology', area: 'standards', meaning: 'The US agency behind the NVD, the Cybersecurity Framework and many security guidelines.' },
  { abbr: 'CSF', full: '(NIST) Cybersecurity Framework', area: 'standards', meaning: "NIST's framework for managing cyber risk, organised as Govern, Identify, Protect, Detect, Respond and Recover (version 2.0, 2024)." },
  { abbr: 'CISA', full: 'Cybersecurity and Infrastructure Security Agency', area: 'standards', meaning: 'The US government agency for cyber security. It runs the KEV catalog.' },
  { abbr: 'BOD', full: 'Binding Operational Directive', area: 'standards', meaning: 'An order from CISA that US federal agencies must follow.', example: 'BOD 22-01 makes agencies fix KEV entries by their due dates.' },
  { abbr: 'GRC', full: 'Governance, Risk and Compliance', area: 'standards', meaning: 'The side of security that sets policies, assesses risk and checks the organisation meets standards and laws.' },
  { abbr: 'FIRST', full: 'Forum of Incident Response and Security Teams', area: 'standards', meaning: 'The global association of incident response teams. It maintains CVSS and EPSS.' },
  { abbr: 'SCAP', full: 'Security Content Automation Protocol', area: 'standards', meaning: 'A NIST family of standards for describing vulnerabilities and configuration checks so tools can share them.' },

  // ---- Web and APIs ---------------------------------------------------------------------
  { abbr: 'HTTP', full: 'HyperText Transfer Protocol', area: 'web', meaning: 'The language browsers and web servers use: a request (method, path, headers, body) and a response (status, headers, body).' },
  { abbr: 'HTTPS', full: 'HTTP Secure', area: 'web', meaning: 'HTTP inside a TLS-encrypted connection, so nobody on the network can read or change it.' },
  { abbr: 'URL', full: 'Uniform Resource Locator', area: 'web', meaning: 'A full web address: scheme, host, path and query.', example: 'https://shop.example/account?lang=fr' },
  { abbr: 'API', full: 'Application Programming Interface', area: 'web', meaning: 'Addresses a program calls to read or change data, rather than pages for people.' },
  { abbr: 'REST', full: 'Representational State Transfer', area: 'web', meaning: 'A common style of API: resources at URLs, read with GET, created with POST, changed with PUT or PATCH, removed with DELETE.', example: 'GET /api/orders/7001' },
  { abbr: 'JSON', full: 'JavaScript Object Notation', area: 'web', meaning: 'A simple text format for data, used by most APIs and cloud policies.', example: '{"role": "user"}' },
  { abbr: 'JWT', full: 'JSON Web Token', area: 'web', meaning: 'A signed token with three parts (header, payload, signature) that proves who you are on each request.' },
  { abbr: 'HMAC', full: 'Hash-based Message Authentication Code', area: 'web', meaning: 'A signature made from a message and a shared secret key. HS256 in a JWT means HMAC with SHA-256.' },
  { abbr: 'SHA', full: 'Secure Hash Algorithm', area: 'web', meaning: 'A family of functions that turn any data into a fixed-size fingerprint. SHA-256 is the common one.' },
  { abbr: 'CORS', full: 'Cross-Origin Resource Sharing', area: 'web', meaning: "The browser rule that decides whether a page on one website may read another website's responses." },
  { abbr: 'CSRF', full: 'Cross-Site Request Forgery', area: 'web', meaning: "Tricking a logged-in user's browser into sending a request they did not mean to, using their cookies. SameSite cookies and CSRF tokens stop it." },
  { abbr: 'XSS', full: 'Cross-Site Scripting', area: 'web', meaning: "User input that ends up running as script in other people's browsers. Fixed by encoding output." },
  { abbr: 'SQL', full: 'Structured Query Language', area: 'web', meaning: 'The language used to ask a database for data.' },
  { abbr: 'SQLi', full: 'SQL Injection', area: 'web', meaning: 'User input pasted into a SQL query so it changes the query. Fixed with parameterised queries.' },
  { abbr: 'IDOR', full: 'Insecure Direct Object Reference', area: 'web', meaning: "Changing an ID in a request shows someone else's data because the server never checks ownership." },
  { abbr: 'BOLA', full: 'Broken Object Level Authorization', area: 'web', meaning: "The API name for IDOR, number 1 in the OWASP API Top 10." },
  { abbr: 'SSRF', full: 'Server-Side Request Forgery', area: 'web', meaning: 'Making the server fetch an address you choose, so it reaches internal systems for you.' },
  { abbr: 'LFI', full: 'Local File Inclusion', area: 'web', meaning: "Making an application read or include a file from its own server that it should not, by changing a path in a request." },
  { abbr: 'CSP', full: 'Content Security Policy', area: 'web', meaning: 'A response header that tells the browser which scripts and resources a page may load, which blunts XSS.' },
  { abbr: 'HSTS', full: 'HTTP Strict Transport Security', area: 'web', meaning: 'A response header that makes the browser use only HTTPS for a site from then on.' },
  { abbr: 'TLS', full: 'Transport Layer Security', area: 'web', meaning: 'The encryption behind HTTPS and many other protocols. Use 1.2 and 1.3; 1.0 and 1.1 are retired.' },
  { abbr: 'SSL', full: 'Secure Sockets Layer', area: 'web', meaning: "TLS's old predecessor, now broken and retired. People still say \"SSL certificate\" for TLS certificates." },
  { abbr: 'WAF', full: 'Web Application Firewall', area: 'web', meaning: 'A filter in front of a website that blocks requests that look like attacks. It helps but never replaces fixing the code.' },
  { abbr: 'MFA', full: 'Multi-Factor Authentication', area: 'web', meaning: 'Logging in with more than one proof, such as a password plus a code from your phone.' },
  { abbr: 'SSO', full: 'Single Sign-On', area: 'web', meaning: 'One login that gives access to many applications.' },
  { abbr: 'DoS', full: 'Denial of Service (DDoS: Distributed)', area: 'web', meaning: 'Making a service unavailable, often by flooding it. Distributed means from many machines at once.' },

  // ---- Networks and systems --------------------------------------------------------------
  { abbr: 'IP', full: 'Internet Protocol', area: 'network', meaning: 'The addressing system of networks. Every machine has an IP address, like 10.0.20.30.' },
  { abbr: 'TCP', full: 'Transmission Control Protocol', area: 'network', meaning: 'A reliable connection between two machines, opened with a three-step handshake (SYN, SYN-ACK, ACK). Web, SSH and most services use it.' },
  { abbr: 'UDP', full: 'User Datagram Protocol', area: 'network', meaning: 'Sending packets with no connection and no guarantee they arrive. DNS and many streaming services use it.' },
  { abbr: 'ICMP', full: 'Internet Control Message Protocol', area: 'network', meaning: 'Control messages between machines; ping uses it. Firewalls often drop it.' },
  { abbr: 'DNS', full: 'Domain Name System', area: 'network', meaning: 'The internet phone book that turns names into IP addresses.', example: 'shop.example → 203.0.113.10' },
  { abbr: 'NAT', full: 'Network Address Translation', area: 'network', meaning: 'A router rewriting addresses so many private machines share one public IP. Machines behind NAT are not reachable from outside unless a port is forwarded.' },
  { abbr: 'CIDR', full: 'Classless Inter-Domain Routing', area: 'network', meaning: 'Writing a block of addresses as address/size.', example: '10.0.20.0/24 = 256 addresses, 10.0.20.0 to 10.0.20.255.' },
  { abbr: 'LAN', full: 'Local Area Network', area: 'network', meaning: 'The network inside one office or home.' },
  { abbr: 'VLAN', full: 'Virtual LAN', area: 'network', meaning: 'Splitting one physical network into separate logical ones, so, for example, cameras cannot reach servers.' },
  { abbr: 'VPN', full: 'Virtual Private Network', area: 'network', meaning: 'An encrypted tunnel that puts a remote machine on a private network as if it were there.' },
  { abbr: 'SSH', full: 'Secure Shell', area: 'network', meaning: 'Encrypted remote login to a server, port 22.' },
  { abbr: 'FTP', full: 'File Transfer Protocol', area: 'network', meaning: 'An old way to move files, port 21, with no encryption.' },
  { abbr: 'SMB', full: 'Server Message Block', area: 'network', meaning: "Windows' file-sharing protocol, port 445. Samba implements it on Linux." },
  { abbr: 'RDP', full: 'Remote Desktop Protocol', area: 'network', meaning: 'Windows remote desktop, port 3389. Never leave it open to the internet.' },
  { abbr: 'SMTP', full: 'Simple Mail Transfer Protocol', area: 'network', meaning: 'How email is sent between servers, port 25.' },
  { abbr: 'ARP', full: 'Address Resolution Protocol', area: 'network', meaning: "How a machine finds the hardware (MAC) address that goes with an IP on the local network." },
  { abbr: 'MAC', full: 'Media Access Control (address)', area: 'network', meaning: "The hardware address of a network card, used inside one local network." },
  { abbr: 'IANA', full: 'Internet Assigned Numbers Authority', area: 'network', meaning: 'The body that assigns official port numbers and IP ranges.', example: 'Port 443 is assigned to HTTPS.' },
  { abbr: 'NSE', full: 'Nmap Scripting Engine', area: 'network', meaning: 'Scripts that add checks to Nmap, such as reading banners or testing for known flaws.', example: 'nmap --script ssl-enum-ciphers -p 443 host' },
  { abbr: 'AD', full: 'Active Directory', area: 'network', meaning: "Microsoft's directory of users, computers and permissions in a Windows network. Taking it over usually means owning the whole company." },
  { abbr: 'DC', full: 'Domain Controller', area: 'network', meaning: 'The server that runs Active Directory and checks every Windows login.' },
  { abbr: 'OS', full: 'Operating System', area: 'network', meaning: 'Windows, Linux, macOS: the base software of a machine.' },
  { abbr: 'VM', full: 'Virtual Machine', area: 'network', meaning: 'A whole computer simulated in software, used for safe labs and snapshots.' },
  { abbr: 'PCAP', full: 'Packet Capture', area: 'network', meaning: 'A file of recorded network traffic, opened in Wireshark.' },
  { abbr: 'OSINT', full: 'Open-Source Intelligence', area: 'network', meaning: 'Information gathered from public sources: websites, DNS, registries, social media.' },
  { abbr: 'MSF', full: 'Metasploit Framework', area: 'network', meaning: 'A framework of modules for scanning, checking and exploiting known vulnerabilities in a controlled way.' },

  // ---- Cloud and containers ------------------------------------------------------------
  { abbr: 'AWS', full: 'Amazon Web Services', area: 'cloud', meaning: "Amazon's cloud: servers, storage, databases and much more, rented and configured online." },
  { abbr: 'IAM', full: 'Identity and Access Management', area: 'cloud', meaning: 'Who can do what in a cloud account: users, roles and the policies attached to them.' },
  { abbr: 'S3', full: 'Simple Storage Service', area: 'cloud', meaning: "AWS file storage in buckets. Public buckets are a classic leak." },
  { abbr: 'EC2', full: 'Elastic Compute Cloud', area: 'cloud', meaning: 'AWS virtual servers, rented by the hour and configured online.' },
  { abbr: 'VPC', full: 'Virtual Private Cloud', area: 'cloud', meaning: 'Your own private network inside AWS, with subnets and security groups.' },
  { abbr: 'SG', full: 'Security Group', area: 'cloud', meaning: 'An AWS firewall attached to a server: which addresses may reach which ports.' },
  { abbr: 'ARN', full: 'Amazon Resource Name', area: 'cloud', meaning: 'The full unique name of an AWS resource, used in policies.', example: 'arn:aws:s3:::harbor-reports/monthly/*' },
  { abbr: 'K8s', full: 'Kubernetes', area: 'cloud', meaning: 'A system that runs and manages many containers across machines. The 8 stands for the eight letters between K and s.' },
  { abbr: 'CSPM', full: 'Cloud Security Posture Management', area: 'cloud', meaning: 'Tools that check cloud settings against best practice, like Prowler or AWS Security Hub.' },

  // ---- Code and pipelines ---------------------------------------------------------------
  { abbr: 'AppSec', full: 'Application Security', area: 'appsec', meaning: 'Making the software itself secure: design, code, libraries and the pipeline that builds it.' },
  { abbr: 'SAST', full: 'Static Application Security Testing', area: 'appsec', meaning: 'Reading source code without running it to find risky patterns.', example: 'Semgrep, CodeQL' },
  { abbr: 'DAST', full: 'Dynamic Application Security Testing', area: 'appsec', meaning: 'Testing a running application from outside by sending requests.', example: 'OWASP ZAP, Burp scanner' },
  { abbr: 'SCA', full: 'Software Composition Analysis', area: 'appsec', meaning: 'Checking the libraries and packages an application depends on for known CVEs.', example: 'npm audit, Dependabot, Trivy' },
  { abbr: 'CI/CD', full: 'Continuous Integration / Continuous Delivery', area: 'appsec', meaning: 'The automated pipeline that tests, builds and deploys code on every change. A good place to run SAST and SCA.' },
  { abbr: 'SDLC', full: 'Software Development Life Cycle', area: 'appsec', meaning: 'The stages of building software, from design to maintenance. Secure SDLC adds security at each stage.' },

  // ---- Defence and monitoring --------------------------------------------------------------
  { abbr: 'SOC', full: 'Security Operations Center', area: 'defence', meaning: 'The team that watches alerts and responds to incidents, often around the clock.' },
  { abbr: 'SIEM', full: 'Security Information and Event Management', area: 'defence', meaning: 'A system that collects logs from everywhere, searches them and raises alerts.' },
  { abbr: 'EDR', full: 'Endpoint Detection and Response', area: 'defence', meaning: 'Software on each computer that watches behaviour and can stop attacks.' },
  { abbr: 'IDS', full: 'Intrusion Detection System (IPS: Prevention)', area: 'defence', meaning: 'Watches network traffic for attacks and alerts; an IPS also blocks them.' },
  { abbr: 'IR', full: 'Incident Response', area: 'defence', meaning: 'What you do when an attack happens: contain, eradicate, recover and learn.' },
  { abbr: 'IOC', full: 'Indicator of Compromise', area: 'defence', meaning: 'A trace that shows an attack happened: a bad IP, a file hash, a strange login.' },
  { abbr: 'APT', full: 'Advanced Persistent Threat', area: 'defence', meaning: 'A skilled, well-funded attacker, often state-backed, who stays hidden for a long time.' },
  { abbr: 'CIA', full: 'Confidentiality, Integrity, Availability', area: 'defence', meaning: 'The three things security protects: secrets stay secret, data stays correct, services stay up.' },
  { abbr: 'PII', full: 'Personally Identifiable Information', area: 'defence', meaning: "Data that identifies a person: name, email, address. Leaking it has legal consequences." },
  { abbr: 'TTP', full: 'Tactics, Techniques and Procedures', area: 'defence', meaning: 'How an attacker works, as catalogued in MITRE ATT&CK.' },
];

export const ACRONYM_BY_ABBR: Record<string, Acronym> = Object.fromEntries(ACRONYMS.map((a) => [a.abbr, a]));
