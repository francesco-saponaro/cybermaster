// A small Greenbone (OpenVAS) as a pure reducer: the feed, the vulnerability
// tests, targets, credentials, tasks, scans, reports, the QoD filter,
// overrides, schedules and delta reports. The sandbox draws it; the levels and
// the tests drive the same reducer.
//
// The vulnerability tests (VTs) are real ones in spirit: real CVE numbers,
// their CVSS base scores, the quality-of-detection (QoD) values Greenbone uses
// for each kind of check, and the rule that a scan only runs the VTs its feed
// has. Hosts, names and versions are Lantern & Co.'s, made up for the game.

// ---- The VT catalogue ----------------------------------------------------------

/** How a VT detects what it reports, and the QoD Greenbone gives that method. */
export const QOD_TYPES = {
  exploit: { qod: 100, text: 'The test proved it by triggering the flaw safely.' },
  remote_vul: { qod: 99, text: 'The test sent a request the flaw answers in a way nothing else does.' },
  package: { qod: 97, text: 'The test logged in and compared the installed package with the fixed version.' },
  remote_active: { qod: 95, text: 'The test talked to the service and checked how it behaves.' },
  remote_banner: { qod: 80, text: 'The test read the version from the service banner.' },
  remote_analysis: { qod: 70, text: 'The test inferred it from several remote clues.' },
  remote_banner_unreliable: { qod: 30, text: 'The test read a version from a banner that Linux distributions do not change when they patch. It may already be fixed.' },
  general_note: { qod: 1, text: 'Information, not a test result.' },
} as const;
export type QodType = keyof typeof QOD_TYPES;

export type SolutionType = 'VendorFix' | 'Mitigation' | 'Workaround' | 'WillNotFix' | 'NoneAvailable';

export interface Vt {
  oid: string;
  name: string;
  family: string;
  cvss: number;
  cve?: string;
  qodType: QodType;
  /** When the VT reached the feed, ISO date. A feed older than this does not have it. */
  published: string;
  /** Needs a login on the host (a local, package-based check). */
  local?: boolean;
  /** Runs under the Discovery config too (inventory and information). */
  discovery?: boolean;
  summary: string;
  solution: string;
  solutionType: SolutionType;
}

