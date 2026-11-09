import type { Zone } from './types';

export const ZONES: Zone[] = [
  {
    id: 'wire',
    name: 'The Wire',
    tagline: 'HTTP, cookies, sessions and tokens',
    intro: 'A small browser on one side, the raw HTTP it sends on the other. Edit the request, press Send, and watch the page change.',
    levelIds: ['wire-robots', 'wire-cookie-role', 'wire-replay', 'wire-httponly', 'wire-jwt', 'wire-cors'],
  },
  {
    id: 'arena',
    name: 'The Arena',
    tagline: 'The OWASP Top 10, attacked and then fixed',
    intro: 'A tiny vulnerable app and its server code. Break it with a real payload, then change the code until your own attack fails and the app still works.',
    levelIds: ['arena-sqli', 'arena-xss', 'arena-idor', 'arena-cmdi', 'arena-ssrf', 'arena-mass'],
  },
  {
    id: 'perimeter',
    name: 'The Perimeter',
    tagline: 'Hosts, ports, versions, CVEs and the scanner that guesses',
    intro: 'A terminal on a simulated network. Sweep it with nmap, read banners, look up CVEs, and submit what you can prove.',
    levelIds: ['perimeter-sweep', 'perimeter-ports', 'perimeter-versions', 'perimeter-false-positive', 'perimeter-scope', 'perimeter-boss'],
  },
  {
    id: 'cloud',
    name: 'The Cloud',
    tagline: 'Buckets, IAM, firewalls, keys, code and APIs',
    intro: 'A cloud console with a live checker beside it, like a test suite. Edit the config until every test is green and the app still works.',
    levelIds: ['cloud-bucket', 'cloud-iam', 'cloud-sg', 'cloud-keys', 'cloud-scan', 'cloud-gateway'],
  },
  {
    id: 'report',
    name: 'The Report',
    tagline: 'The method, the score, the write-up and the lab',
    intro: 'Turn what you found into something a client can act on: order the work, score it, write it, retest it, and build the lab to keep practising.',
    levelIds: ['report-phases', 'report-cvss', 'report-finding', 'report-retest', 'report-lab'],
  },
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<string, Zone>;
