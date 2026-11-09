// The networks behind The Perimeter's terminal. Addresses are private ranges
// or the documentation blocks (203.0.113.0/24, 198.51.100.0/24); names end in
// .lan or .example. Banners follow what the real software prints.

import type { Host, Network, HttpService } from '../sim/terminal';

const web = (server: string, title: string): HttpService => ({
  status: 200,
  headers: [
    ['Date', 'Mon, 09 Nov 2026 09:14:02 GMT'],
    ['Server', server],
    ['Content-Type', 'text/html; charset=UTF-8'],
  ],
  body: `<!doctype html><title>${title}</title><h1>${title}</h1>`,
});

const ssh = (v: string, extra: string, banner: string) => ({ port: 22, service: 'ssh', product: 'OpenSSH', version: v, extra, banner });

const HARBOR_HOSTS: Host[] = [
  { ip: '10.0.8.1', name: 'gw.harbor.lan', ports: [{ port: 53, service: 'domain', product: 'dnsmasq', version: '2.90' }, { port: 443, service: 'https', product: 'nginx', version: '1.24.0', http: web('nginx', 'Router') }] },
  {
    ip: '10.0.8.12',
    name: 'intranet.harbor.lan',
    ports: [ssh('9.6p1', 'Ubuntu 3ubuntu13.5 (Ubuntu Linux; protocol 2.0)', 'SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5'), { port: 80, service: 'http', product: 'nginx', version: '1.24.0', extra: '(Ubuntu)', http: web('nginx/1.24.0 (Ubuntu)', 'Harbor intranet') }],
  },
  {
    ip: '10.0.8.15',
    name: 'web-01.harbor.lan',
    ports: [ssh('9.6p1', 'Ubuntu 3ubuntu13.5 (Ubuntu Linux; protocol 2.0)', 'SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5'), { port: 80, service: 'http', product: 'Apache httpd', version: '2.4.58', extra: '((Ubuntu))', http: web('Apache/2.4.58 (Ubuntu)', 'Harbor Freight Booking') }],
  },
  {
    ip: '10.0.8.21',
    name: 'files.harbor.lan',
    ports: [{ port: 21, service: 'ftp', product: 'vsftpd', version: '2.3.4', banner: '220 (vsFTPd 2.3.4)' }, ssh('7.2p2', 'Ubuntu 4ubuntu2.10 (Ubuntu Linux; protocol 2.0)', 'SSH-2.0-OpenSSH_7.2p2 Ubuntu-4ubuntu2.10')],
  },
  {
    ip: '10.0.8.40',
    name: 'db-02.harbor.lan',
    ports: [ssh('9.6p1', 'Ubuntu 3ubuntu13.5 (Ubuntu Linux; protocol 2.0)', 'SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5'), { port: 5432, service: 'postgresql', product: 'PostgreSQL DB', version: '16.4' }],
  },
];

const HARBOR_DNS: Network['dns'] = {
  'harbor.example': { A: ['203.0.113.10'], MX: ['10 mail.harbor.example.'], TXT: ['"v=spf1 mx -all"'] },
  'www.harbor.example': { A: ['203.0.113.10'] },
  'mail.harbor.example': { A: ['203.0.113.25'] },
  'staging.harbor.example': { A: ['198.51.100.7'] },
};

const HARBOR_WHOIS: Record<string, string> = {
  'harbor.example': 'Domain Name: HARBOR.EXAMPLE\nRegistrant Organization: Harbor Freight Booking SAS\nRegistrant Country: FR\nName Server: NS1.HARBOR.EXAMPLE',
  '203.0.113.0/24': 'NetRange: 203.0.113.0 - 203.0.113.255\nNetName: HARBOR-FR\nOrgName: Harbor Freight Booking SAS\nCountry: FR',
  '198.51.100.0/24': 'NetRange: 198.51.100.0 - 198.51.100.255\nNetName: SKYFORGE-HOSTING-EU\nOrgName: Skyforge Cloud Ltd\nComment: Shared hosting. Abuse reports to abuse@skyforge.example\nCountry: IE',
};

const NOTES = 'Engagement: Harbor Freight Booking, internal network 10.0.8.0/24.\nAuthorised by: Claire Martin (CTO), signed 2026-11-02.\nTesting window: 9 to 17 Nov, office hours.';

export const NET_SWEEP: Network = {
  cidr: '10.0.8.0/24',
  hosts: HARBOR_HOSTS,
  dns: HARBOR_DNS,
  whois: HARBOR_WHOIS,
  files: { 'notes.txt': NOTES },
};