export const VTS: Record<string, Vt> = {
  regresshion: {
    oid: '1.3.6.1.4.1.25623.1.0.114672',
    name: 'OpenSSH 8.5p1 - 9.7p1 Unauthenticated RCE Vulnerability (regreSSHion)',
    family: 'General',
    cvss: 8.1,
    cve: 'CVE-2024-6387',
    qodType: 'remote_banner',
    published: '2024-07-01',
    summary: 'A race condition in the OpenSSH server lets an attacker who keeps connecting run code as root, with no login.',
    solution: 'Update OpenSSH to 9.8p1 or the patched package from your distribution.',
    solutionType: 'VendorFix',
  },
  apache: {
    oid: '1.3.6.1.4.1.25623.1.0.113877',
    name: 'Apache HTTP Server < 2.4.53 Multiple Vulnerabilities',
    family: 'Web Servers',
    cvss: 9.8,
    cve: 'CVE-2022-22720',
    qodType: 'remote_banner_unreliable',
    published: '2022-03-15',
    summary: 'Versions before 2.4.53 mishandle some request bodies, which can let requests be smuggled past the server.',
    solution: 'Update to 2.4.53 or later. Distributions backport the fix without changing the version in the banner.',
    solutionType: 'VendorFix',
  },
  tls: {
    oid: '1.3.6.1.4.1.25623.1.0.117274',
    name: 'SSL/TLS: Deprecated TLSv1.0 and TLSv1.1 Protocol Detection',
    family: 'SSL and TLS',
    cvss: 4.3,
    qodType: 'remote_active',
    published: '2021-03-24',
    summary: 'The service still accepts TLS 1.0 and 1.1, which are deprecated and have known weaknesses.',
    solution: 'Turn off TLS 1.0 and 1.1 and keep TLS 1.2 and 1.3.',
    solutionType: 'Mitigation',
  },
  sambacry: {
    oid: '1.3.6.1.4.1.25623.1.0.811522',
    name: 'Samba Remote Code Execution Vulnerability (SambaCry)',
    family: 'Gain a shell remotely',
    cvss: 9.8,
    cve: 'CVE-2017-7494',
    qodType: 'remote_banner',
    published: '2017-05-25',
    summary: 'A writable share lets an attacker upload a library that the Samba server then loads and runs.',
    solution: 'Update Samba to 4.6.4, 4.5.10, 4.4.14 or later.',
    solutionType: 'VendorFix',
  },
  eol: {
    oid: '1.3.6.1.4.1.25623.1.0.103674',
    name: 'Operating System (OS) End of Life (EOL) Detection',
    family: 'General',
    cvss: 10.0,
    qodType: 'remote_banner',
    published: '2013-03-05',
    summary: 'The operating system no longer gets security updates, so every new flaw in it stays open.',
    solution: 'Move to a supported release of the operating system.',
    solutionType: 'VendorFix',
  },
  pwnkit: {
    oid: '1.3.6.1.4.1.25623.1.0.845202',
    name: 'Ubuntu: Security Advisory for policykit-1',
    family: 'Ubuntu Local Security Checks',
    cvss: 7.8,
    cve: 'CVE-2021-4034',
    qodType: 'package',
    published: '2022-01-26',
    local: true,
    summary: 'pkexec (PwnKit) lets any local user become root. Anyone who gets a shell on this machine owns it.',
    solution: 'Install the updated policykit-1 package from the advisory.',
    solutionType: 'VendorFix',
  },
  sudo: {
    oid: '1.3.6.1.4.1.25623.1.0.844791',
    name: 'Ubuntu: Security Advisory for sudo',
    family: 'Ubuntu Local Security Checks',
    cvss: 7.8,
    cve: 'CVE-2021-3156',
    qodType: 'package',
    published: '2021-01-27',
    local: true,
    summary: 'A heap overflow in sudo (Baron Samedit) lets a local user become root without being in the sudoers file.',
    solution: 'Install the updated sudo package from the advisory.',
    solutionType: 'VendorFix',
  },
  apachepkg: {
    oid: '1.3.6.1.4.1.25623.1.0.845300',
    name: 'Ubuntu: Security Advisory for apache2',
    family: 'Ubuntu Local Security Checks',
    cvss: 9.8,
    cve: 'CVE-2022-22720',
    qodType: 'package',
    published: '2022-03-17',
    local: true,
    summary: 'The installed apache2 package is older than the one that fixes the request-smuggling flaws.',
    solution: 'Install the updated apache2 package from the advisory.',
    solutionType: 'VendorFix',
  },
  telnet: {
    oid: '1.3.6.1.4.1.25623.1.0.108522',
    name: 'Telnet Unencrypted Cleartext Login',
    family: 'Useless services',
    cvss: 4.8,
    qodType: 'remote_banner',
    published: '2018-11-26',
    summary: 'The host offers Telnet, which sends usernames and passwords in clear text across the network.',
    solution: 'Turn Telnet off and use SSH.',
    solutionType: 'Mitigation',
  },
  osdetect: {
    oid: '1.3.6.1.4.1.25623.1.0.105937',
    name: 'OS Detection Consolidation and Reporting',
    family: 'Product detection',
    cvss: 0,
    qodType: 'general_note',
    published: '2016-02-19',
    discovery: true,
    summary: 'Which operating system the scanner believes the host runs.',
    solution: 'None: this is information.',
    solutionType: 'NoneAvailable',
  },
  services: {
    oid: '1.3.6.1.4.1.25623.1.0.10330',
    name: 'Services',
    family: 'Service detection',
    cvss: 0,
    qodType: 'general_note',
    published: '2008-08-27',
    discovery: true,
    summary: 'A service answered on this port.',
    solution: 'None: this is information.',
    solutionType: 'NoneAvailable',
  },
};

