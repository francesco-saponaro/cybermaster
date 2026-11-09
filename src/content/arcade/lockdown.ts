// The Lockdown diagrams: Lantern's cloud account, one part at a time. Each one
// has people who need access (green), an attacker (red), and rules you can
// change: firewall rules on servers, policies on buckets, and the role a
// server runs as.

export type Origin = 'internet' | 'office' | 'internal';
export type OptionId =
  | 'fw-any' | 'fw-office' | 'fw-inside' | 'fw-closed'
  | 'pol-public' | 'pol-admin' | 'pol-billing' | 'pol-shop' | 'pol-ops' | 'pol-ci' | 'pol-billing-ci' | 'pol-ops-ci' | 'pol-shop-billing' | 'pol-none'
  | 'role-admin' | 'role-shop' | 'role-billing' | 'role-ops';
export type SlotKind = 'fw' | 'policy' | 'role';

export interface Option {
  id: OptionId;
  kind: SlotKind;
  label: string;
  /** For a firewall rule: the networks it lets in. */
  origins?: Origin[];
  /** For a policy: the roles it lets read, or 'any' for public. An admin role passes any policy but 'No one'. */
  roles?: string[] | 'any';
  /** For a role slot: the role the server runs as. */
  role?: string;
}

export const OPTIONS: Record<OptionId, Option> = {
  'fw-any': { id: 'fw-any', kind: 'fw', label: 'Anyone', origins: ['internet', 'office', 'internal'] },
  'fw-office': { id: 'fw-office', kind: 'fw', label: 'Office only', origins: ['office'] },
  'fw-inside': { id: 'fw-inside', kind: 'fw', label: 'Inside only', origins: ['internal'] },
  'fw-closed': { id: 'fw-closed', kind: 'fw', label: 'Closed', origins: [] },
  'pol-public': { id: 'pol-public', kind: 'policy', label: 'Public', roles: 'any' },
  'pol-admin': { id: 'pol-admin', kind: 'policy', label: 'Admin only', roles: ['admin'] },
  'pol-billing': { id: 'pol-billing', kind: 'policy', label: 'Billing role', roles: ['billing'] },
  'pol-shop': { id: 'pol-shop', kind: 'policy', label: 'Shop role', roles: ['shop'] },
  'pol-ops': { id: 'pol-ops', kind: 'policy', label: 'Ops role', roles: ['ops'] },
  'pol-ci': { id: 'pol-ci', kind: 'policy', label: 'CI role', roles: ['ci'] },
  'pol-billing-ci': { id: 'pol-billing-ci', kind: 'policy', label: 'Billing and CI', roles: ['billing', 'ci'] },
  'pol-ops-ci': { id: 'pol-ops-ci', kind: 'policy', label: 'Ops and CI', roles: ['ops', 'ci'] },
  'pol-shop-billing': { id: 'pol-shop-billing', kind: 'policy', label: 'Shop and billing', roles: ['shop', 'billing'] },
  'pol-none': { id: 'pol-none', kind: 'policy', label: 'No one', roles: [] },
  'role-admin': { id: 'role-admin', kind: 'role', label: 'Admin', role: 'admin' },
  'role-shop': { id: 'role-shop', kind: 'role', label: 'Shop reader', role: 'shop' },
  'role-billing': { id: 'role-billing', kind: 'role', label: 'Billing', role: 'billing' },
  'role-ops': { id: 'role-ops', kind: 'role', label: 'Ops', role: 'ops' },
};

export const SLOT_NAME: Record<SlotKind, string> = { fw: 'Firewall', policy: 'Policy', role: 'Runs as' };

export interface Slot {
  id: string;
  kind: SlotKind;
  options: OptionId[];
  initial: OptionId;
}

