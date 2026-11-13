import type { ScannerLevel } from '../types';
import type { ChallengeGenerator } from './types';
import { asChallenge } from './types';
import { LEVEL_BY_ID } from '../index';
import type { Rng } from '../../engine/rng';
import { VTS, type GvmAction } from '../../sim/gvm';
import { authChecks, bossChecks, feedChecks, goodTarget, qodChecks, setups, targetChecks, taskChecks, type OfficePlan } from '../levels/scanner';

const guided = (id: string) => LEVEL_BY_ID[id] as ScannerLevel;

/** Another office: new addresses, new host numbers, sometimes another domain. */
function plan(rng: Rng): OfficePlan {
  const prefix = `10.${rng.int(1, 60)}.${rng.int(1, 250)}.`;
  const [gw, web, intranet, db, nas, printer, kiosk] = rng.sample(Array.from({ length: 240 }, (_, i) => i + 2), 7) as [number, number, number, number, number, number, number];
  return { prefix, gw, web, intranet, db, nas, printer, kiosk, domain: rng.pick(['lantern.lan', 'office.lan', 'lyon.lan']) };
}

const names = (p: OfficePlan, n: number, short: string) => [p.prefix + n, short, `${short}.${p.domain}`];

// ---- Feed ------------------------------------------------------------------

const FEED_CVES = Object.values(VTS).filter((v) => v.cve && v.published >= '2021-01-01');

const feed: ChallengeGenerator = (rng) => {
  const vt = rng.pick(FEED_CVES);
  // An old feed from a few months before the test was published.
  const d = new Date(Date.parse(vt.published) - rng.int(30, 300) * 86_400_000).toISOString().slice(0, 10);
  const base = setups(plan(rng)).feed;
  const setup = { ...base, feed: { date: d, vts: rng.int(80_000, 99_000) } };
  const cve = vt.cve!;
  const level = asChallenge(guided('scan-feed'), {
    goal: `Prove the scanner misses ${cve}, update it, and prove it no longer does.`,
    instruction: `This box's feed was last updated on ${d}.`,
    setup,
    evaluate: (s) => feedChecks(s, setup.synced.date, cve),
  });
  return {
    level,
    signature: `${d}:${cve}`,
    hints: ['Search the VTs before and after you update.', `Search ${cve} on VTs, then Sync feed on the Feed page.`, 'When the feed says Current, search the same CVE again.'],
    solution: { kind: 'scanner', actions: [{ t: 'search', q: cve }, { t: 'sync' }, { t: 'search', q: cve }] },
  };
};

// ---- Target ------------------------------------------------------------------

const target: ChallengeGenerator = (rng) => {
  const p = plan(rng);
  const setup = setups(p).target;
  const level = asChallenge(guided('scan-target'), {
    goal: `Make a target for ${p.prefix}0/24 that respects the scope note and misses nothing.`,
    instruction: 'Read the scope note on the Targets page before you save anything.',
    setup,
    evaluate: (s) => targetChecks(s, setup.network),
  });
  return {
    level,
    signature: `${p.prefix}:${p.printer}:${p.nas}`,
    hints: ['The scope note names one address you may not touch and one machine that never answers ping.', `Exclude ${p.prefix + p.printer}, and pick the alive test that does not rely on ping.`, 'Port list: All IANA assigned TCP. Alive test: Consider Alive.'],
    solution: { kind: 'scanner', actions: [{ t: 'target', target: goodTarget(p) }] },
  };
};

// ---- Task ----------------------------------------------------------------------

const task: ChallengeGenerator = (rng) => {
  const p = plan(rng);
  const setup = setups(p).task;
  const base = guided('scan-task');
  const level = asChallenge(base, {
    goal: 'Run a full scan, open its worst result and count the Highs.',
    instruction: 'The target is ready; the rest is yours.',
    setup,
    evaluate: (s) => taskChecks(s, 3),
  });
  return {
    level,
    signature: `${p.prefix}:${p.nas}:${p.gw}`,
    hints: ['A task needs a target and a scan config; Discovery runs no vulnerability tests.', 'Create a task with Full and fast, start it, then open Results.', 'Click the top result, then count the red High badges: 3.'],
    solution: {
      kind: 'scanner',
      actions: [
        { t: 'task', task: { id: 'task-1', name: 'Office', targetId: 'target-1', config: 'Full and fast' } },
        { t: 'start', taskId: 'task-1' },
        { t: 'see', what: `result:eol@${p.prefix + p.nas}:0` },
        { t: 'answer', text: '3' },
      ],
    },
  };
};

// ---- QoD -------------------------------------------------------------------------

