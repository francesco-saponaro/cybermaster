import type { ScannerLevel } from '../types';
import { expandHosts, latestReport, resultKey, visibleResults, type GvmHost, type GvmNetwork, type GvmSetup, type GvmState, type Target, type Task, type Credential } from '../../sim/gvm';

// The Scanner: Lantern's own Greenbone box, so they find the next hole before
// a forum does. Feed, target, task, QoD, credentials, then a weekly routine.

export interface OfficePlan {
  /** First three octets with the dot, like "10.0.20.". */
  prefix: string;
  gw: number;
  web: number;
  intranet: number;
  db: number;
  nas: number;
  printer: number;
  kiosk: number;
  domain: string;
}

export const OFFICE: OfficePlan = { prefix: '10.0.20.', gw: 1, web: 10, intranet: 12, db: 20, nas: 30, printer: 40, kiosk: 50, domain: 'lantern.lan' };

/**
 * Lantern's office network: the same machines whatever the addresses. With
 * `week` set, it is the network over the boss's week: a kiosk is plugged in
 * between the first and second scan, and the team patches four things.
 */
export function officeNetwork(p: OfficePlan, week = false): GvmNetwork {
  const ip = (n: number) => p.prefix + n;
  return {
    cidr: `${p.prefix}0/24`,
    excluded: [ip(p.printer)],
    scope: `Scan ${p.prefix}0/24, Lantern's office. Do not scan ${ip(p.printer)}: the label printer belongs to the vendor and their contract forbids it. nas-01 drops ping on purpose, so it never answers one.`,
    hosts: (week ? HOSTS(p, ip) : HOSTS(p, ip).filter((h) => !h.from).map((h) => ({ ...h, fixedFrom: undefined }))),
  };
}

const HOSTS = (p: OfficePlan, ip: (n: number) => string): GvmHost[] => [
      { ip: ip(p.gw), name: `gw.${p.domain}`, os: 'Ubuntu 22.04', ports: [22], vulns: [{ vt: 'regresshion', port: 22 }], fixedFrom: { regresshion: 2 } },
      { ip: ip(p.web), name: `web-01.${p.domain}`, os: 'Ubuntu 22.04', ports: [22, 80, 443], vulns: [{ vt: 'apache', port: 443 }, { vt: 'tls', port: 443 }] },
      { ip: ip(p.intranet), name: `intranet.${p.domain}`, os: 'Ubuntu 20.04', ports: [22, 80], vulns: [{ vt: 'apache', port: 80 }, { vt: 'apachepkg', port: 0 }], fixedFrom: { apache: 2, apachepkg: 2 } },
      { ip: ip(p.db), name: `db-02.${p.domain}`, os: 'Ubuntu 20.04', ports: [22, 5432], vulns: [{ vt: 'pwnkit', port: 0 }, { vt: 'sudo', port: 0 }], fixedFrom: { pwnkit: 2 } },
      { ip: ip(p.nas), name: `nas-01.${p.domain}`, os: 'Debian 9', noPing: true, ports: [445], vulns: [{ vt: 'sambacry', port: 445 }, { vt: 'eol', port: 0 }], fixedFrom: { sambacry: 2, eol: 2 } },
      { ip: ip(p.printer), name: `print-01.${p.domain}`, os: 'Embedded Linux', ports: [23, 80, 9100], vulns: [{ vt: 'telnet', port: 23 }] },
      { ip: ip(p.kiosk), name: `kiosk-01.${p.domain}`, os: 'Raspberry Pi OS', ports: [23, 80], vulns: [{ vt: 'telnet', port: 23 }], from: 2 },
];

const FEED_OLD = { date: '2024-06-20', vts: 96_310 };
const FEED_NEW = { date: '2026-11-12', vts: 178_442 };

export const goodTarget = (p: OfficePlan, extra: Partial<Target> = {}): Target => ({
  id: 'target-1',
  name: 'Lantern office',
  hosts: `${p.prefix}0/24`,
  exclude: p.prefix + p.printer,
  portList: 'All IANA assigned TCP',
  alive: 'Consider Alive',
  sshCredential: null,
  ...extra,
});