export const NET_PORTS: Network = { ...NET_SWEEP, files: { 'notes.txt': NOTES + '\nTodo: the database should only be reachable from web-01.' } };

export const NET_VERSIONS: Network = { ...NET_SWEEP, files: { 'notes.txt': NOTES + '\nTodo: files.harbor.lan has not been patched since it was installed.' } };

export const NET_FALSE_POSITIVE: Network = {
  ...NET_SWEEP,
  files: {
    'notes.txt': NOTES,
    'reports/scan-0311.txt': [
      'Automated scan, imported 2026-11-03 from last quarter\'s results',
      '',
      'HIGH   10.0.8.15:80   Apache httpd 2.4.49 detected',
      '       CVE-2021-41773  Path traversal and file disclosure (CVSS 7.5)',
      'LOW    10.0.8.12:80   Missing Strict-Transport-Security header',
      'INFO   10.0.8.40:5432 PostgreSQL detected',
    ].join('\n'),
  },
};

const SCOPE = [
  'Scope for the Harbor external test (signed 2026-11-02):',
  '  IN   harbor.example and its subdomains, when they resolve inside 203.0.113.0/24',
  '  OUT  anything hosted by a third party: test it only with that provider\'s written permission',
].join('\n');

export const NET_SCOPE: Network = {
  cidr: '203.0.113.0/24',
  hosts: [
    { ip: '203.0.113.10', name: 'www.harbor.example', ports: [{ port: 443, service: 'https', product: 'nginx', version: '1.24.0', http: web('nginx', 'Harbor Freight Booking') }] },
    { ip: '203.0.113.25', name: 'mail.harbor.example', ports: [{ port: 25, service: 'smtp', product: 'Postfix smtpd', banner: '220 mail.harbor.example ESMTP Postfix (Ubuntu)' }] },
    { ip: '198.51.100.7', name: 'staging.harbor.example', outOfScope: true, ports: [{ port: 80, service: 'http', product: 'nginx', http: web('nginx', 'Skyforge shared hosting') }] },
  ],
  dns: HARBOR_DNS,
  whois: HARBOR_WHOIS,
  files: { 'scope.txt': SCOPE, 'todo.txt': 'Client asked: can you also have a look at staging.harbor.example?' },
};

export const NET_BOSS: Network = {
  cidr: '10.0.9.0/24',
  hosts: [
    { ip: '10.0.9.5', name: 'proxy.dock.lan', ports: [ssh('9.6p1', 'Ubuntu 3ubuntu13.5 (Ubuntu Linux; protocol 2.0)', 'SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5'), { port: 443, service: 'https', product: 'nginx', version: '1.24.0', http: web('nginx', 'Dock proxy') }] },
    { ip: '10.0.9.9', name: 'ftp.dock.lan', ports: [{ port: 21, service: 'ftp', product: 'ProFTPD', version: '1.3.5', banner: '220 ProFTPD 1.3.5 Server (Dock files) [10.0.9.9]' }, ssh('9.6p1', 'Ubuntu 3ubuntu13.5 (Ubuntu Linux; protocol 2.0)', 'SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.5')] },
    { ip: '10.0.9.14', name: 'portal.dock.lan', ports: [{ port: 80, service: 'http', product: 'Apache httpd', version: '2.4.58', extra: '((Ubuntu))', http: web('Apache/2.4.58 (Ubuntu)', 'Dock customer portal') }] },
    { ip: '10.0.9.30', name: 'nas.dock.lan', ports: [{ port: 445, service: 'netbios-ssn', product: 'Samba smbd', version: '4.19.5-Ubuntu' }] },
    { ip: '10.0.9.31', name: 'mail.dock.lan', ports: [{ port: 25, service: 'smtp', product: 'Exim smtpd', version: '4.97', banner: '220 mail.dock.lan ESMTP Exim 4.97 Mon, 09 Nov 2026 10:14:02 +0100' }] },
  ],
  dns: {},
  whois: {},
  files: {
    'notes.txt': 'Engagement: Dock Logistics, internal network 10.0.9.0/24. Authorised, signed 2026-11-05.\nThe lead wants one thing today: the critical, verified CVE on this network.',
    'reports/scan-1105.txt': 'Automated scan, 2026-11-05\n\nHIGH   10.0.9.14:80  Apache httpd 2.4.49 detected\n       CVE-2021-41773  Path traversal (CVSS 7.5)\nMEDIUM 10.0.9.31:25  Exim smtpd detected, version unknown',
  },
};
