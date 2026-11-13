// The study roadmap the game follows, line by line: the Italian original, an
// English version, the levels and codex entries that teach it, and the real
// lab to practise it on afterwards. The Study page shows coverage and progress.

export interface RoadmapItem {
  it: string;
  en: string;
  /** Levels that teach it. */
  levels: string[];
  /** Codex entries that explain it. */
  codex?: string[];
}

export interface RoadmapBlock {
  id: string;
  title: string;
  /** The Italian heading, as in the original. */
  it: string;
  items: RoadmapItem[];
  /** The lab the roadmap asks for at the end of the block. */
  lab?: { it: string; en: string };
  /** Where to practise this for real after the game. */
  practise: { label: string; url: string }[];
}

export const PORTSWIGGER = { label: 'PortSwigger Web Security Academy', url: 'https://portswigger.net/web-security' };
export const TRYHACKME = { label: 'TryHackMe', url: 'https://tryhackme.com/' };
export const HTB = { label: 'Hack The Box Academy', url: 'https://academy.hackthebox.com/' };
export const JUICE = { label: 'OWASP Juice Shop', url: 'https://owasp.org/www-project-juice-shop/' };

export const ROADMAP: RoadmapBlock[] = [
  {
    id: 'w1',
    title: 'Weeks 1–2: networks, Linux and HTTP',
    it: 'Settimane 1–2 | Reti, Linux e HTTP',
    items: [
      { it: 'TCP/IP, DNS, NAT, subnet, porte e firewall', en: 'TCP/IP, DNS, NAT, subnets, ports and firewalls', levels: ['net-subnet', 'net-dns-nat', 'net-tcp-udp', 'perimeter-ports', 'cloud-sg'], codex: ['ports-and-services', 'dns'] },
      { it: 'Linux: shell, permessi, processi e servizi', en: 'Linux: shell, permissions, processes and services', levels: ['linux-perms', 'linux-services', 'linux-firewall'] },
      { it: 'HTTP/HTTPS, cookie, sessioni, JWT, REST', en: 'HTTP/HTTPS, cookies, sessions, JWT, REST', levels: ['wire-robots', 'wire-cookie-role', 'wire-replay', 'wire-httponly', 'wire-jwt', 'wire-cors'], codex: ['http-anatomy', 'cookies', 'jwt-basics'] },
      { it: 'Wireshark per leggere traffico HTTP', en: 'Wireshark to read HTTP traffic', levels: ['pcap-filter', 'pcap-stream', 'pcap-handshake'] },
    ],
    lab: { it: 'Crea una VM; identifica porte e servizi del laboratorio; osserva una richiesta HTTP.', en: 'Create a VM; identify the lab\'s ports and services; watch an HTTP request.' },
    practise: [TRYHACKME, { label: 'Wireshark user guide', url: 'https://www.wireshark.org/docs/wsug_html_chunked/' }],
  },
  {
    id: 'w3',
    title: 'Weeks 3–4: web security and Burp',
    it: 'Settimane 3–4 | Web security e Burp',
    items: [
      { it: 'Burp Proxy, HTTP History e Repeater', en: 'Burp Proxy, HTTP history and Repeater', levels: ['wire-replay', 'wire-httponly', 'wire-cors'] },
      { it: 'SQL injection, XSS, IDOR/BOLA', en: 'SQL injection, XSS, IDOR/BOLA', levels: ['arena-sqli', 'arena-xss', 'arena-idor'], codex: ['sqli', 'xss', 'idor'] },
      { it: 'Autenticazione e controlli di autorizzazione', en: 'Authentication and authorisation checks', levels: ['wire-cookie-role', 'wire-jwt', 'arena-mass', 'cloud-gateway'], codex: ['authn-vs-authz'] },
      { it: 'OWASP Top 10 e WSTG', en: 'OWASP Top 10 and WSTG', levels: ['arena-cmdi', 'arena-ssrf', 'audit-wstg'], codex: ['owasp-top10', 'standards'] },
    ],
    lab: { it: 'Completa almeno 10 laboratori PortSwigger e scrivi un breve finding per ciascuno.', en: 'Complete at least 10 PortSwigger labs and write a short finding for each.' },
    practise: [PORTSWIGGER, JUICE],
  },
  {
    id: 'w5',
    title: 'Weeks 5–6: network vulnerability assessment',
    it: 'Settimane 5–6 | Network vulnerability assessment',
    items: [
      { it: 'Nmap: host discovery, TCP/UDP, version detection', en: 'Nmap: host discovery, TCP/UDP, version detection', levels: ['perimeter-sweep', 'perimeter-ports', 'perimeter-versions', 'net-tcp-udp'], codex: ['nmap'] },
      { it: 'Nmap NSE e interpretazione dei risultati', en: 'Nmap NSE and reading the results', levels: ['perimeter-boss', 'msf-nse'] },
      { it: 'Installazione e scansioni Greenbone/OpenVAS', en: 'Installing and running Greenbone/OpenVAS scans', levels: ['scan-feed', 'scan-target', 'scan-task', 'scan-auth', 'scan-boss'], codex: ['gvm-feed', 'gvm-task'] },
      { it: 'CVE, CVSS, falsi positivi, patch', en: 'CVE, CVSS, false positives, patching', levels: ['perimeter-false-positive', 'scan-qod', 'scan-kev', 'report-cvss'], codex: ['cve', 'cvss', 'false-positives', 'kev'] },
    ],
    lab: { it: 'Analizza due VM isolate, inventaria i servizi e genera un report verificato.', en: 'Analyse two isolated VMs, inventory their services and produce a verified report.' },
    practise: [TRYHACKME, { label: 'Nmap reference guide', url: 'https://nmap.org/book/man.html' }, { label: 'Greenbone Community documentation', url: 'https://greenbone.github.io/docs/latest/' }],
  },
  {
    id: 'w7',
    title: 'Weeks 7–8: pentesting and validation',
    it: 'Settimane 7–8 | Pentesting e validazione',
    items: [
      { it: 'Metodologie di penetration testing', en: 'Penetration testing methodology', levels: ['report-phases', 'perimeter-scope'], codex: ['six-phases', 'scope'] },
      { it: 'Metasploit: moduli, scanner e auxiliary', en: 'Metasploit: modules, scanners and auxiliary', levels: ['msf-modules', 'msf-auxiliary'] },
      { it: 'Exploit vs payload e loro limiti', en: 'Exploit vs payload, and their limits', levels: ['msf-exploit-payload'] },
      { it: 'Prove, impatto, report e verifica non distruttiva', en: 'Evidence, impact, report and non-destructive verification', levels: ['msf-check', 'report-finding', 'report-retest'], codex: ['finding-format', 'scanner-principle'] },
    ],
    lab: { it: 'Verifica alcuni finding su VM deliberatamente vulnerabili e documenta le correzioni.', en: 'Verify some findings on deliberately vulnerable VMs and document the fixes.' },
    practise: [HTB, { label: 'Metasploit documentation', url: 'https://docs.metasploit.com/' }],
  },
  {
    id: 'w9',
    title: 'Weeks 9–10: cloud, API and code security',
    it: 'Settimane 9–10 | Cloud, API e code security',
    items: [
      { it: 'AWS: IAM, Security Group, S3 e CloudTrail', en: 'AWS: IAM, security groups, S3 and CloudTrail', levels: ['cloud-bucket', 'cloud-iam', 'cloud-sg', 'audit-cloudtrail'], codex: ['s3-public', 'iam-least-privilege'] },
      { it: 'Docker: configurazioni e immagini vulnerabili', en: 'Docker: configurations and vulnerable images', levels: ['report-lab', 'audit-docker'], codex: ['supply-chain'] },
      { it: 'API security: BOLA, JWT e rate limiting', en: 'API security: BOLA, JWT and rate limiting', levels: ['arena-idor', 'wire-jwt', 'cloud-gateway'], codex: ['api-security'] },
      { it: 'Secret scanning, dipendenze, Prowler e Trivy', en: 'Secret scanning, dependencies, Prowler and Trivy', levels: ['cloud-keys', 'cloud-scan', 'audit-deps', 'audit-prowler'], codex: ['secrets', 'sast'] },
    ],
    lab: { it: 'Analizza una piccola app di test Node/React con API e account cloud di laboratorio.', en: 'Analyse a small Node/React test app with an API and a lab cloud account.' },
    practise: [{ label: 'OWASP API Security Top 10', url: 'https://owasp.org/API-Security/' }, { label: 'Prowler documentation', url: 'https://docs.prowler.com/' }, JUICE],
  },
  {
    id: 'w11',
    title: 'Weeks 11–12: a full audit',
    it: 'Settimane 11–12 | Audit completo',
    items: [
      { it: 'OWASP ASVS: requisiti e controlli', en: 'OWASP ASVS: requirements and controls', levels: ['audit-asvs'], codex: ['standards'] },
      { it: 'CIS Benchmarks per hardening', en: 'CIS Benchmarks for hardening', levels: ['audit-cis'], codex: ['standards'] },
      { it: 'Classificazione rischi e priorità', en: 'Risk classification and priorities', levels: ['report-cvss', 'scan-kev', 'scan-boss'], codex: ['cvss', 'kev'] },
      { it: 'Report tecnico, executive summary e retest', en: 'Technical report, executive summary and retest', levels: ['report-finding', 'report-retest', 'audit-summary'], codex: ['finding-format', 'retesting'] },
    ],
    lab: { it: 'Esegui un assessment completo su un laboratorio: scoperta, test, evidenze, correzioni e retest.', en: 'Run a full assessment on a lab: discovery, testing, evidence, fixes and retest.' },
    practise: [{ label: 'OWASP ASVS', url: 'https://owasp.org/www-project-application-security-verification-standard/' }, { label: 'CIS Benchmarks', url: 'https://www.cisecurity.org/cis-benchmarks' }, HTB],
  },
  {
    id: 'tools',
    title: 'The tools to know',
    it: 'Gli strumenti da conoscere',
    items: [
      { it: 'Nmap (alta)', en: 'Nmap: hosts, ports, services, versions (high priority)', levels: ['perimeter-sweep', 'perimeter-ports', 'perimeter-versions'] },
      { it: 'Burp Suite (alta)', en: 'Burp Suite: intercept and change HTTP requests (high)', levels: ['wire-replay', 'wire-httponly', 'wire-cors'] },
      { it: 'OWASP ZAP (alta)', en: 'OWASP ZAP: web proxy and scanner (high)', levels: ['report-lab'] },
      { it: 'Greenbone / OpenVAS (alta)', en: 'Greenbone / OpenVAS: infrastructure vulnerability assessment (high)', levels: ['scan-feed', 'scan-task', 'scan-qod', 'scan-auth'] },
      { it: 'Wireshark (alta)', en: 'Wireshark: inspect network traffic (high)', levels: ['pcap-filter', 'pcap-stream', 'pcap-creds'] },
      { it: 'Nuclei (media)', en: 'Nuclei: template-based checks (medium)', levels: ['msf-nse'] },
      { it: 'Metasploit (media)', en: 'Metasploit: modules for controlled checks and exploits (medium)', levels: ['msf-modules', 'msf-auxiliary', 'msf-check'] },
      { it: 'Prowler (media)', en: 'Prowler: cloud configuration audit (medium)', levels: ['audit-prowler'] },
      { it: 'Semgrep / Trivy (media)', en: 'Semgrep / Trivy: code, dependencies and containers (medium)', levels: ['cloud-scan', 'audit-docker', 'audit-deps'] },
    ],
    practise: [TRYHACKME, HTB],
  },
  {
    id: 'frameworks',
    title: 'Checklists and frameworks',
    it: 'Checklist e framework',
    items: [
      { it: 'OWASP Top 10', en: 'OWASP Top 10: the main web application risks', levels: ['arena-sqli', 'arena-xss', 'arena-idor', 'arena-cmdi', 'arena-ssrf', 'arena-mass'], codex: ['owasp-top10'] },
      { it: 'OWASP ASVS', en: 'OWASP ASVS: verifiable security requirements', levels: ['audit-asvs'] },
      { it: 'OWASP WSTG', en: 'OWASP WSTG: how to test web applications', levels: ['audit-wstg'] },
      { it: 'OWASP API Top 10', en: 'OWASP API Top 10: common API risks', levels: ['arena-idor', 'cloud-gateway', 'wire-jwt'] },
      { it: 'CIS Benchmarks', en: 'CIS Benchmarks: hardening for each system', levels: ['audit-cis'] },
      { it: 'CIS Controls', en: 'CIS Controls: priority measures', levels: ['audit-cis'], codex: ['standards'] },
      { it: 'NIST CSF', en: 'NIST CSF: governance and cyber risk management', levels: ['audit-summary'], codex: ['standards'] },
    ],
    practise: [{ label: 'OWASP Top 10', url: 'https://owasp.org/www-project-top-ten/' }],
  },
  {
    id: 'finding',
    title: 'The process and the finding',
    it: 'Il processo di un assessment e il formato minimo di un finding',
    items: [
      { it: 'Scope e inventario asset', en: 'Scope and asset inventory', levels: ['perimeter-scope', 'scan-target', 'report-phases'] },
      { it: 'Reconnaissance e discovery', en: 'Reconnaissance and discovery', levels: ['perimeter-sweep', 'perimeter-ports'] },
      { it: 'Vulnerability assessment', en: 'Vulnerability assessment', levels: ['perimeter-versions', 'scan-task'] },
      { it: 'Validation / exploitation', en: 'Validation / exploitation', levels: ['perimeter-false-positive', 'msf-check'] },
      { it: 'Risk assessment e report', en: 'Risk assessment and report', levels: ['report-cvss', 'report-finding', 'scan-kev'] },
      { it: 'Remediation e retesting', en: 'Remediation and retesting', levels: ['report-retest', 'scan-boss'] },
      { it: 'Titolo, asset, impatto, evidenza, rischio, correzione, retest', en: 'Title, asset, impact, evidence, risk, fix, retest', levels: ['report-finding'], codex: ['finding-format'] },
    ],
    practise: [PORTSWIGGER],
  },
  {
    id: 'lab',
    title: 'The home lab',
    it: 'Home cybersecurity lab',
    items: [
      { it: 'Rete virtuale isolata, VM Kali, Linux di test, Juice Shop, Greenbone; snapshot; mai esporre su Internet', en: 'An isolated virtual network, a Kali VM, a Linux test VM, Juice Shop and Greenbone; snapshots; never exposed to the internet', levels: ['report-lab'], codex: ['home-lab'] },
      { it: 'docker run --rm -p 127.0.0.1:3000:3000 bkimminich/juice-shop', en: 'Juice Shop in Docker, bound to 127.0.0.1 only', levels: ['report-lab'] },
    ],
    practise: [JUICE],
  },
];