export const fullTask = (extra: Partial<Task> = {}): Task => ({ id: 'task-1', name: 'Office weekly', targetId: 'target-1', config: 'Full and fast', weekly: false, status: 'New', progress: 0, ...extra });
export const scanKey: Credential = { id: 'cred-1', name: 'gvm-scan key', login: 'gvm-scan', hasKey: true };

export function setups(p: OfficePlan) {
  const network = officeNetwork(p);
  const week = officeNetwork(p, true);
  return {
    feed: { network, feed: FEED_OLD, synced: FEED_NEW } satisfies GvmSetup,
    target: { network, feed: FEED_NEW, synced: FEED_NEW } satisfies GvmSetup,
    task: { network, feed: FEED_NEW, synced: FEED_NEW, targets: [goodTarget(p)] } satisfies GvmSetup,
    qod: { network, feed: FEED_NEW, synced: FEED_NEW, targets: [goodTarget(p)], tasks: [fullTask()], history: [{ taskId: 'task-1', scans: 1 }] } satisfies GvmSetup,
    auth: { network, feed: FEED_NEW, synced: FEED_NEW, targets: [goodTarget(p)], tasks: [fullTask()], history: [{ taskId: 'task-1', scans: 1 }] } satisfies GvmSetup,
    kev: { network, feed: FEED_NEW, synced: FEED_NEW, targets: [goodTarget(p, { sshCredential: 'cred-1' })], credentials: [scanKey], tasks: [fullTask()], history: [{ taskId: 'task-1', scans: 1 }] } satisfies GvmSetup,
    boss: { network: week, feed: FEED_NEW, synced: FEED_NEW, targets: [goodTarget(p, { sshCredential: 'cred-1' })], credentials: [scanKey], tasks: [fullTask()], history: [{ taskId: 'task-1', scans: 1 }] } satisfies GvmSetup,
  };
}

// ---- Checks, shared with the challenges -------------------------------------------------

const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, '');
export const answered = (s: GvmState, answers: string[]) => s.answers.some((a) => answers.map(norm).includes(norm(a)));

export function feedChecks(s: GvmState, synced: string, cve: string) {
  const q = cve.toLowerCase();
  return {
    missing: s.seen.includes(`search-miss:${q}`),
    synced: s.feed.date === synced && !s.feed.syncing,
    found: s.found.some((f) => f.startsWith(`${q}>`)),
  };
}

export function targetChecks(s: GvmState, net: GvmNetwork) {
  const t = s.targets[s.targets.length - 1];
  const covered = t ? new Set(expandHosts(t.hosts) ?? []) : new Set<string>();
  const excluded = t ? new Set(expandHosts(t.exclude) ?? []) : new Set<string>();
  const inScope = net.hosts.filter((h) => !net.excluded.includes(h.ip) && (h.from ?? 1) === 1);
  return {
    hosts: !!t && inScope.every((h) => covered.has(h.ip)),
    exclude: !!t && net.excluded.every((x) => excluded.has(x) || !covered.has(x)) && inScope.every((h) => !excluded.has(h.ip)),
    ports: !!t && t.portList === 'All IANA assigned TCP',
    alive: !!t && t.alive === 'Consider Alive',
  };
}

export function worstVisible(s: GvmState, taskId = 'task-1') {
  const r = latestReport(s, taskId);
  return r ? visibleResults(s, r)[0] : undefined;
}

export function highCount(s: GvmState, taskId = 'task-1'): number {
  const r = latestReport(s, taskId);
  return r ? visibleResults(s, r).filter((x) => x.cvss >= 7).length : 0;
}

export function taskChecks(s: GvmState, highs: number) {
  const full = s.tasks.find((t) => t.config === 'Full and fast');
  const report = full ? latestReport(s, full.id) : undefined;
  const worst = report ? visibleResults(s, report)[0] : undefined;
  return {
    created: !!full,
    done: !!report,
    worst: !!worst && s.seen.includes(`result:${resultKey(worst)}`),
    count: answered(s, [String(highs)]),
  };
}

