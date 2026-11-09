import type { Zone } from './types';

export const ZONES: Zone[] = [
  {
    id: 'wire',
    name: 'The Wire',
    tagline: 'HTTP, cookies, sessions and tokens',
    intro: [
      'Everything a web app does is a request and a response. Before you can break a login or spot a leak, you have to read the wire fluently: methods, headers, cookies, tokens.',
      'In this zone you read raw traffic, find what is missing or exposed, and fix the auth flows that trust the wrong thing.',
    ],
    missionIds: ['wire-headers', 'wire-tokens', 'wire-cookies', 'wire-login-lab', 'wire-session-lab'],
    bossId: 'wire-boss',
  },
  {
    id: 'arena',
    name: 'The Arena',
    tagline: 'The OWASP Top 10 and how each one is stopped',
    intro: [
      'The OWASP Top 10 is the list of the risks that hurt web applications most. It is not a checklist to tick; it is a map of what attackers try first.',
      'In the Arena the attacks come at you by name. Each one has a defence that works and several that do not. Learn which is which.',
    ],
    missionIds: ['arena-lineup', 'arena-injection', 'arena-access', 'arena-xss-hunt', 'arena-design'],
    bossId: 'arena-boss',
  },
  {
    id: 'perimeter',
    name: 'The Perimeter',
    tagline: 'Hosts, ports, versions, CVEs and the scanner that lies',
    intro: [
      'A host on a network is a set of open ports, each with a service and a version behind it. Recon is finding them; assessment is knowing which ones matter.',
      'Here you run scans, read them, score what you find with CVSS, and learn when a scanner is right and when it is guessing.',
    ],
    missionIds: ['perimeter-first-scan', 'perimeter-versions', 'perimeter-nmap-flags', 'perimeter-cvss', 'perimeter-triage'],
    bossId: 'perimeter-boss',
  },
  {
    id: 'cloud',
    name: 'The Cloud',
    tagline: 'Buckets, IAM, security groups, APIs and the code behind them',
    intro: [
      'In the cloud the perimeter is a policy document. A bucket, a role or a security group is one line away from public, and an API is one id away from someone else\'s data.',
      'In this zone you audit configurations, break object-level authorization and then fix it, and hunt the secrets that should never have been committed.',
    ],
    missionIds: ['cloud-bucket', 'cloud-iam', 'cloud-api-gate', 'cloud-secrets', 'cloud-pipeline'],
    bossId: 'cloud-boss',
  },
  {
    id: 'report',
    name: 'The Report',
    tagline: 'The assessment process, the finding, and the lab to practise in',
    intro: [
      'A scanner suggests where a problem might be. The analyst verifies it, measures the impact and writes it so the client can fix it. That writing is the product.',
      'This zone is the method: the six phases of an assessment, the seven fields of a finding, the standards you work against, and the home lab where you practise safely.',
    ],
    missionIds: ['report-phases', 'report-standards', 'report-home-lab', 'report-final-triage', 'report-cvss'],
    bossId: 'report-boss',
  },
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<string, Zone>;
