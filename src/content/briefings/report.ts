import type { Briefing } from '../types';

const M = 'Ines';

export const REPORT_BRIEFINGS: Briefing[] = [
  {
    missionId: 'report-phases',
    mentor: M,
    beats: [
      {
        id: 'scope-first',
        concepts: ['six-phases', 'scope-first'],
        say: 'An assessment runs in six phases, in order, and the first is never skipped. Which comes first?',
        material: {
          kind: 'lines',
          title: 'The six phases',
          lines: ['Scope and asset inventory', 'Reconnaissance', 'Vulnerability assessment', 'Validation', 'Report', 'Remediation and retest'],
        },
        action: { kind: 'choose', options: ['Scope and authorisation', 'Reconnaissance', 'Vulnerability assessment'], answer: 0 },
        then: 'Right. Written authorisation and the targets come first. Without scope you have no job and no permission.',
        codex: 'six-phases',
      },
      {
        id: 'recon-then-scan',
        concepts: ['six-phases'],
        say: 'After scope comes discovery, then the scan. Running Nmap for hosts, ports and versions belongs to which phase?',
        material: {
          kind: 'lines',
          title: 'An activity',
          lines: ['Run Nmap for host, port and version discovery'],
        },
        action: { kind: 'choose', options: ['Reconnaissance and discovery', 'Validation', 'Report'], answer: 0 },
        then: 'Right. You find the surface before you test it. The vulnerability scan comes after, on what you found.',
      },
      {
        id: 'validate-then-report',
        concepts: ['six-phases', 'validate-before-report'],
        say: 'You never report what you have not validated. Sending one controlled request to confirm a traversal belongs to which phase?',
        material: {
          kind: 'lines',
          title: 'An activity',
          lines: ['Send a controlled request to confirm a path traversal, then stop'],
        },
        action: { kind: 'choose', options: ['Validation and exploitation', 'Report', 'Remediation'], answer: 0 },
        then: 'Right. Validate, then write it up with evidence, then the client fixes and you retest. Now order the phases and sort the activities.',
      },
    ],
  },
  {
    missionId: 'report-standards',
    mentor: M,
    beats: [
      {
        id: 'owasp',
        concepts: ['owasp-standards'],
        say: 'The Shelf is a timed sort of the standards you cite. The OWASP family is about web application security: the Top 10 tells you which risks to know. Which standard is the awareness list?',
        material: {
          kind: 'lines',
          title: 'OWASP',
          lines: ['Top 10: awareness list', 'ASVS: requirements', 'WSTG: how to test', 'API Top 10: API risks'],
        },
        action: { kind: 'choose', options: ['OWASP Top 10', 'OWASP ASVS', 'OWASP WSTG'], answer: 0 },
        then: 'Right. ASVS says what to meet, WSTG says how to test, the API Top 10 covers API-specific risks.',
        codex: 'standards',
      },
      {
        id: 'cis',
        concepts: ['cis-standards'],
        say: 'CIS is about hardening and priorities. The Benchmarks harden a specific system; the Controls prioritise measures. Which one hardens a system?',
        material: {
          kind: 'lines',
          title: 'CIS',
          lines: ['Benchmarks: harden a platform or service', 'Controls: prioritised measures'],
        },
        action: { kind: 'choose', options: ['CIS Benchmarks', 'CIS Controls'], answer: 0 },
        then: 'Right. Benchmarks for a machine, Controls for a programme.',
      },
      {
        id: 'nist',
        concepts: ['nist-csf'],
        say: 'NIST frames the whole risk picture. The CSF is about governing and managing cyber risk across an organisation. Pick what it is for.',
        material: {
          kind: 'lines',
          title: 'NIST CSF',
          lines: ['A framework to govern and manage cyber risk'],
        },
        action: { kind: 'choose', options: ['How to govern cyber risk', 'A programming-language standard', 'A pentester certificate'], answer: 0 },
        then: 'Right. OWASP for web risk, CIS for hardening, NIST for governance. Now match them under the clock.',
      },
    ],
  },
  {
    missionId: 'report-home-lab',
    mentor: M,
    beats: [
      {
        id: 'isolation',
        concepts: ['lab-isolation'],
        say: 'You practise in an isolated lab, never on systems you are not authorised to test. The host with a hypervisor runs that isolated network. Which role is it?',
        material: {
          kind: 'lines',
          title: 'A component',
          lines: ['Host machine with a hypervisor or containers'],
        },
        action: { kind: 'choose', options: ['Runs the isolated network', 'The tools machine', 'A safe target'], answer: 0 },
        then: 'Right. Snapshots let you roll back to a clean state, and nothing in the lab is exposed to the internet.',
        codex: 'home-lab',
      },
      {
        id: 'tools',
        concepts: ['lab-tools'],
        say: 'The tools machine is where Nmap, Burp and the rest live. Which component is that?',
        material: {
          kind: 'lines',
          title: 'A component',
          lines: ['A Kali Linux VM'],
        },
        action: { kind: 'choose', options: ['The tools machine', 'A safe target', 'Runs the network'], answer: 0 },
        then: 'Right. The scanner, Greenbone or OpenVAS, is added later as it needs more resources.',
      },
      {
        id: 'targets',
        concepts: ['lab-targets'],
        say: 'And you need something safe to attack. A deliberately vulnerable web app like Juice Shop is a target to practise on. Pick its role.',
        material: {
          kind: 'lines',
          title: 'A component',
          lines: ['A deliberately vulnerable web app (OWASP Juice Shop)'],
        },
        action: { kind: 'choose', options: ['A safe web target', 'The tools machine', 'A clean state to return to'], answer: 0 },
        then: 'Right. A plain test VM gives you ports and configs to scan. Now match every component to its role.',
      },
    ],
  },
  {
    missionId: 'report-final-triage',
    mentor: M,
    beats: [
      {
        id: 'validated-finding',
        concepts: ['reproduced-true-positive'],
        say: 'Last call before the report. Only validated items become findings. Your own test changed an id and read another order, with evidence saved. What is the call?',
        material: {
          kind: 'lines',
          title: 'IDOR on /api/v1/orders',
          lines: ['Request and anonymised response saved', 'One other record read, then stopped'],
        },
        action: { kind: 'choose', options: ['Goes in as a finding', 'Dropped as a false positive', 'Needs validation'], answer: 0 },
        then: 'Right. Validated, with evidence and restraint. It is a finding.',
        codex: 'finding-format',
      },
      {
        id: 'out-of-scope',
        concepts: ['out-of-scope'],
        say: 'An expired certificate is real, but it is on a staging host that is not in scope. Out of scope means out of the report entirely. What is the call?',
        material: {
          kind: 'lines',
          title: 'Expired certificate',
          lines: ['notAfter two years ago', 'Host is staging, not in scope'],
        },
        action: { kind: 'choose', options: ['Goes in as a finding', 'Dropped: out of scope', 'Needs validation'], answer: 1 },
        then: 'Right. It does not belong in this report at all. Scope decides what you may even mention.',
      },
      {
        id: 'unproven',
        concepts: ['needs-validation'],
        say: 'A form with no CSRF token looks bad, but the session cookie is SameSite=Strict, which may already block the attack, and no cross-site test was run. What is the honest call?',
        material: {
          kind: 'lines',
          title: 'Possible CSRF on /profile/update',
          lines: ['No anti-CSRF token field', 'Session cookie is SameSite=Strict', 'No cross-site test attempted'],
        },
        action: { kind: 'choose', options: ['Goes in as a finding', 'Dropped as a false positive', 'Needs validation'], answer: 2 },
        then: 'Right. Until a cross-site test confirms it, it needs validation, not a verdict. That honesty is what the client pays for. Now make every call.',
      },
    ],
  },
  {
    missionId: 'report-cvss',
    mentor: M,
    beats: [
      {
        id: 'idor-score',
        concepts: ['cvss-impact'],
        say: 'Two validated findings still need a CVSS base score. The IDOR needs an account, works over the network, exposes data but changes nothing. Which impact set fits?',
        material: {
          kind: 'lines',
          title: 'IDOR reading other orders',
          lines: ['Any logged-in customer can read another\'s order; nothing is changed or taken down.'],
        },
        action: { kind: 'choose', options: ['C:H, I:N, A:N', 'C:H, I:H, A:H', 'C:N, I:N, A:H'], answer: 0 },
        then: 'Right, confidentiality only. With PR:L for the account it lands at 6.5, Medium.',
        codex: 'cvss',
      },
      {
        id: 'git-score',
        concepts: ['cvss-impact'],
        say: 'The exposed .git needs no account at all: anyone on the internet downloads the source. How does that change the privileges metric compared with the IDOR?',
        material: {
          kind: 'lines',
          title: 'Exposed .git directory',
          lines: ['Anyone can download the repository, no account, no interaction.'],
        },
        action: { kind: 'choose', options: ['No privileges needed (PR:N)', 'Low privileges (PR:L)', 'High privileges (PR:H)'], answer: 0 },
        then: 'Right. PR:N instead of PR:L pushes the same confidentiality-only impact up to 7.5, High. In a report, CVSS supports your rating; it does not replace your account of the impact. Now set both.',
      },
      {
        id: 'not-overstated',
        concepts: ['cvss-impact'],
        say: 'A common mistake is to overstate. Neither finding changes data or takes the service down. Could either be a 10.0 Critical?',
        material: {
          kind: 'lines',
          title: 'The question',
          lines: ['Both are read-only, in-scope confidentiality issues. Critical 10.0?'],
        },
        action: { kind: 'choose', options: ['Yes, data exposure is always critical', 'No: no integrity or availability impact'], answer: 1 },
        then: 'Right. The score follows the metrics, not the adrenaline. Set the dials honestly.',
      },
    ],
  },
  {
    missionId: 'report-boss',
    mentor: M,
    beats: [
      {
        id: 'title-asset',
        concepts: ['finding-title', 'finding-asset'],
        say: 'The final act: build a finding, field by field. A title names the bug, the endpoint and the effect. Pick the one that does.',
        material: {
          kind: 'lines',
          title: 'Title candidates',
          lines: ['A: Broken object level authorization on GET /api/v1/orders/{id} exposes other customers\' orders', 'B: Security issue in the orders API', 'C: Critical hack found, fix immediately'],
        },
        action: { kind: 'choose', options: ['A', 'B', 'C'], answer: 0 },
        then: 'Right. B is vague, C is alarm without information. The asset field then names the host, the endpoint and that it is in scope.',
        codex: 'finding-format',
      },
      {
        id: 'impact-evidence',
        concepts: ['finding-impact', 'finding-evidence'],
        say: 'Impact says what happens, to whom, under what condition. Evidence is reproducible and restrained: one record read, anonymised, then stop. Which evidence is right?',
        material: {
          kind: 'lines',
          title: 'Evidence candidates',
          lines: ['A: Request and anonymised response for one other order, owner mismatch shown; one record, then stopped', 'B: I saw other orders', 'C: Full dump of all 40,000 orders attached'],
        },
        action: { kind: 'choose', options: ['A', 'B', 'C'], answer: 0 },
        then: 'Right. B proves nothing; C is harmful and out of scope. Restraint is part of the craft.',
      },
      {
        id: 'risk-fix',
        concepts: ['finding-risk', 'finding-fix'],
        say: 'Risk gives likelihood, impact and a CVSS vector that supports them. The fix must be concrete and verifiable. Which fix is right?',
        material: {
          kind: 'lines',
          title: 'Fix candidates',
          lines: ['A: Enforce ownership server side: return the order only if its customer id matches the caller; 404 otherwise', 'B: Make the API more secure', 'C: Switch the order ids to UUIDs'],
        },
        action: { kind: 'choose', options: ['A', 'B', 'C'], answer: 0 },
        then: 'Right. B is not actionable; C hides the door without locking it. The ownership check is the fix.',
      },
      {
        id: 'retest',
        concepts: ['finding-retest'],
        say: 'Last field. Retest states what was retested and the result. Pick the one that does.',
        material: {
          kind: 'lines',
          title: 'Retest candidates',
          lines: ['A: After the fix, the same request for another customer\'s order returns 404; your own still load. Closed.', 'B: They said they fixed it', 'C: (left blank)'],
        },
        action: { kind: 'choose', options: ['A', 'B', 'C'], answer: 0 },
        then: 'Right. A claim is not a retest, and the field is part of the finding. Now build the whole thing. This is the job.',
      },
    ],
  },
];