export function qodChecks(s: GvmState, fpKey: string, realKey: string) {
  const fp = s.overrides.find((o) => o.resultKey === fpKey);
  return {
    showall: s.minQod <= 30,
    opened: s.seen.includes(`result:${fpKey}`),
    fp: !!fp && fp.cvss < 0,
    real: s.seen.includes(`result:${realKey}`) && !s.overrides.some((o) => o.resultKey === realKey),
  };
}

export function authChecks(s: GvmState, localKey: string) {
  const cred = s.credentials.find((c) => c.hasKey && c.login);
  const target = s.targets.find((t) => t.id === 'target-1');
  const reports = s.reports.filter((r) => r.taskId === 'task-1');
  const last = reports[reports.length - 1];
  return {
    cred: !!cred,
    attached: !!target?.sshCredential && s.credentials.some((c) => c.id === target.sshCredential),
    rescan: reports.length >= 2 && !!last && last.results.some((r) => resultKey(r) === localKey),
    local: s.seen.includes(`result:${localKey}`),
  };
}

export function kevChecks(s: GvmState, count: number, first: string[]) {
  return {
    search: s.seen.some((x) => x.startsWith('kev:')),
    match: s.kevMatched,
    count: answered(s, [String(count)]),
    first: answered(s, first),
  };
}

/** The KEV question: how many, then which host first. */
export const kevQuestion = (p: OfficePlan) => {
  const h = (n: number, name: string) => [p.prefix + n, name, `${name}.${p.domain}`];
  return {
    ask: 'Answer box: how many results are in KEV, then the host to fix first.',
    answers: ['3', 'three', ...h(p.nas, 'nas-01')],
    wrong: [
      { answers: h(p.gw, 'gw'), reason: "regreSSHion on gw is serious, but it is not in KEV: there is public proof-of-concept code and no confirmed attacks yet. Fix it soon, after what is being exploited now." },
      { answers: h(p.db, 'db-02'), reason: 'db-02 has two KEV entries, but both need someone already logged in to db-02. Look for a KEV entry anyone on the network can use with no login.' },
      { answers: h(p.intranet, 'intranet'), reason: 'The intranet result scores 9.8 but is not in KEV. A known-exploited flaw with the same score comes first.' },
      { answers: ['2', 'two', '4', 'four'], reason: 'Count the rows with the Exploited badge after Match against KEV, with the filter as it is.' },
    ],
    otherwise: 'Not that one. Match the report against KEV and look at what is exploited, how bad it is and who can reach it.',
  };
};

export function bossChecks(s: GvmState, newHost: string[], nextHost: string[]) {
  const reports = s.reports.filter((r) => r.taskId === 'task-1');
  return {
    weekly: s.tasks.some((t) => t.id === 'task-1' && t.weekly),
    rescan: reports.length >= 2,
    delta: reports.length >= 2 && s.deltas.includes(`${reports[0]!.id}>${reports[reports.length - 1]!.id}`),
    newhost: answered(s, newHost),
    next: answered(s, nextHost),
  };
}

// ---- The levels --------------------------------------------------------------------------------

const P = OFFICE;
const S = setups(P);
const ip = (n: number) => P.prefix + n;
const host = (n: number, name: string) => [ip(n), name, `${name}.${P.domain}`];