const qod: ChallengeGenerator = (rng) => {
  const p = plan(rng);
  const setup = setups(p).qod;
  // Which of the two Apache machines is the patched one changes from run to run.
  const webPatched = rng.chance(0.5);
  const webKey = `apache@${p.prefix + p.web}:443`;
  const intraKey = `apache@${p.prefix + p.intranet}:80`;
  const [fpKey, realKey] = webPatched ? [webKey, intraKey] : [intraKey, webKey];
  const patched = 'Lantern admin: this box has every update installed. Ubuntu fixed the flaw in its own apache2 package without changing the version in the banner.';
  const stale = 'Lantern admin: nobody has updated this box in years.';
  const level = asChallenge(guided('scan-qod'), {
    goal: 'Mark the Apache false alarm and keep the real one.',
    instruction: 'Two low-confidence Apache results are hiding under the default filter.',
    setup,
    notes: { [fpKey]: patched, [realKey]: stale },
    evaluate: (s) => qodChecks(s, fpKey, realKey),
  });
  return {
    level,
    signature: `${p.prefix}:${webPatched}`,
    hints: ['Results under 70% QoD are hidden: lower the filter.', 'Open both Apache results and read the admin notes.', 'Override the patched one as False Positive with a reason; leave the other.'],
    solution: {
      kind: 'scanner',
      actions: [
        { t: 'qod', min: 0 },
        { t: 'see', what: `result:${fpKey}` },
        { t: 'override', resultKey: fpKey, cvss: -1, reason: 'Ubuntu backported the fix, package is current' },
        { t: 'see', what: `result:${realKey}` },
      ],
    },
  };
};

// ---- Authenticated -------------------------------------------------------------------

const auth: ChallengeGenerator = (rng) => {
  const p = plan(rng);
  const setup = setups(p).auth;
  const vt = rng.pick(['pwnkit', 'sudo'] as const);
  const key = `${vt}@${p.prefix + p.db}:0`;
  const level = asChallenge(guided('scan-auth'), {
    goal: `Find the ${vt === 'pwnkit' ? 'policykit-1' : 'sudo'} flaw on db-02 that only a logged-in scan can see.`,
    instruction: 'The gvm-scan account and its key are ready for you to use.',
    setup,
    evaluate: (s) => authChecks(s, key),
  });
  const actions: GvmAction[] = [
    { t: 'credential', cred: { id: 'cred-1', name: 'gvm-scan key', login: 'gvm-scan', hasKey: true } },
    { t: 'target', target: goodTarget(p, { sshCredential: 'cred-1' }) },
    { t: 'start', taskId: 'task-1' },
    { t: 'see', what: `result:${key}` },
  ];
  return {
    level,
    signature: `${p.prefix}:${p.db}:${vt}`,
    hints: ['Outside scans cannot read installed packages.', 'Create the credential, attach it to the target, and scan again.', `Open the ${vt === 'pwnkit' ? 'policykit-1' : 'sudo'} result on ${p.prefix + p.db}.`],
    solution: { kind: 'scanner', actions },
  };
};

// ---- Boss --------------------------------------------------------------------------------

const boss: ChallengeGenerator = (rng) => {
  const p = plan(rng);
  const setup = setups(p).boss;
  const newHost = names(p, p.kiosk, 'kiosk-01');
  const next = names(p, p.db, 'db-02');
  const base = guided('scan-boss');
  const level = asChallenge(base, {
    goal: 'Make the scan weekly, compare two weeks, name the new machine and the next fix.',
    instruction: 'A week has passed on a new office network, and something is probing it.',
    setup,
    question: { ...base.question!, answers: [...newHost, ...next], wrong: [] },
    evaluate: (s) => bossChecks(s, newHost, next),
  });
  return {
    level,
    signature: `${p.prefix}:${p.kiosk}:${p.db}`,
    hints: ['Tick the schedule, then run the task again.', 'Compare the two reports: the New column has the new machine.', 'The highest score still open is on db-02.'],
    solution: {
      kind: 'scanner',
      actions: [
        { t: 'task', task: { id: 'task-1', name: 'Office weekly', targetId: 'target-1', config: 'Full and fast', weekly: true } },
        { t: 'start', taskId: 'task-1' },
        { t: 'delta', a: 'task-1-1', b: 'task-1-2' },
        { t: 'answer', text: p.prefix + p.kiosk },
        { t: 'answer', text: 'db-02' },
      ],
    },
  };
};

export const SCANNER_CHALLENGES: Record<string, ChallengeGenerator> = {
  'scan-feed': feed,
  'scan-target': target,
  'scan-task': task,
  'scan-qod': qod,
  'scan-auth': auth,
  'scan-boss': boss,
};