/** GVM's severity words for a CVSS score. */
export function severityLabel(score: number): 'High' | 'Medium' | 'Low' | 'Log' | 'False Positive' {
  if (score < 0) return 'False Positive';
  if (score >= 7) return 'High';
  if (score >= 4) return 'Medium';
  if (score > 0) return 'Low';
  return 'Log';
}

// ---- CISA's Known Exploited Vulnerabilities catalog -------------------------------------

export interface KevEntry {
  cve: string;
  vendor: string;
  product: string;
  name: string;
  dateAdded: string;
  dueDate: string;
  requiredAction: string;
}

/** The entries of the catalog for the CVEs in this game, as CISA publishes them. The game's other CVEs are not in it. */
export const KEV: KevEntry[] = [
  { cve: 'CVE-2021-4034', vendor: 'Red Hat', product: 'Polkit', name: 'Red Hat Polkit Out-of-Bounds Read and Write Vulnerability', dateAdded: '2022-06-27', dueDate: '2022-07-18', requiredAction: 'Apply updates per vendor instructions.' },
  { cve: 'CVE-2021-3156', vendor: 'Sudo', product: 'Sudo', name: 'Sudo Heap-Based Buffer Overflow Vulnerability', dateAdded: '2022-04-06', dueDate: '2022-04-27', requiredAction: 'Apply updates per vendor instructions.' },
  { cve: 'CVE-2017-7494', vendor: 'Samba', product: 'Samba', name: 'Samba Remote Code Execution Vulnerability', dateAdded: '2023-03-30', dueDate: '2023-04-20', requiredAction: 'Apply updates per vendor instructions.' },
];
export const KEV_BY_CVE: Record<string, KevEntry> = Object.fromEntries(KEV.map((k) => [k.cve, k]));
export const inKev = (vt: string) => !!VTS[vt]?.cve && !!KEV_BY_CVE[VTS[vt]!.cve!];

// ---- The network ------------------------------------------------------------------

export interface GvmHost {
  ip: string;
  name: string;
  os: string;
  /** Drops ping, so an ICMP alive test skips it. */
  noPing?: boolean;
  ports: number[];
  /** VTs this host has, each on a port (0 for the host itself). */
  vulns: { vt: string; port: number }[];
  /** Appears only from this scan number on (1 is the first scan). */
  from?: number;
  /** VTs fixed from this scan number on. */
  fixedFrom?: Record<string, number>;
}

export interface GvmNetwork {
  cidr: string;
  hosts: GvmHost[];
  /** The scope note: what may be scanned and what is excluded, in plain words. */
  scope: string;
  /** Addresses that must not be scanned. */
  excluded: string[];
}

export const PORT_LISTS = {
  'All IANA assigned TCP': { text: 'Every TCP port with an officially assigned service, 5,800 or so.', ports: null as number[] | null },
  'Web only (80, 443)': { text: 'Only ports 80 and 443.', ports: [80, 443] },
} as const;
export type PortListId = keyof typeof PORT_LISTS;

export const ALIVE_TESTS = {
  'ICMP Ping': 'Scan only hosts that answer a ping.',
  'Consider Alive': 'Scan every address in the target, whether it answers a ping or not.',
} as const;
export type AliveTest = keyof typeof ALIVE_TESTS;

export const SCAN_CONFIGS = {
  'Full and fast': 'Every vulnerability test in the feed, tuned to be safe for production.',
  Discovery: 'Finds hosts, open ports and products. Runs no vulnerability tests.',
  'Host Discovery': 'Only checks which hosts are up.',
} as const;
export type ScanConfig = keyof typeof SCAN_CONFIGS;

// ---- State ---------------------------------------------------------------------------

export interface Target {
  id: string;
  name: string;
  hosts: string;
  exclude: string;
  portList: PortListId;
  alive: AliveTest;
  sshCredential: string | null;
}