export const SCANNER_LEVELS: ScannerLevel[] = [
  {
    id: 'scan-feed',
    zone: 'scanner',
    kind: 'scanner',
    title: 'A scanner nobody updated',
    goal: "Bring the scanner's feed up to date and check it now knows a recent flaw.",
    instruction: "OpenVAS only finds what its [[gvm-feed|feed]] of vulnerability tests describes, and Lantern's box was set up by a contractor in 2024 and never updated. You will search for a recent flaw, update the feed, and search again.",
    setup: S.feed,
    startTab: 'vts',
    checks: [
      {
        id: 'missing',
        label: 'Search for a recent flaw',
        do: 'On the `VTs` page, type `CVE-2024-6387` in the search box and press `Search`. Nothing comes back: this scanner has never heard of it.',
        learned: 'A scanner with an old feed reports nothing for flaws found after its last update, and nothing looks the same as safe.',
      },
      {
        id: 'synced',
        label: 'Update the feed',
        do: 'Open the `Feed` page and press `Sync feed`. Wait a few seconds until the status says Current and the date is yesterday.',
        learned: 'The feed went from about 96,000 tests to over 178,000: two years of new checks the scanner did not have.',
      },
      {
        id: 'found',
        label: 'Search again',
        do: 'Go back to `VTs` and search `CVE-2024-6387` again. The test for regreSSHion is there now.',
        learned: 'Keep the feed syncing every day, or every scan quietly misses whatever was found since.',
      },
    ],
    showMe: [
      { say: 'Search VTs for CVE-2024-6387: nothing.', act: { tab: 'vts', actions: [{ t: 'search', q: 'CVE-2024-6387' }] } },
      { say: 'Open Feed and press Sync feed.', act: { tab: 'feed', actions: [{ t: 'sync' }] } },
      { say: 'Search for CVE-2024-6387 again.', act: { tab: 'vts', actions: [{ t: 'search', q: 'CVE-2024-6387' }] } },
    ],
    evaluate: (s) => feedChecks(s, S.feed.synced.date, 'CVE-2024-6387'),
    realName: 'Keeping the vulnerability test feed current',
    didWhat: 'You found the scanner blind to two years of flaws and brought its feed up to date.',
    codex: ['gvm-feed'],
    xp: 90,
    par: 70,
  },
  {
    id: 'scan-target',
    zone: 'scanner',
    kind: 'scanner',
    title: 'Point it at the right machines',
    goal: 'Make a target that covers the office, skips the vendor printer and finds the machine that ignores ping.',
    instruction: 'A [[gvm-target|target]] tells OpenVAS which addresses to scan, which ports, and how to decide a machine is there. Read the scope note on the Targets page first.',
    setup: S.target,
    startTab: 'targets',
    checks: [
      {
        id: 'hosts',
        label: 'Cover the office range',
        do: `On \`Targets\`, fill in Name \`Lantern office\` and Hosts \`${P.prefix}0/24\`, then press \`Save target\`.`,
        learned: 'A /24 is the 256 addresses of the office network; the scanner checks each one.',
      },
      {
        id: 'exclude',
        label: 'Leave the vendor printer out',
        do: `In Exclude hosts, type \`${ip(P.printer)}\` and press \`Save target\` again.`,
        learned: 'Excluding an address keeps the scan inside what the client signed for, even inside a range.',
      },
      {
        id: 'ports',
        label: 'Scan every assigned port',
        do: 'Set Port list to `All IANA assigned TCP` and save. The web-only list would never see the NAS on port 445 or the database on 5432.',
        learned: 'A port list decides which doors are knocked on; anything outside it is invisible to the scan.',
      },
      {
        id: 'alive',
        label: 'Do not trust ping',
        do: 'Set Alive test to `Consider Alive` and save. nas-01 drops ping, so with ICMP Ping the scan would skip it as if it were switched off.',
        learned: 'Firewalls often drop ping: Consider Alive scans every address in the target anyway.',
      },
    ],
    showMe: [
      { say: `Name Lantern office, hosts ${P.prefix}0/24, then Save target.`, act: { tab: 'targets', actions: [{ t: 'target', target: { id: 'target-1', name: 'Lantern office', hosts: `${P.prefix}0/24`, exclude: '', portList: 'Web only (80, 443)', alive: 'ICMP Ping', sshCredential: null } }] } },
      { say: `Exclude ${ip(P.printer)}.`, act: { tab: 'targets', actions: [{ t: 'target', target: { id: 'target-1', name: 'Lantern office', hosts: `${P.prefix}0/24`, exclude: ip(P.printer), portList: 'Web only (80, 443)', alive: 'ICMP Ping', sshCredential: null } }] } },
      { say: 'Port list: All IANA assigned TCP.', act: { tab: 'targets', actions: [{ t: 'target', target: { id: 'target-1', name: 'Lantern office', hosts: `${P.prefix}0/24`, exclude: ip(P.printer), portList: 'All IANA assigned TCP', alive: 'ICMP Ping', sshCredential: null } }] } },
      { say: 'Alive test: Consider Alive.', act: { tab: 'targets', actions: [{ t: 'target', target: goodTarget(P) }] } },
    ],
    evaluate: (s) => targetChecks(s, S.target.network),
    realName: 'Defining a scan target with scope, port list and alive test',
    didWhat: 'You built a target that covers the whole office, respects the contract and does not miss the machine that ignores ping.',
    codex: ['gvm-target'],
    xp: 100,
    par: 120,
  },
  {
    id: 'scan-task',
    zone: 'scanner',
    kind: 'scanner',
    title: 'The first full scan',
    goal: 'Run a full scan of the office and read what it found.',
    instruction: 'A [[gvm-task|task]] is a target plus a scan config, and the config decides how deep it looks. Start on the Tasks page.',
    setup: S.task,
    startTab: 'tasks',
    question: {
      ask: 'How many High results does the report show?',
      answers: ['3', 'three'],
      wrong: [{ answers: ['4', 'four'], reason: 'Count only what the report shows with the filter as it is: severity 7.0 or more, the High badge.' }],
      otherwise: 'Count the results with the red High badge in the list.',
    },
    checks: [
      {
        id: 'created',
        label: 'Create the task',
        do: 'On `Tasks`, name the task `Office weekly`, pick the target `Lantern office`, set Scan config to `Full and fast`, and press `Save task`.',
        learned: 'Full and fast runs every test in the feed but skips the ones that could crash a service, so it is safe on a working network.',
      },
      {
        id: 'done',
        label: 'Run it',
        do: 'Press `Start` next to the task and wait until it says Done.',
        learned: 'The scan found the hosts, their open ports, then ran every test that matches what they run.',
      },
      {
        id: 'worst',
        label: 'Open the worst result',
        do: 'Open `Results` and click the first row, the one with the highest score. Read what it is and the fix.',
        learned: 'Each result names the test, the host and port, a CVSS score, how sure the scanner is (QoD) and what to do about it.',
      },
      {
        id: 'count',
        label: 'Count the High results',
        do: 'Count the results with a red `High` badge, type the number in the answer box under the list and press `Check`.',
        learned: 'High is a CVSS score of 7.0 or more: the ones to fix first.',
      },
    ],
    showMe: [
      { say: 'Create the task Office weekly with Full and fast.', act: { tab: 'tasks', actions: [{ t: 'task', task: { id: 'task-1', name: 'Office weekly', targetId: 'target-1', config: 'Full and fast' } }] } },
      { say: 'Start it and wait for Done.', act: { tab: 'tasks', actions: [{ t: 'start', taskId: 'task-1' }] } },
      { say: 'Open Results and click the top row.', act: { tab: 'results' } },
      { say: 'Answer 3.', act: { tab: 'results', answer: '3' } },
    ],
    evaluate: (s) => taskChecks(s, 3),
    realName: 'Running a full scan and reading the report',
    didWhat: 'You ran the first full scan of the office and read its worst results.',
    codex: ['gvm-task', 'gvm-severity'],
    xp: 100,
    par: 130,
  },
  {
    id: 'scan-qod',
    zone: 'scanner',
    kind: 'scanner',
    title: 'Guesses and proof',
    goal: 'Find the results the default filter hides, mark the false alarm, and keep the real one.',
    instruction: 'Every result has a [[gvm-qod|QoD]], how sure the scanner is, and the report hides anything under 70% by default. Two Apache results sit under that line: one is a false alarm and one is not.',
    setup: S.qod,
    startTab: 'results',
    notes: {
      [`apache@${ip(P.web)}:443`]: 'Lantern admin: web-01 runs Ubuntu 22.04 with every update installed. Ubuntu fixed this in its own apache2 package without changing the version in the banner.',
      [`apache@${ip(P.intranet)}:80`]: 'Lantern admin: the intranet box has not been updated since 2021. Nobody owns it.',
    },
    checks: [
      {
        id: 'showall',
        label: 'Show the low-QoD results',
        do: 'On `Results`, set Minimum QoD to `0` and press `Apply`. Two Apache results appear, both at 30%.',
        learned: 'QoD 30% means the test only read a version number from a banner that Linux distributions do not update when they patch.',
      },
      {
        id: 'opened',
        label: 'Open the one on web-01',
        do: `Click the Apache result on \`${ip(P.web)}\` (web-01) and read the admin's note under it.`,
        learned: 'The admin confirms the package is patched: the banner shows the old number, the code is fixed.',
      },
      {
        id: 'fp',
        label: 'Mark it as a false positive',
        do: 'In the result, set Override to `False Positive`, write why in Reason (for example `Ubuntu backported the fix, package is up to date`) and press `Save override`.',
        learned: 'An override with a reason keeps the false alarm out of every future report, and tells the next reader why.',
      },
      {
        id: 'real',
        label: 'Keep the real one',
        do: `Click the Apache result on \`${ip(P.intranet)}\` (intranet) and read its note. Leave it as it is: nobody patched that box.`,
        learned: 'Same test, same QoD, different answer: only checking the machine tells you which is real.',
      },
    ],
    showMe: [
      { say: 'Minimum QoD 0, Apply.', act: { tab: 'results', actions: [{ t: 'qod', min: 0 }] } },
      { say: 'Open the Apache result on web-01.', act: { tab: 'results', actions: [{ t: 'see', what: `result:apache@${ip(P.web)}:443` }] } },
      { say: 'Override: False Positive, with the reason.', act: { tab: 'results', actions: [{ t: 'override', resultKey: `apache@${ip(P.web)}:443`, cvss: -1, reason: 'Ubuntu backported the fix, package is up to date' }] } },
      { say: 'Open the intranet Apache result and leave it.', act: { tab: 'results', actions: [{ t: 'see', what: `result:apache@${ip(P.intranet)}:80` }] } },
    ],
    evaluate: (s) => qodChecks(s, `apache@${ip(P.web)}:443`, `apache@${ip(P.intranet)}:80`),
    realName: 'Quality of detection and false-positive overrides',
    didWhat: 'You found two banner guesses, proved one wrong with an override and kept the other open.',
    codex: ['gvm-qod', 'gvm-override'],
    xp: 110,
    par: 120,
  },
  {
    id: 'scan-auth',
    zone: 'scanner',
    kind: 'scanner',
    title: 'Look from the inside',
    goal: 'Give the scan a login so it can check the installed packages, and find what the outside view missed.',
    instruction: `From outside, db-02 (${ip(P.db)}) looks clean. An [[gvm-auth|authenticated scan]] logs in over SSH and compares every installed package with the fixed versions.`,
    setup: S.auth,
    startTab: 'credentials',
    checks: [
      {
        id: 'cred',
        label: 'Create the credential',
        do: 'On `Credentials`, name it `gvm-scan key`, Username `gvm-scan`, tick `Paste private key` and press `Save credential`.',
        learned: 'Lantern made a gvm-scan user that can log in and read package lists, nothing more.',
      },
      {
        id: 'attached',
        label: 'Give it to the target',
        do: 'Open `Targets`, set SSH credential to `gvm-scan key` and press `Save target`.',
        learned: 'The target now logs in to every host that accepts that key.',
      },
      {
        id: 'rescan',
        label: 'Scan again',
        do: 'Open `Tasks` and press `Start` on Office weekly. Wait for Done.',
        learned: 'The second report has local checks with QoD 97%: the scanner read the installed version itself.',
      },
      {
        id: 'local',
        label: 'Open what the inside view found',
        do: `On \`Results\`, click the policykit-1 result on \`${ip(P.db)}\` (db-02).`,
        learned: 'PwnKit lets anyone with a shell on db-02 become root, and no outside scan could have seen that missing update.',
      },
    ],
    showMe: [
      { say: 'Create the gvm-scan credential with its key.', act: { tab: 'credentials', actions: [{ t: 'credential', cred: { id: 'cred-1', name: 'gvm-scan key', login: 'gvm-scan', hasKey: true } }] } },
      { say: 'Give it to the target.', act: { tab: 'targets', actions: [{ t: 'target', target: goodTarget(P, { sshCredential: 'cred-1' }) }] } },
      { say: 'Start the task again.', act: { tab: 'tasks', actions: [{ t: 'start', taskId: 'task-1' }] } },
      { say: 'Open the policykit-1 result on db-02.', act: { tab: 'results', actions: [{ t: 'see', what: `result:pwnkit@${ip(P.db)}:0` }] } },
    ],
    evaluate: (s) => authChecks(s, `pwnkit@${ip(P.db)}:0`),
    realName: 'Authenticated (credentialed) vulnerability scanning',
    didWhat: 'You gave the scanner a login and found the root-level holes that only show from the inside.',
    codex: ['gvm-auth'],
    xp: 110,
    par: 140,
  },
  {
    id: 'scan-kev',
    zone: 'scanner',
    kind: 'scanner',
    title: 'Known to be exploited',
    goal: 'Check the report against CISA\'s KEV catalog and decide what to fix first.',
    instruction: 'The [[kev|KEV catalog]] lists the vulnerabilities attackers are really using, kept by CISA, the US cyber security agency. A High that is being exploited right now goes before a High that is not.',
    setup: S.kev,
    startTab: 'kev',
    kev: true,
    question: kevQuestion(P),
    checks: [
      {
        id: 'search',
        label: 'Look up a CVE in KEV',
        do: 'On the `KEV` page, search `CVE-2021-4034`, the PwnKit flaw from the last level. Read its entry: when CISA added it and the action it requires.',
        learned: 'PwnKit has been in KEV since June 2022: attackers have used it, not just researchers.',
      },
      {
        id: 'match',
        label: 'Match the report against KEV',
        do: 'Open `Results` and press `Match against KEV`. A KEV column appears with an Exploited badge on every result whose CVE is in the catalog.',
        learned: 'Tools can flag KEV entries automatically, which is exactly what CISA recommends.',
      },
      {
        id: 'count',
        label: 'Count the exploited results',
        do: 'Count the rows with the `Exploited` badge, type the number in the answer box and press `Check`.',
        learned: 'Three of the office\'s results are flaws attackers are already using.',
      },
      {
        id: 'first',
        label: 'Pick the first fix',
        do: 'Of the exploited ones, which can anyone on the network use with no login? Type that host\'s name (like `web-01`) and press `Check`.',
        learned: 'SambaCry on nas-01 is in KEV, scores 9.8 and needs no login: it goes first, then the two on db-02, then regreSSHion.',
      },
    ],
    showMe: [
      { say: 'Search KEV for CVE-2021-4034.', act: { tab: 'kev', actions: [{ t: 'kev-search', q: 'CVE-2021-4034' }] } },
      { say: 'Open Results and press Match against KEV.', act: { tab: 'results', actions: [{ t: 'kev-match' }] } },
      { say: 'Three rows say Exploited.', act: { tab: 'results', answer: '3' } },
      { say: 'nas-01 first: SambaCry, exploited, no login.', act: { tab: 'results', answer: 'nas-01' } },
    ],
    evaluate: (s) => kevChecks(s, 3, host(P.nas, 'nas-01')),
    realName: 'Prioritising with the CISA Known Exploited Vulnerabilities catalog',
    didWhat: 'You matched the scan against KEV and put the vulnerability attackers are already using at the top of the list.',
    codex: ['kev'],
    xp: 110,
    par: 110,
  },
  {
    id: 'scan-boss',
    zone: 'scanner',
    kind: 'scanner',
    boss: true,
    title: 'From a scan to a routine',
    goal: 'Make the scan weekly, run this week\'s, compare it with last week\'s, and say what to fix next.',
    instruction: 'Vulnerability management is the same scan every week and the [[gvm-delta|difference]] between two reports. Something on the network is probing the office while you work, so do not stop.',
    setup: S.boss,
    startTab: 'tasks',
    kev: true,
    question: {
      ask: 'Answer box: the new host\'s address, then the host to fix next.',
      answers: [...host(P.kiosk, 'kiosk-01'), ...host(P.db, 'db-02')],
      wrong: [
        { answers: host(P.nas, 'nas-01'), reason: 'nas-01 was fixed this week: Samba and the old Debian are gone from the second report.' },
        { answers: host(P.gw, 'gw'), reason: 'gw was patched this week: regreSSHion is in the Fixed column.' },
        { answers: host(P.web, 'web-01'), reason: 'web-01 only has a Medium left. Look for a higher score.' },
      ],
      otherwise: 'Not that one. Look at the delta: the New column, and the highest score still open.',
    },
    checks: [
      {
        id: 'weekly',
        label: 'Make it weekly',
        do: 'On `Tasks`, tick `Every Monday, 06:00` on Office weekly and press `Save task`.',
        learned: 'A schedule turns a one-off scan into a routine: each Monday brings a new report.',
      },
      {
        id: 'rescan',
        label: "Run this week's scan",
        do: 'Press `Start` on Office weekly and wait for Done. Claire\'s team patched three things since last week.',
        learned: 'Two reports of the same target are what you compare.',
      },
      {
        id: 'delta',
        label: 'Compare the two reports',
        do: 'On `Results`, press `Compare with last week`. You see what was fixed, what is new and what is still there.',
        learned: 'A delta report shows the work done and the work that appeared, which is what Claire wants each week.',
      },
      {
        id: 'newhost',
        label: 'Name the new machine',
        do: 'A host that was not there last week now has a result. Type its address in the answer box and press `Check`.',
        learned: 'New machines appear without anyone telling you; the weekly scan is how you hear about them.',
      },
      {
        id: 'next',
        label: 'Say what to fix next',
        do: 'Of the results still open, which host has the highest score? Type its name (like `web-01`) in the answer box and press `Check`.',
        learned: 'Fix by severity and by what is known to be exploited: sudo on db-02 is a High, proven with a login, and in KEV.',
      },
    ],
    showMe: [
      { say: 'Tick Every Monday, 06:00 and save.', act: { tab: 'tasks', actions: [{ t: 'task', task: { id: 'task-1', name: 'Office weekly', targetId: 'target-1', config: 'Full and fast', weekly: true } }] } },
      { say: 'Start the task.', act: { tab: 'tasks', actions: [{ t: 'start', taskId: 'task-1' }] } },
      { say: 'Compare with last week.', act: { tab: 'results', actions: [{ t: 'delta', a: 'task-1-1', b: 'task-1-2' }] } },
      { say: `The new host is ${ip(P.kiosk)}.`, act: { tab: 'results', answer: ip(P.kiosk) } },
      { say: 'Fix db-02 next: sudo, 7.8, proven from the inside.', act: { tab: 'results', answer: 'db-02' } },
    ],
    evaluate: (s) => bossChecks(s, host(P.kiosk, 'kiosk-01'), host(P.db, 'db-02')),
    realName: 'Scheduled scans and delta reports in vulnerability management',
    didWhat: 'You turned the scanner into a weekly routine, compared two weeks, caught a new machine and set the next fix.',
    codex: ['gvm-delta'],
    xp: 160,
    par: 200,
  },
];