export interface LNode {
  id: string;
  label: string;
  /** A short line under the name: the port or what it holds. */
  sub: string;
  /** 0: who, 1: servers, 2: data. */
  col: 0 | 1 | 2;
  /** Who may enter: a slot id or a fixed option. */
  gate?: string | OptionId;
  /** The role a server runs as: a slot id or a fixed option. */
  runsAs?: string | OptionId;
  /** The attacker must never reach it. */
  crown?: boolean;
  /** Reaching it gives a shell (SSH, an admin panel, an export job): whoever gets in acts as its role and can go on from it. A web front only answers requests. */
  shell?: boolean;
}

export interface Source {
  id: string;
  label: string;
  sub: string;
  kind: 'user' | 'attacker';
  origin: Origin;
  /** A key that acts as a role straight away. */
  principal?: string;
  /** Starts already inside this server, as its role ("assume it gets broken into"). */
  startAt?: string;
  needs?: string[];
}

export interface Puzzle {
  id: string;
  title: string;
  /** One line on what is wrong, shown above the diagram. */
  brief: string;
  /** One line once it is solved: what it taught. */
  lesson: string;
  sources: Source[];
  nodes: LNode[];
  slots: Slot[];
  edges: [string, string][];
  par: number;
}

const customers: Source = { id: 'customers', label: 'Customers', sub: 'Internet, port 443', kind: 'user', origin: 'internet', needs: ['web'] };
const attacker: Source = { id: 'attacker', label: 'Attacker', sub: 'Internet', kind: 'attacker', origin: 'internet' };
const office: Source = { id: 'office', label: 'Office', sub: 'Lyon office network', kind: 'user', origin: 'office' };
const billingApp: Source = { id: 'billing-app', label: 'Billing app', sub: 'Runs on the billing server', kind: 'user', origin: 'internal', startAt: 'billing', needs: ['invoices'] };
const shopApp: Source = { id: 'shop-app', label: 'Shop app', sub: 'Runs on the web shop', kind: 'user', origin: 'internal', startAt: 'web', needs: ['products'] };
const foothold: Source = { id: 'foothold', label: 'Attacker in the shop', sub: 'Assume it gets broken into', kind: 'attacker', origin: 'internal', startAt: 'web' };

