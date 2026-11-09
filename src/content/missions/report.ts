import type { Mission } from '../types';

export const REPORT_MISSIONS: Mission[] = [
  {
    id: 'report-phases',
    kind: 'order',
    zone: 'report',
    title: 'Six Phases',
    brief:
      'An assessment runs in six phases, in order. First put the phases in the right sequence. Then take each activity from the tray and drop it on the phase it belongs to.',
    objective: 'Order the six phases, then sort every activity under the right one.',
    minutes: 5,
    xp: 140,
    codex: ['six-phases'],
    debrief:
      'Scope, then recon, then the scan, then the check, then the write-up, then the fix and the retest. You never skip scope, and you never report what you have not validated.',
    seconds: 240,
    concept: 'six-phases',
    phases: [
      { id: 'p1', name: 'Scope and asset inventory', result: 'Authorisations, targets, exclusions, the systems to test' },
      { id: 'p2', name: 'Reconnaissance and discovery', result: 'Hosts, ports, services, endpoints, technologies' },
      { id: 'p3', name: 'Vulnerability assessment', result: 'Scans and checks that find potential problems' },
      { id: 'p4', name: 'Validation and exploitation', result: 'Confirmation through controlled, non-destructive tests' },
      { id: 'p5', name: 'Risk assessment and report', result: 'Evidence, impact, likelihood and priority' },
      { id: 'p6', name: 'Remediation and retesting', result: 'Fixes, updates and a fresh test' },
    ],
    activities: [
      { text: 'Get written authorisation and agree what is out of scope', phase: 'p1' },
      { text: 'List the assets and their owners', phase: 'p1' },
      { text: 'Run Nmap for host, port and version discovery', phase: 'p2' },
      { text: 'Map the application\'s endpoints and technologies', phase: 'p2' },
      { text: 'Run Greenbone and Nuclei against the in-scope hosts', phase: 'p3' },
      { text: 'Collect the scanner output for triage', phase: 'p3' },
      { text: 'Send a controlled request to confirm a path traversal', phase: 'p4' },
      { text: 'Prove an IDOR by reading one other record, then stop', phase: 'p4' },
      { text: 'Rate each confirmed finding by impact and likelihood', phase: 'p5' },
      { text: 'Write the findings with evidence and fixes', phase: 'p5' },
      { text: 'Apply the patches and configuration changes', phase: 'p6' },
      { text: 'Retest the fixes and update the finding status', phase: 'p6' },
    ],
  },
  {
    id: 'report-standards',
    kind: 'cards',
    zone: 'report',
    title: 'The Shelf',
    brief:
      'Standards you cite in reports fly in one at a time. Match each to what it is for before the clock runs out, and keep the streak alive.',
    objective: 'Match every standard to its purpose. Accuracy leads; the streak and speed follow.',
    minutes: 3,
    xp: 100,
    codex: ['standards'],
    debrief:
      'OWASP tells you the web risks, the requirements and how to test. CIS hardens systems and sets priorities. NIST frames the whole risk-management picture.',
    promptLabel: 'Standard',
    answerLabel: 'What it is for',
    secondsPerCard: 12,
    cards: [
      { id: 's1', text: 'OWASP Top 10', answer: 'u1', explain: 'An awareness list of the main web application risks.', concept: 'owasp-standards' },
      { id: 's2', text: 'OWASP ASVS', answer: 'u2', explain: 'Verifiable application-security requirements.', concept: 'owasp-standards' },
      { id: 's3', text: 'OWASP WSTG', answer: 'u3', explain: 'A methodology and test cases for web applications.', concept: 'owasp-standards' },
      { id: 's4', text: 'OWASP API Security Top 10', answer: 'u4', explain: 'The common risks specific to APIs.', concept: 'owasp-standards' },
      { id: 's5', text: 'CIS Benchmarks', answer: 'u5', explain: 'Hardening guides for systems, platforms and services.', concept: 'cis-standards' },
      { id: 's6', text: 'CIS Controls', answer: 'u6', explain: 'Prioritised organisational and technical measures.', concept: 'cis-standards' },
      { id: 's7', text: 'NIST CSF', answer: 'u7', explain: 'Governance and management of cyber risk.', concept: 'nist-csf' },
    ],
    answers: [
      { id: 'u1', label: 'Which web risks to know' },
      { id: 'u2', label: 'Which requirements to meet' },
      { id: 'u3', label: 'How to test a web app' },
      { id: 'u4', label: 'The common risks of APIs' },
      { id: 'u5', label: 'How to harden a system' },
      { id: 'u6', label: 'Which measures to prioritise' },
      { id: 'u7', label: 'How to govern cyber risk' },
    ],
  },
  {
    id: 'report-home-lab',
    kind: 'cards',
    zone: 'report',
    title: 'The Home Lab',
    brief:
      'You are building a lab to practise in safely. The components fly in one at a time; match each to its role before the clock runs out.',
    objective: 'Match every component to its role. Keep the streak and beat the clock for the bonus.',
    minutes: 3,
    xp: 100,
    codex: ['home-lab', 'scanner-principle'],
    debrief:
      'An isolated network, a tools machine, a target or two and a deliberately vulnerable app. Snapshots, no exposure to the internet, and never anything outside systems you are authorised to test.',
    promptLabel: 'Component',
    answerLabel: 'Its role',
    secondsPerCard: 12,
    cards: [
      { id: 'c1', text: 'Host machine with a hypervisor or containers', answer: 'r1', explain: 'Runs the isolated virtual network.', concept: 'lab-isolation' },
      { id: 'c2', text: 'A Kali Linux VM', answer: 'r2', explain: 'The tools machine: Nmap, Burp Suite and the rest.', concept: 'lab-tools' },
      { id: 'c3', text: 'A deliberately vulnerable web app', answer: 'r3', explain: 'A safe web target to practise on, such as OWASP Juice Shop.', concept: 'lab-targets' },
      { id: 'c4', text: 'A plain Linux test VM', answer: 'r4', explain: 'Services, ports and configurations to scan.', concept: 'lab-targets' },
      { id: 'c5', text: 'Greenbone / OpenVAS', answer: 'r5', explain: 'Vulnerability scans across the lab machines; added later, as it needs more resources.', concept: 'lab-tools' },
      { id: 'c6', text: 'VM snapshots', answer: 'r6', explain: 'Roll back to a clean state after each exercise.', concept: 'lab-isolation' },
    ],
    answers: [
      { id: 'r1', label: 'Runs the isolated network' },
      { id: 'r2', label: 'The tools machine' },
      { id: 'r3', label: 'A safe web target' },
      { id: 'r4', label: 'A target to scan' },
      { id: 'r5', label: 'Vulnerability scanning' },
      { id: 'r6', label: 'A clean state to return to' },
    ],
  },
  {
    id: 'report-final-triage',
    kind: 'triage',
    zone: 'report',
    title: 'Last Call',
    brief:
      'The assessment is nearly written. These are the items still open. For each, decide whether it goes in as a finding, gets dropped as a false positive, or is marked as needing validation.',
    objective: 'Make the right call on every open item.',
    minutes: 4,
    xp: 130,
    codex: ['scanner-principle', 'finding-format'],
    debrief:
      'Only validated items become findings. A false positive is recorded with why. Anything unproven is honest about being unproven. That honesty is what a client is paying for.',
    secondsPerItem: 28,
    items: [
      {
        tool: 'Your test',
        title: 'IDOR on /api/v1/orders confirmed',
        scannerSays: 'You changed the id and read another order.',
        evidence: ['Request and anonymised response saved', 'One other record read, then stopped', 'Owner mismatch shown in the body'],
        answer: 'true',
        explain: 'Validated, with evidence and restraint. It is a finding.', concept: 'reproduced-true-positive' },
      {
        tool: 'OpenVAS',
        title: 'SSL/TLS: certificate expired (Medium)',
        scannerSays: 'notAfter in the past.',
        evidence: ['openssl s_client shows notAfter two years ago', 'Tested against a staging host that is not in scope'],
        answer: 'false',
        explain: 'The host is out of scope. It does not belong in this report at all, so it is dropped from the findings.', concept: 'out-of-scope' },
      {
        tool: 'ZAP',
        title: 'Possible CSRF on /profile/update (Medium)',
        scannerSays: 'No anti-CSRF token field seen.',
        evidence: ['The form has no token', 'The session cookie is SameSite=Strict', 'No cross-site test attempted yet'],
        answer: 'validate',
        explain: 'SameSite=Strict may already block the attack. Until a cross-site test is run, it needs validation, not a verdict.', concept: 'needs-validation' },
      {
        tool: 'Nuclei',
        title: 'Exposed .git directory (High)',
        scannerSays: '/.git/HEAD returned 200.',
        evidence: ['/.git/HEAD and /.git/config both download', 'Repository reconstructed in the lab from the exposed objects'],
        answer: 'true',
        explain: 'Seen and reproduced, with source recovered. A real finding.', concept: 'reproduced-true-positive' },
      {
        tool: 'OpenVAS',
        title: 'Server supports deprecated TLS 1.1 (Low)',
        scannerSays: 'Handshake with TLS 1.1 succeeded.',
        evidence: ['Reproduced with openssl -tls1_1', 'In scope'],
        answer: 'true',
        explain: 'Low, but real and in scope. It goes in, rated low.', concept: 'reproduced-true-positive' },
    ],
  },
  {
    id: 'report-cvss',
    kind: 'cvss',
    zone: 'report',
    title: 'Rate It',
    brief:
      'Two of your validated findings still need a CVSS base score for the report. Set the metrics from the description.',
    objective: 'Match the vector for each finding.',
    minutes: 4,
    xp: 130,
    codex: ['cvss', 'finding-format'],
    debrief:
      'In a report CVSS is one line of the risk field. It supports your rating; it does not replace your account of impact and likelihood in this client\'s system.',
    cases: [
      {
        title: 'IDOR reading other customers\' orders',
        description:
          'Any logged-in customer can read another customer\'s order by changing the id in the URL. It works over the network with an ordinary account and no help from the victim. It exposes personal data but changes nothing and takes nothing down, and the effect stays within the application.',
        vector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N',
        explain: 'Network, low complexity, low privileges (an account), no interaction, scope unchanged, confidentiality high only. Score 6.5, Medium.', concept: 'cvss-impact' },
      {
        title: 'Exposed .git directory leaking source',
        description:
          'The web server serves its .git directory, so anyone on the internet can download the repository and reconstruct the source, with no account and no interaction. It reveals the code and any secrets committed to it, but does not let the attacker change the running app or stop it, and the impact is on the web application itself.',
        vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
        explain: 'Network, low complexity, no privileges, no interaction, scope unchanged, confidentiality high. Score 7.5, High.', concept: 'cvss-impact' },
    ],
  },
  {
    id: 'report-boss',
    kind: 'boss',
    zone: 'report',
    title: 'Boss: The Report',
    brief:
      'The final act. Build a finding from fragments, field by field. The better each choice, the higher the client\'s trust in the report. Seven fields, one finding, one grade for the whole game.',
    objective: 'Assemble the strongest finding. Weak or wrong fragments cost the client\'s trust.',
    minutes: 6,
    xp: 350,
    codex: ['finding-format'],
    debrief:
      'A finding with all seven fields, each one precise and evidenced, is the product of the whole process. You started by reading a header; you finished by writing something a client can act on. That is the job.',
    stages: ['stage-report-boss-report'],
  },
  {
    id: 'stage-report-boss-report',
    kind: 'report',
    zone: 'report',
    title: 'The Report: the finding',
    brief: 'Pick the best fragment for each field.',
    objective: 'Seven fields, best fragment each.',
    minutes: 6,
    xp: 0,
    codex: ['finding-format'],
    debrief: '',
    scenario: [
      'On the client\'s web shop, logged in as an ordinary customer, you changed the order id in GET /api/v1/orders/{id} and received another customer\'s order, including their name and shipping address.',
      'You read exactly one other record to prove it, saved the request and the anonymised response, and stopped. Now write it up.',
    ],
    fields: [
      {
        name: 'Title',
        options: [
          { text: 'Broken object level authorization (IDOR) on GET /api/v1/orders/{id} exposes other customers\' orders', quality: 'good', note: 'Precise: the bug, the endpoint, the effect.' },
          { text: 'Security issue in the orders API', quality: 'weak', note: 'True but vague. The reader cannot tell what or where.' },
          { text: 'Critical hack found, fix immediately', quality: 'wrong', note: 'Alarm without information. Not a title.' },
        ], concept: 'finding-title' },
      {
        name: 'Asset and scope',
        options: [
          { text: 'api.northgate-books.io, endpoint GET /api/v1/orders/{id}, production, in scope', quality: 'good', note: 'Names the host, the endpoint and that it is in scope.' },
          { text: 'The website', quality: 'weak', note: 'Which host, which endpoint? The fixer has to guess.' },
          { text: 'All of the client\'s systems', quality: 'wrong', note: 'Overclaims beyond what you tested.' },
        ], concept: 'finding-asset' },
      {
        name: 'Impact',
        options: [
          { text: 'Any authenticated customer can read any other customer\'s order, including name and shipping address, by changing the id. Personal data of the whole customer base is exposed.', quality: 'good', note: 'What happens, to whom, under what condition.' },
          { text: 'An attacker could do bad things with the data.', quality: 'weak', note: 'No specifics, so no way to judge severity.' },
          { text: 'The company will be fined millions and go bankrupt.', quality: 'wrong', note: 'Speculation outside your remit.' },
        ], concept: 'finding-impact' },
      {
        name: 'Evidence',
        options: [
          { text: 'Request and anonymised response for one other order (id 2040, owner 1987), showing the owner mismatch; one record read, then stopped.', quality: 'good', note: 'Reproducible, anonymised, and restrained.' },
          { text: 'I saw other orders.', quality: 'weak', note: 'No request, no response, nothing to reproduce.' },
          { text: 'Full dump of all 40,000 orders attached.', quality: 'wrong', note: 'Exfiltrating the whole dataset is harmful and out of scope.' },
        ], concept: 'finding-evidence' },
      {
        name: 'Risk',
        options: [
          { text: 'Likelihood high (trivial to exploit), impact high (personal data). CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N = 6.5, Medium.', quality: 'good', note: 'Likelihood, impact and a CVSS vector that supports them.' },
          { text: 'Severity: High, because it feels serious.', quality: 'weak', note: 'A rating with no reasoning or vector.' },
          { text: 'Severity: Critical, 10.0.', quality: 'wrong', note: 'Overstated: no integrity or availability impact, and privileges are required.' },
        ], concept: 'finding-risk' },
      {
        name: 'Fix',
        options: [
          { text: 'Enforce ownership server side: load the order and return it only if its customer id matches the authenticated user; return 404 otherwise.', quality: 'good', note: 'Concrete and verifiable.' },
          { text: 'Make the API more secure.', quality: 'weak', note: 'No one can act on this.' },
          { text: 'Switch the order ids to UUIDs.', quality: 'wrong', note: 'Hides the door without locking it; the authorization check is still missing.' },
        ], concept: 'finding-fix' },
      {
        name: 'Retest',
        options: [
          { text: 'After the fix, the same request for another customer\'s order returns 404; your own orders still load. Finding closed.', quality: 'good', note: 'States what was retested and the result.' },
          { text: 'They said they fixed it.', quality: 'weak', note: 'A claim, not a retest.' },
          { text: 'Left blank.', quality: 'wrong', note: 'The retest field is part of the finding.' },
        ], concept: 'finding-retest' },
    ],
  },
];
