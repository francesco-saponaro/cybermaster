import { describe, it, expect } from 'vitest';
import { CHALLENGES, generateChallenge, type ChallengeVariant } from '../src/content/challenges';
import { ALL_LEVELS, LEVEL_BY_ID } from '../src/content/index';
import type { WireLevel, TerminalLevel, CloudLevel, ReportLevel, ArenaLevel, WireState } from '../src/content/types';
import type { WireMove } from '../src/content/challenges/types';
import { makeReducer, initialModel, actionsFor } from '../src/game/sandboxes/WireSandbox';
import { testFix, listing, runApp, loginWithFilterEnv, ARENA_APPS } from '../src/sim/arena';
import { execute } from '../src/sim/terminal';
import { evaluateTerminal, judgeAnswer } from '../src/game/evaluate';
import { bucketChecks, iamChecks, sgChecks, keyChecks, triageChecks, gatewayChecks, type KeyState } from '../src/sim/cloud';
import { placeArtifact, readFinding, labChecks, PHASES } from '../src/sim/report';
import { parseVector, METRICS } from '../src/engine/cvss';

const SEEDS = Array.from({ length: 200 }, (_, i) => (i + 1) * 2654435761);
const allPass = (checks: Record<string, boolean>, ids: string[]) => ids.every((id) => checks[id] === true);

// ---- Solvers: drive the same simulations the sandboxes use ---------------------

function wireState(level: WireLevel, moves: WireMove[]): WireState {
  const reduce = makeReducer(level);
  let m = initialModel(level);
  for (const mv of moves) {
    if ('held' in mv) {
      expect(m.intercepted, `${level.id}: a response is held before it is edited`).toBeTruthy();
      m = reduce(m, { t: 'resp', text: mv.held(m.intercepted!.text) });
      continue;
    }
    for (const a of actionsFor(mv)) m = reduce(m, a);
  }
  return { exchanges: m.exchanges, forwarded: m.forwarded, console: m.console, jar: m.jar };
}

function terminalRun(level: TerminalLevel, commands: string[]): Record<string, boolean> {
  const facts: string[] = [];
  const submitted: string[] = [];
  const history: string[] = [];
  for (const c of commands) {
    history.push(c);
    const r = execute(c, { net: level.network, history });
    expect(r.fail, `${level.id}: "${c}" should not fail`).toBeUndefined();
    facts.push(...r.facts);
    if (r.submit !== undefined) {
      expect(judgeAnswer(level, r.submit).correct, `${level.id}: ${r.submit} is accepted`).toBe(true);
      submitted.push(r.submit);
    }
  }
  return evaluateTerminal(level, facts, submitted);
}

function keysRun(level: CloudLevel, ops: (string | undefined)[]): Record<string, boolean> {
  if (level.panel !== 'keys' || !level.setup) throw new Error('keys level without setup');
  const x = level.setup;
  let s: KeyState = { keys: [{ id: x.leaked, status: 'Active', created: '' }, { id: x.backup, status: 'Active', created: '' }], ciKey: x.leaked, backupKey: x.backup, found: false };
  for (const op of ops) {
    if (op === 'find') s = { ...s, found: x.showing.includes(x.leakCommit) };
    if (op === 'create') s = { ...s, keys: [...s.keys, { id: x.fresh, status: 'Active', created: '' }] };
    if (op === 'ci-new') s = { ...s, ciKey: x.fresh };
    if (op === 'deactivate-leaked') s = { ...s, keys: s.keys.map((k) => (k.id === x.leaked ? { ...k, status: 'Inactive' } : k)) };
  }
  expect(x.commits.find((c) => c.id === x.leakCommit)?.diff.join('\n')).toContain(x.leaked);
  return Object.fromEntries(keyChecks(s, x).map((c) => [c.id, c.pass]));
}