export const PUZZLES: Puzzle[] = [
  {
    id: 'invoices-bucket',
    title: 'The invoices bucket',
    brief: 'The invoices bucket is public. The billing app still has to read it.',
    lesson: 'A bucket policy names who may read. Public means anyone with the link.',
    sources: [customers, attacker, billingApp],
    nodes: [
      { id: 'web', label: 'Web shop', sub: 'Port 443', col: 1, gate: 'fw-any', runsAs: 'role-shop' },
      { id: 'billing', label: 'Billing server', sub: 'Internal', col: 1, gate: 'fw-inside', runsAs: 'role-billing' },
      { id: 'invoices', label: 'Invoices bucket', sub: 'Customer invoices', col: 2, gate: 'invoices-policy', crown: true },
    ],
    slots: [{ id: 'invoices-policy', kind: 'policy', options: ['pol-public', 'pol-billing', 'pol-none'], initial: 'pol-public' }],
    edges: [['customers', 'web'], ['attacker', 'web'], ['attacker', 'invoices'], ['billing', 'invoices']],
    par: 1,
  },
  {
    id: 'harbor-ssh',
    title: "Harbor's SSH",
    brief: 'SSH on the jump host answers the whole internet. The office uses it every day.',
    lesson: 'Open admin ports only to the networks that use them.',
    sources: [{ ...office, needs: ['bastion'] }, attacker],
    nodes: [
      { id: 'bastion', label: 'Jump host', sub: 'SSH, port 22', col: 1, gate: 'bastion-fw', runsAs: 'role-ops', shell: true },
      { id: 'db', label: 'Orders database', sub: 'Every order', col: 2, gate: 'pol-ops', crown: true },
    ],
    slots: [{ id: 'bastion-fw', kind: 'fw', options: ['fw-any', 'fw-office', 'fw-closed'], initial: 'fw-any' }],
    edges: [['office', 'bastion'], ['attacker', 'bastion'], ['bastion', 'db']],
    par: 1,
  },
  {
    id: 'two-doors',
    title: 'Two doors',
    brief: 'Both mistakes at once: a public bucket and SSH open to everyone.',
    lesson: 'Close every door, not only the first one you find.',
    sources: [customers, { ...office, needs: ['bastion'] }, attacker, billingApp],
    nodes: [
      { id: 'web', label: 'Web shop', sub: 'Port 443', col: 1, gate: 'fw-any', runsAs: 'role-shop' },
      { id: 'bastion', label: 'Jump host', sub: 'SSH, port 22', col: 1, gate: 'bastion-fw', runsAs: 'role-ops', shell: true },
      { id: 'billing', label: 'Billing server', sub: 'Internal', col: 1, gate: 'fw-inside', runsAs: 'role-billing' },
      { id: 'invoices', label: 'Invoices bucket', sub: 'Customer invoices', col: 2, gate: 'invoices-policy', crown: true },
      { id: 'db', label: 'Orders database', sub: 'Every order', col: 2, gate: 'pol-ops', crown: true },
    ],
    slots: [
      { id: 'bastion-fw', kind: 'fw', options: ['fw-any', 'fw-office', 'fw-closed'], initial: 'fw-any' },
      { id: 'invoices-policy', kind: 'policy', options: ['pol-public', 'pol-billing', 'pol-none'], initial: 'pol-public' },
    ],
    edges: [['customers', 'web'], ['office', 'bastion'], ['attacker', 'web'], ['attacker', 'bastion'], ['attacker', 'invoices'], ['bastion', 'db'], ['billing', 'invoices']],
    par: 2,
  },
  {
    id: 'assume-breach',
    title: 'Assume the shop is broken into',
    brief: 'Assume the web shop gets broken into one day. Today it runs as Admin, which can read every bucket.',
    lesson: 'Give a server the smallest role that does its job, so breaking into it gets the attacker little.',
    sources: [customers, shopApp, foothold],
    nodes: [
      { id: 'web', label: 'Web shop', sub: 'Port 443', col: 1, gate: 'fw-any', runsAs: 'web-role' },
      { id: 'products', label: 'Products bucket', sub: 'Photos and prices', col: 2, gate: 'pol-shop' },
      { id: 'invoices', label: 'Invoices bucket', sub: 'Customer invoices', col: 2, gate: 'pol-billing', crown: true },
    ],
    slots: [{ id: 'web-role', kind: 'role', options: ['role-admin', 'role-shop', 'role-billing'], initial: 'role-admin' }],
    edges: [['customers', 'web'], ['web', 'products'], ['web', 'invoices']],
    par: 1,
  },
  {
    id: 'role-and-policy',
    title: 'A role and a policy',
    brief: 'The shop runs as Admin, and the products bucket only lets Admin in. Fix both, or the shop loses its photos.',
    lesson: 'Shrinking a role means the policies it relied on have to name the new role.',
    sources: [customers, shopApp, foothold],
    nodes: [
      { id: 'web', label: 'Web shop', sub: 'Port 443', col: 1, gate: 'fw-any', runsAs: 'web-role' },
      { id: 'products', label: 'Products bucket', sub: 'Photos and prices', col: 2, gate: 'products-policy' },
      { id: 'invoices', label: 'Invoices bucket', sub: 'Customer invoices', col: 2, gate: 'pol-billing', crown: true },
    ],
    slots: [
      { id: 'web-role', kind: 'role', options: ['role-admin', 'role-shop', 'role-billing'], initial: 'role-admin' },
      { id: 'products-policy', kind: 'policy', options: ['pol-admin', 'pol-shop', 'pol-none'], initial: 'pol-admin' },
    ],
    edges: [['customers', 'web'], ['web', 'products'], ['web', 'invoices']],
    par: 2,
  },
  {
    id: 'backups',
    title: 'The backups',
    brief: 'Nightly backups sit in a public bucket, and the jump host that writes them answers anyone.',
    lesson: 'Backups hold everything. Treat them like the live data.',
    sources: [{ ...office, needs: ['bastion', 'backups'] }, attacker],
    nodes: [
      { id: 'bastion', label: 'Jump host', sub: 'SSH, port 22', col: 1, gate: 'bastion-fw', runsAs: 'role-ops', shell: true },
      { id: 'backups', label: 'Backups bucket', sub: 'Nightly copies', col: 2, gate: 'backups-policy', crown: true },
    ],
    slots: [
      { id: 'bastion-fw', kind: 'fw', options: ['fw-any', 'fw-office', 'fw-closed'], initial: 'fw-any' },
      { id: 'backups-policy', kind: 'policy', options: ['pol-public', 'pol-ops', 'pol-none'], initial: 'pol-public' },
    ],
    edges: [['office', 'bastion'], ['attacker', 'bastion'], ['attacker', 'backups'], ['bastion', 'backups']],
    par: 2,
  },
  {
    id: 'inside-only',
    title: 'Inside only',
    brief: 'The orders database and the admin panel both answer the internet.',
    lesson: 'A database talks to the app, never to the internet. An admin panel answers the office.',
    sources: [customers, { ...shopApp, needs: ['db'] }, { ...office, needs: ['admin'] }, attacker],
    nodes: [
      { id: 'web', label: 'Web shop', sub: 'Port 443', col: 1, gate: 'fw-any', runsAs: 'role-shop' },
      { id: 'admin', label: 'Admin panel', sub: 'Port 8443', col: 1, gate: 'admin-fw', runsAs: 'role-shop', crown: true, shell: true },
      { id: 'db', label: 'Orders database', sub: 'Port 5432', col: 2, gate: 'db-fw', crown: true },
    ],
    slots: [
      { id: 'admin-fw', kind: 'fw', options: ['fw-any', 'fw-office', 'fw-inside', 'fw-closed'], initial: 'fw-any' },
      { id: 'db-fw', kind: 'fw', options: ['fw-any', 'fw-office', 'fw-inside', 'fw-closed'], initial: 'fw-any' },
    ],
    edges: [['customers', 'web'], ['office', 'admin'], ['attacker', 'web'], ['attacker', 'admin'], ['attacker', 'db'], ['web', 'db']],
    par: 2,
  },
  {
    id: 'ci-key',
    title: 'The key in the repository',
    brief: 'The CI key leaked in git history, and it can read far more than the build needs.',
    lesson: 'A leaked key is worth exactly what its role can do. The build needs its artifacts, nothing else.',
    sources: [
      { id: 'pipeline', label: 'Deploy pipeline', sub: 'Uses the CI key', kind: 'user', origin: 'internet', principal: 'ci', needs: ['artifacts'] },
      { id: 'leaked', label: 'Leaked CI key', sub: 'Found in git history', kind: 'attacker', origin: 'internet', principal: 'ci' },
      billingApp,
    ],
    nodes: [
      { id: 'billing', label: 'Billing server', sub: 'Internal', col: 1, gate: 'fw-inside', runsAs: 'role-billing' },
      { id: 'artifacts', label: 'Build artifacts', sub: 'Release files', col: 2, gate: 'pol-ci' },
      { id: 'invoices', label: 'Invoices bucket', sub: 'Customer invoices', col: 2, gate: 'invoices-policy', crown: true },
      { id: 'backups', label: 'Backups bucket', sub: 'Nightly copies', col: 2, gate: 'backups-policy', crown: true },
    ],
    slots: [
      { id: 'invoices-policy', kind: 'policy', options: ['pol-billing-ci', 'pol-billing', 'pol-ci', 'pol-none'], initial: 'pol-billing-ci' },
      { id: 'backups-policy', kind: 'policy', options: ['pol-ops-ci', 'pol-ops', 'pol-none'], initial: 'pol-ops-ci' },
    ],
    edges: [['pipeline', 'artifacts'], ['leaked', 'artifacts'], ['leaked', 'invoices'], ['leaked', 'backups'], ['billing', 'invoices']],
    par: 2,
  },
  {
    id: 'export',
    title: 'The export nobody locked',
    brief: 'An export job runs as Billing and answers anyone, and the shop is allowed to read invoices too.',
    lesson: 'Every path counts: a server that runs as a powerful role must not face the internet.',
    sources: [customers, shopApp, { ...office, needs: ['export'] }, attacker, foothold, billingApp],
    nodes: [
      { id: 'web', label: 'Web shop', sub: 'Port 443', col: 1, gate: 'fw-any', runsAs: 'role-shop' },
      { id: 'export', label: 'Export server', sub: 'Monthly CSV', col: 1, gate: 'export-fw', runsAs: 'role-billing', shell: true },
      { id: 'billing', label: 'Billing server', sub: 'Internal', col: 1, gate: 'fw-inside', runsAs: 'role-billing' },
      { id: 'products', label: 'Products bucket', sub: 'Photos and prices', col: 2, gate: 'pol-shop' },
      { id: 'invoices', label: 'Invoices bucket', sub: 'Customer invoices', col: 2, gate: 'invoices-policy', crown: true },
    ],
    slots: [
      { id: 'export-fw', kind: 'fw', options: ['fw-any', 'fw-office', 'fw-closed'], initial: 'fw-any' },
      { id: 'invoices-policy', kind: 'policy', options: ['pol-shop-billing', 'pol-billing', 'pol-public', 'pol-none'], initial: 'pol-shop-billing' },
    ],
    edges: [['customers', 'web'], ['office', 'export'], ['attacker', 'web'], ['attacker', 'export'], ['web', 'products'], ['web', 'invoices'], ['export', 'invoices'], ['billing', 'invoices']],
    par: 2,
  },
  {
    id: 'whole-account',
    title: 'The whole account',
    brief: "Lantern's account as Yasmin found it on Wednesday. Assume the shop gets broken into as well.",
    lesson: 'Least privilege, everywhere at once: networks, policies and roles.',
    sources: [
      customers, shopApp,
      { ...office, needs: ['bastion', 'backups'] },
      attacker,
      foothold,
      billingApp,
    ],
    nodes: [
      { id: 'web', label: 'Web shop', sub: 'Port 443', col: 1, gate: 'fw-any', runsAs: 'web-role' },
      { id: 'bastion', label: 'Jump host', sub: 'SSH, port 22', col: 1, gate: 'bastion-fw', runsAs: 'role-ops', shell: true },
      { id: 'billing', label: 'Billing server', sub: 'Internal', col: 1, gate: 'fw-inside', runsAs: 'role-billing' },
      { id: 'products', label: 'Products bucket', sub: 'Photos and prices', col: 2, gate: 'pol-shop' },
      { id: 'invoices', label: 'Invoices bucket', sub: 'Customer invoices', col: 2, gate: 'invoices-policy', crown: true },
      { id: 'backups', label: 'Backups bucket', sub: 'Nightly copies', col: 2, gate: 'backups-policy', crown: true },
    ],
    slots: [
      { id: 'web-role', kind: 'role', options: ['role-admin', 'role-shop', 'role-billing'], initial: 'role-admin' },
      { id: 'bastion-fw', kind: 'fw', options: ['fw-any', 'fw-office', 'fw-closed'], initial: 'fw-any' },
      { id: 'invoices-policy', kind: 'policy', options: ['pol-public', 'pol-billing', 'pol-shop-billing', 'pol-none'], initial: 'pol-public' },
      { id: 'backups-policy', kind: 'policy', options: ['pol-public', 'pol-ops', 'pol-none'], initial: 'pol-ops' },
    ],
    edges: [
      ['customers', 'web'], ['office', 'bastion'], ['attacker', 'web'], ['attacker', 'bastion'], ['attacker', 'invoices'], ['attacker', 'backups'],
      ['web', 'products'], ['web', 'invoices'], ['web', 'backups'], ['bastion', 'backups'], ['billing', 'invoices'],
    ],
    par: 3,
  },
];