export interface Credential {
  id: string;
  name: string;
  login: string;
  /** The private key was pasted (never shown). */
  hasKey: boolean;
}

export interface Result {
  id: string;
  vt: string;
  host: string;
  hostName: string;
  port: number;
  cvss: number;
  qod: number;
}

export interface Report {
  id: string;
  taskId: string;
  /** 1 for the first scan of the task, 2 for the second and so on. */
  scan: number;
  date: string;
  results: Result[];
  hostsScanned: string[];
}

export interface Task {
  id: string;
  name: string;
  targetId: string;
  config: ScanConfig;
  weekly: boolean;
  status: 'New' | 'Running' | 'Done';
  progress: number;
}

export interface Override {
  resultKey: string;
  /** New CVSS, or -1 for False Positive. */
  cvss: number;
  reason: string;
}

export type Tab = 'feed' | 'vts' | 'targets' | 'credentials' | 'tasks' | 'results' | 'kev';

export interface GvmState {
  feed: { date: string; vts: number; syncing: number };
  /** Searches that found a VT, as "query>oid". */
  found: string[];
  targets: Target[];
  credentials: Credential[];
  tasks: Task[];
  reports: Report[];
  overrides: Override[];
  minQod: number;
  /** Result keys and other things the player has opened, as facts. */
  seen: string[];
  /** Report ids compared as a delta, "a>b". */
  deltas: string[];
  answers: string[];
  /** The report was matched against the KEV catalog. */
  kevMatched: boolean;
}

export interface GvmSetup {
  network: GvmNetwork;
  feed: { date: string; vts: number };
  /** The feed after a sync. */
  synced: { date: string; vts: number };
  targets?: Target[];
  credentials?: Credential[];
  tasks?: Task[];
  /** Scans already run before the level starts, as task id and how many. */
  history?: { taskId: string; scans: number }[];
}

export const TODAY = '2026-11-13';
const DAY = 86_400_000;

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY);
}

export const resultKey = (r: Pick<Result, 'vt' | 'host' | 'port'>) => `${r.vt}@${r.host}:${r.port}`;

// ---- Address parsing -------------------------------------------------------------------

/** Expands "10.0.20.0/24", "10.0.20.5", "10.0.20.5-10.0.20.9" and comma lists into addresses. Only /24 and longer prefixes. */
export function expandHosts(spec: string): string[] | null {
  const out: string[] = [];
  for (const raw of spec.split(/[,\s]+/).filter(Boolean)) {
    const cidr = raw.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/);
    if (cidr) {
      const bits = Number(cidr[5]);
      if (bits < 24 || bits > 32) return null;
      const base = Number(cidr[4]) & (0xff << (32 - bits)) & 0xff;
      const size = 2 ** (32 - bits);
      for (let i = 0; i < size; i++) out.push(`${cidr[1]}.${cidr[2]}.${cidr[3]}.${base + i}`);
      continue;
    }
    const range = raw.match(/^(\d+\.\d+\.\d+\.)(\d+)-(?:\d+\.\d+\.\d+\.)?(\d+)$/);
    if (range) {
      for (let i = Number(range[2]); i <= Number(range[3]); i++) out.push(`${range[1]}${i}`);
      continue;
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(raw)) {
      out.push(raw);
      continue;
    }
    return null;
  }
  return out;
}

// ---- Scanning -------------------------------------------------------------------------------