/** Solve a variant with the simulations; returns the check results before and after. */
function solve(v: ChallengeVariant): { before: Record<string, boolean>; after: Record<string, boolean> } {
  const l = v.level;
  const sol = v.solution;
  switch (l.kind) {
    case 'wire': {
      if (sol.kind !== 'wire') throw new Error('wrong solution kind');
      return { before: l.evaluate({ exchanges: [], forwarded: [], console: [], jar: [] }), after: l.evaluate(wireState(l, sol.moves)) };
    }
    case 'arena': {
      if (sol.kind !== 'arena' || !l.custom) throw new Error('arena variant without an app');
      const app = l.custom;
      const original = testFix(app, app.code.edit);
      const fixed = testFix(app, sol.fix);
      expect(fixed.reason, `${l.id}: the fix passes`).toBe('');
      const view = listing(app, app.code.edit);
      expect(view.lines[view.fault - 1]?.region).toBe('edit');
      return {
        before: { found: false, blocked: original.attackBlocked && original.variantsBlocked, works: false },
        after: { found: true, blocked: fixed.attackBlocked && fixed.variantsBlocked, works: fixed.normalWorks },
      };
    }
    case 'terminal': {
      if (sol.kind !== 'terminal') throw new Error('wrong solution kind');
      return { before: evaluateTerminal(l, [], []), after: terminalRun(l, sol.commands) };
    }
    case 'cloud': {
      if (sol.kind !== 'cloud') throw new Error('wrong solution kind');
      const map = (cs: { id: string; pass: boolean }[]) => Object.fromEntries(cs.map((c) => [c.id, c.pass]));
      switch (l.panel) {
        case 'bucket':
          return { before: map(bucketChecks(l.policy, false, l.setup).checks), after: map(bucketChecks(sol.text!, !!sol.bpa, l.setup).checks) };
        case 'iam':
          return { before: map(iamChecks(l.policy, l.setup).checks), after: map(iamChecks(sol.text!, l.setup).checks) };
        case 'sg':
          return { before: map(sgChecks(l.rules, l.setup)), after: map(sgChecks(sol.rules!, l.setup)) };
        case 'keys':
          return { before: keysRun(l, []), after: keysRun(l, sol.keyOps ?? []) };
        case 'scan':
          return { before: map(triageChecks(l.findings, {})), after: map(triageChecks(l.findings, sol.verdicts!)) };
        case 'gateway':
          return { before: map(gatewayChecks(l.config, l.setup).checks), after: map(gatewayChecks(sol.text!, l.setup).checks) };
      }
      break;
    }
    case 'report': {
      if (sol.kind !== 'report') throw new Error('wrong solution kind');
      return { before: Object.fromEntries(l.checks.map((c) => [c.id, false])), after: reportRun(l, sol.act) };
    }
  }
  throw new Error('unknown level');
}

function reportRun(l: ReportLevel, acts: import('../src/content/types').ReportAct[]): Record<string, boolean> {
  switch (l.panel) {
    case 'phases': {
      const placed: (string | null)[] = PHASES.map(() => null);
      for (const a of acts) {
        const [id, slot] = a.place!;
        const art = l.artifacts.find((x) => x.id === id)!;
        expect(placeArtifact(art, slot, placed).ok).toBe(true);
        placed[slot] = id;
      }
      return { 'scope-first': placed[0] === 'roe', order: placed.every((id, i) => l.artifacts.find((a) => a.id === id)?.phase === i) };
    }
    case 'cvss': {
      const target = parseVector(l.target);
      const v = { ...acts[0]!.vector! };
      const ok = (ms: readonly string[]) => ms.every((m) => (v as Record<string, string>)[m] === (target as Record<string, string>)[m]);
      expect(METRICS.length).toBe(8);
      return { exploitability: ok(['AV', 'AC', 'PR', 'UI']), impact: ok(['S', 'C', 'I', 'A']) };
    }
    case 'finding': {
      const draft = acts[0]!.draft as import('../src/sim/report').FindingDraft;
      for (const e of draft.evidence) expect(l.locker?.some((x) => x.id === e), `${e} is in the locker`).toBe(true);
      return Object.fromEntries(readFinding(draft, l.spec).map((c) => [c.id, c.pass]));
    }
    case 'retest': {
      const r = l.retest!;
      const mark = String(r.attack.name);
      const run = (input: Record<string, string>) => runApp('login', l.clientCode, input, (i, log) => loginWithFilterEnv(i, log, mark));
      const original = run(r.attack);
      const variants = r.variants.map(run);
      const status = acts.find((a) => a.status)?.status;
      const anyHarm = variants.some((x) => x.harmed);
      expect(original.harmed, 'their filter blocks the recorded attack').toBe(false);
      expect(anyHarm, 'a variant gets in exactly when the fix does not work').toBe(!r.fixWorks);
      return { replayed: true, bypass: r.fixWorks ? true : anyHarm, verdict: status === (r.fixWorks ? 'fixed' : 'not-fixed') };
    }
    case 'lab': {
      const res = labChecks(acts[0]!.text!);
      return { ...Object.fromEntries(res.checks.map((c) => [c.id, c.pass])), run: res.valid && res.checks.every((c) => c.pass) };
    }
  }
}

// ---- The tests -----------------------------------------------------------------

describe('challenge generators', () => {
  it('every level has one', () => {
    for (const l of ALL_LEVELS) expect(CHALLENGES[l.id], l.id).toBeTypeOf('function');
    expect(Object.keys(CHALLENGES).length).toBe(ALL_LEVELS.length);
  });

  for (const l of ALL_LEVELS) {
    describe(l.id, () => {
      const variants = SEEDS.map((s) => generateChallenge(l.id, s)!);

      it('is the same level for the same seed', () => {
        expect(generateChallenge(l.id, 12345)!.signature).toBe(generateChallenge(l.id, 12345)!.signature);
      });

      it('keeps the sandbox, drops the steps, and has a goal, a one-sentence brief and 2 to 3 graded hints', () => {
        for (const v of variants.slice(0, 20)) {
          expect(v.level.kind).toBe(l.kind);
          expect(v.level.id).toBe(l.id);
          expect(v.level.challenge).toBe(true);
          expect(v.level.showMe).toEqual([]);
          expect(v.level.checks.every((c) => c.do === '')).toBe(true);
          expect(v.level.goal.length).toBeGreaterThan(10);
          expect(v.level.instruction.split(/(?<=[.!?])\s+(?=[A-Z])/).length).toBe(1);
          expect(v.hints.length).toBeGreaterThanOrEqual(2);
          expect(v.hints.length).toBeLessThanOrEqual(3);
          expect(v.level.par).toBeGreaterThan(0);
        }
      });

      it('is solvable with the simulations across 200 seeds, and not solved before you start', () => {
        const ids = l.checks.map((c) => c.id);
        for (const [i, v] of variants.entries()) {
          const ids2 = v.level.checks.map((c) => c.id);
          const { before, after } = solve(v);
          expect(allPass(after, ids2), `${l.id} seed #${i} (${v.signature}): ${JSON.stringify(after)}`).toBe(true);
          expect(allPass(before, ids2), `${l.id} seed #${i} is already solved`).toBe(false);
          if (l.kind !== 'cloud') expect(ids2.sort()).toEqual([...ids].sort());
        }
      });

      it('varies its values from seed to seed', () => {
        const distinct = new Set(variants.map((v) => v.signature));
        expect(distinct.size, `${l.id} only made ${distinct.size} distinct variants`).toBeGreaterThanOrEqual(5);
      });

      it('never shows a literal attack string', () => {
        const text = JSON.stringify(variants.slice(0, 40).map((v) => [v.level.goal, v.level.instruction, v.hints, v.level.checks.map((c) => [c.label, c.learned])]));
        expect(text).not.toMatch(/OR 1=1|onerror=|<script|\/etc\/passwd/i);
      });
    });
  }

  it('guided Arena apps are unchanged by the variant machinery', () => {
    expect(LEVEL_BY_ID['arena-sqli']!.kind).toBe('arena');
    expect((LEVEL_BY_ID['arena-sqli'] as ArenaLevel).custom).toBeUndefined();
    expect(ARENA_APPS.login.code.pre).toBe('  const { name, pass } = req.body;');
  });
});