/** What one scan of a target finds, given the feed it has and the scan number. */
export function scan(net: GvmNetwork, target: Target, config: ScanConfig, feedDate: string, creds: Credential[], scanNo: number): { results: Result[]; hostsScanned: string[] } {
  const wanted = new Set(expandHosts(target.hosts) ?? []);
  for (const x of expandHosts(target.exclude) ?? []) wanted.delete(x);
  const cred = target.sshCredential ? creds.find((c) => c.id === target.sshCredential && c.hasKey && c.login) : undefined;
  const portsAllowed = PORT_LISTS[target.portList].ports as readonly number[] | null;
  const hosts = net.hosts.filter((h) => wanted.has(h.ip) && (h.from ?? 1) <= scanNo && !(target.alive === 'ICMP Ping' && h.noPing));
  const results: Result[] = [];
  let n = 0;
  for (const h of hosts) {
    if (config === 'Host Discovery') continue;
    const open = h.ports.filter((p) => !portsAllowed || portsAllowed.includes(p));
    const add = (vt: string, port: number) => {
      const v = VTS[vt]!;
      results.push({ id: `r${scanNo}-${++n}`, vt, host: h.ip, hostName: h.name, port, cvss: v.cvss, qod: QOD_TYPES[v.qodType].qod });
    };
    add('osdetect', 0);
    for (const p of open) add('services', p);
    if (config === 'Discovery') continue;
    for (const { vt, port } of h.vulns) {
      const v = VTS[vt]!;
      if (v.published > feedDate) continue;
      if (port !== 0 && !open.includes(port)) continue;
      if (v.local && !cred) continue;
      const fixed = h.fixedFrom?.[vt];
      if (fixed !== undefined && scanNo >= fixed) continue;
      add(vt, port);
    }
  }
  return { results, hostsScanned: hosts.map((h) => h.ip) };
}

/** A result's severity after overrides. */
export function effectiveCvss(s: Pick<GvmState, 'overrides'>, r: Result): number {
  const o = s.overrides.find((x) => x.resultKey === resultKey(r));
  return o ? o.cvss : r.cvss;
}

/** The results a report shows under the current QoD filter, worst first. Log results stay out unless asked for. */
export function visibleResults(s: GvmState, report: Report, opts: { logs?: boolean } = {}): Result[] {
  return report.results
    .filter((r) => r.qod >= s.minQod && (opts.logs || r.cvss > 0))
    .sort((a, b) => effectiveCvss(s, b) - effectiveCvss(s, a) || b.qod - a.qod || a.host.localeCompare(b.host, 'en', { numeric: true }));
}

export function delta(a: Report, b: Report): { fixed: Result[]; added: Result[]; same: Result[] } {
  const keysA = new Set(a.results.filter((r) => r.cvss > 0).map(resultKey));
  const keysB = new Set(b.results.filter((r) => r.cvss > 0).map(resultKey));
  return {
    fixed: a.results.filter((r) => r.cvss > 0 && !keysB.has(resultKey(r))),
    added: b.results.filter((r) => r.cvss > 0 && !keysA.has(resultKey(r))),
    same: b.results.filter((r) => r.cvss > 0 && keysA.has(resultKey(r))),
  };
}

// ---- The reducer ----------------------------------------------------------------------------

export const SYNC_STEPS = 4;
export const SCAN_STEPS = 5;

export type GvmAction =
  | { t: 'sync' }
  | { t: 'tick' }
  | { t: 'search'; q: string }
  | { t: 'see'; what: string }
  | { t: 'target'; target: Omit<Target, 'id'> & { id?: string } }
  | { t: 'credential'; cred: Omit<Credential, 'id'> & { id?: string } }
  | { t: 'task'; task: { id?: string; name: string; targetId: string; config: ScanConfig; weekly?: boolean } }
  | { t: 'start'; taskId: string }
  | { t: 'qod'; min: number }
  | { t: 'override'; resultKey: string; cvss: number; reason: string }
  | { t: 'delta'; a: string; b: string }
  | { t: 'answer'; text: string }
  | { t: 'kev-search'; q: string }
  | { t: 'kev-match' };

/** What went wrong with an action, in plain words, or null. */
export type GvmError = string | null;

export function initialGvm(setup: GvmSetup): GvmState {
  let s: GvmState = {
    feed: { ...setup.feed, syncing: 0 },
    found: [],
    targets: setup.targets ?? [],
    credentials: setup.credentials ?? [],
    tasks: setup.tasks ?? [],
    reports: [],
    overrides: [],
    minQod: 70,
    seen: [],
    deltas: [],
    answers: [],
    kevMatched: false,
  };
  for (const h of setup.history ?? []) {
    for (let i = 0; i < h.scans; i++) {
      s = reduceGvm(setup, s, { t: 'start', taskId: h.taskId }).state;
      for (let k = 0; k < SCAN_STEPS; k++) s = reduceGvm(setup, s, { t: 'tick' }).state;
    }
  }
  return s;
}

const vtMatches = (q: string, v: Vt) => {
  const n = q.trim().toLowerCase();
  if (n.length < 3) return false;
  return v.name.toLowerCase().includes(n) || (v.cve ?? '').toLowerCase() === n || v.oid === n;
};

export function reduceGvm(setup: GvmSetup, s: GvmState, a: GvmAction): { state: GvmState; error: GvmError } {
  const ok = (state: GvmState) => ({ state, error: null as GvmError });
  const no = (error: string) => ({ state: s, error });
  switch (a.t) {
    case 'sync':
      if (s.feed.syncing) return no('The feed is already syncing.');
      if (s.feed.date === setup.synced.date) return no('The feed is already current.');
      return ok({ ...s, feed: { ...s.feed, syncing: SYNC_STEPS } });
    case 'tick': {
      let next = s;
      if (next.feed.syncing) {
        const left = next.feed.syncing - 1;
        next = { ...next, feed: left === 0 ? { ...setup.synced, syncing: 0 } : { ...next.feed, syncing: left } };
      }
      const running = next.tasks.find((t) => t.status === 'Running');
      if (running) {
        const progress = Math.min(100, running.progress + Math.ceil(100 / SCAN_STEPS));
        if (progress < 100) next = { ...next, tasks: next.tasks.map((t) => (t.id === running.id ? { ...t, progress } : t)) };
        else {
          const target = next.targets.find((t) => t.id === running.targetId)!;
          const scanNo = next.reports.filter((r) => r.taskId === running.id).length + 1;
          const { results, hostsScanned } = scan(setup.network, target, running.config, next.feed.date, next.credentials, scanNo);
          const report: Report = { id: `${running.id}-${scanNo}`, taskId: running.id, scan: scanNo, date: scanNo === 1 ? '2026-11-06' : TODAY, results, hostsScanned };
          next = { ...next, reports: [...next.reports, report], tasks: next.tasks.map((t) => (t.id === running.id ? { ...t, status: 'Done', progress: 100 } : t)) };
        }
      }
      return ok(next);
    }
    case 'search': {
      const hits = Object.values(VTS).filter((v) => v.published <= s.feed.date && vtMatches(a.q, v));
      if (!hits.length) return ok({ ...s, seen: [...new Set([...s.seen, `search-miss:${a.q.trim().toLowerCase()}`])] });
      return ok({ ...s, found: [...new Set([...s.found, ...hits.map((v) => `${a.q.trim().toLowerCase()}>${v.oid}`)])] });
    }
    case 'see':
      return ok(s.seen.includes(a.what) ? s : { ...s, seen: [...s.seen, a.what] });
    case 'target': {
      const t = a.target;
      if (!t.name.trim()) return no('Give the target a name.');
      const hosts = expandHosts(t.hosts);
      if (!hosts || !hosts.length) return no('Hosts must be addresses like 10.0.20.0/24, 10.0.20.5 or 10.0.20.5-10.0.20.9.');
      if (t.exclude.trim() && !expandHosts(t.exclude)) return no('Exclude hosts must be addresses too, like 10.0.20.40.');
      if (t.sshCredential && !s.credentials.some((c) => c.id === t.sshCredential)) return no('That credential does not exist.');
      const id = t.id ?? `target-${s.targets.length + 1}`;
      const target: Target = { id, name: t.name.trim(), hosts: t.hosts.trim(), exclude: t.exclude.trim(), portList: t.portList, alive: t.alive, sshCredential: t.sshCredential };
      const exists = s.targets.some((x) => x.id === id);
      return ok({ ...s, targets: exists ? s.targets.map((x) => (x.id === id ? target : x)) : [...s.targets, target] });
    }
    case 'credential': {
      const c = a.cred;
      if (!c.name.trim()) return no('Give the credential a name.');
      if (!c.login.trim()) return no('A credential needs the username it logs in as.');
      if (!c.hasKey) return no('Paste the private key for that user.');
      const id = c.id ?? `cred-${s.credentials.length + 1}`;
      const cred: Credential = { id, name: c.name.trim(), login: c.login.trim(), hasKey: true };
      const exists = s.credentials.some((x) => x.id === id);
      return ok({ ...s, credentials: exists ? s.credentials.map((x) => (x.id === id ? cred : x)) : [...s.credentials, cred] });
    }
    case 'task': {
      const t = a.task;
      if (!t.name.trim()) return no('Give the task a name.');
      if (!s.targets.some((x) => x.id === t.targetId)) return no('Pick a target for the task.');
      const id = t.id ?? `task-${s.tasks.length + 1}`;
      const prev = s.tasks.find((x) => x.id === id);
      const task: Task = { id, name: t.name.trim(), targetId: t.targetId, config: t.config, weekly: t.weekly ?? prev?.weekly ?? false, status: prev?.status ?? 'New', progress: prev?.progress ?? 0 };
      return ok({ ...s, tasks: prev ? s.tasks.map((x) => (x.id === id ? task : x)) : [...s.tasks, task] });
    }
    case 'start': {
      const t = s.tasks.find((x) => x.id === a.taskId);
      if (!t) return no('There is no such task.');
      if (s.tasks.some((x) => x.status === 'Running')) return no('A scan is already running. Wait for it to finish.');
      if (s.feed.syncing) return no('Wait for the feed sync to finish before scanning.');
      return ok({ ...s, tasks: s.tasks.map((x) => (x.id === t.id ? { ...x, status: 'Running', progress: 0 } : x)) });
    }
    case 'qod':
      return ok({ ...s, minQod: Math.max(0, Math.min(100, Math.round(a.min))) });
    case 'override': {
      if (a.reason.trim().split(/\s+/).length < 4) return no('Say why in a few words: the next person to read the report needs the reason.');
      const rest = s.overrides.filter((o) => o.resultKey !== a.resultKey);
      return ok({ ...s, overrides: [...rest, { resultKey: a.resultKey, cvss: a.cvss, reason: a.reason.trim() }] });
    }
    case 'delta':
      return ok(s.deltas.includes(`${a.a}>${a.b}`) ? s : { ...s, deltas: [...s.deltas, `${a.a}>${a.b}`] });
    case 'answer':
      return ok({ ...s, answers: [...s.answers, a.text.trim()] });
    case 'kev-search': {
      const q = a.q.trim().toUpperCase();
      const hit = KEV_BY_CVE[q];
      const what = hit ? `kev:${q}` : `kev-miss:${q}`;
      return ok(s.seen.includes(what) ? s : { ...s, seen: [...s.seen, what] });
    }
    case 'kev-match':
      if (!s.reports.length) return no('Run a scan first: there is no report to match.');
      return ok({ ...s, kevMatched: true });
  }
}

/** Runs a list of actions, ticking until syncs and scans finish after each. Used by the tests and Show me. */
export function runGvm(setup: GvmSetup, actions: GvmAction[], from?: GvmState): { state: GvmState; errors: string[] } {
  let s = from ?? initialGvm(setup);
  const errors: string[] = [];
  for (const a of actions) {
    const r = reduceGvm(setup, s, a);
    if (r.error) errors.push(r.error);
    s = r.state;
    for (let i = 0; i < 20 && (s.feed.syncing || s.tasks.some((t) => t.status === 'Running')); i++) s = reduceGvm(setup, s, { t: 'tick' }).state;
  }
  return { state: s, errors };
}

export const latestReport = (s: GvmState, taskId?: string) => [...s.reports].reverse().find((r) => !taskId || r.taskId === taskId);
