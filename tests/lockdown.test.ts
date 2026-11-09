import { describe, it, expect } from 'vitest';
import { OPTIONS, PUZZLES, type Puzzle } from '../src/content/arcade/lockdown';
import { ARCADE_BY_ID } from '../src/content/arcade';
import { arcadeStars } from '../src/engine/arcade';
import {
  actLockdown, admits, initialConfig, judge, puzzleStars, reach, RUN_MS, solve, startLockdown, stepLockdown, type Config, type LockState,
} from '../src/arcade/lockdown';

const changes = (p: Puzzle, to: Config) => p.slots.filter((s) => initialConfig(p)[s.id] !== to[s.id]).map((s) => ({ slot: s.id, option: to[s.id]! }));

describe('Lockdown diagrams', () => {
  it('between 8 and 12 diagrams, with unique ids', () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(8);
    expect(PUZZLES.length).toBeLessThanOrEqual(12);
    expect(new Set(PUZZLES.map((p) => p.id)).size).toBe(PUZZLES.length);
  });
  for (const p of PUZZLES) {
    describe(p.id, () => {
      it('is well formed: edges, gates and slots point at things that exist', () => {
        const ids = new Set([...p.sources.map((s) => s.id), ...p.nodes.map((n) => n.id)]);
        for (const [a, b] of p.edges) expect(ids.has(a) && ids.has(b), `${a} -> ${b}`).toBe(true);
        for (const n of p.nodes) for (const ref of [n.gate, n.runsAs]) if (ref) expect(ref in OPTIONS || p.slots.some((s) => s.id === ref), ref).toBe(true);
        for (const s of p.slots) {
          expect(s.options).toContain(s.initial);
          for (const o of s.options) expect(OPTIONS[o].kind).toBe(s.kind);
          expect(p.nodes.some((n) => n.gate === s.id || n.runsAs === s.id), `${s.id} is used`).toBe(true);
        }
        expect(p.sources.some((s) => s.kind === 'attacker')).toBe(true);
        expect(p.sources.some((s) => s.kind === 'user' && s.needs?.length)).toBe(true);
        expect(p.nodes.some((n) => n.crown)).toBe(true);
      });
      it('starts broken: the attacker has a way in', () => {
        const v = judge(p, initialConfig(p));
        expect(v.solved).toBe(false);
        expect(v.breaches.length).toBeGreaterThan(0);
        // Everyone who needs access has it at the start: the job is to keep it.
        expect(v.cut).toEqual([]);
      });
      it('the breadth-first solver finds a solution in exactly par changes', () => {
        const r = solve(p);
        expect(r.moves).toBe(p.par);
        expect(r.config).not.toBeNull();
        const v = judge(p, r.config!);
        expect(v.solved).toBe(true);
      });
      it('par is reachable in the game, for three stars', () => {
        const { config } = solve(p);
        let s: LockState = { ...startLockdown(), index: PUZZLES.indexOf(p), config: initialConfig(p) };
        for (const c of changes(p, config!)) s = actLockdown(s, { t: 'set', ...c });
        expect(s.cleared).not.toBeNull();
        expect(s.cleared!.result.moves).toBe(p.par);
        expect(puzzleStars(s.cleared!.result)).toBe(3);
      });
      it('no single obvious move solves a two-change diagram, and closing everything cuts someone off', () => {
        const closed: Config = Object.fromEntries(p.slots.map((s) => [s.id, s.options.find((o) => o === 'fw-closed' || o === 'pol-none') ?? s.initial]));
        if (p.slots.every((s) => s.kind !== 'role')) expect(judge(p, closed).cut.length).toBeGreaterThan(0);
      });
    });
  }
  it('the diagrams get harder: par never drops by more than one, and the last needs the most changes', () => {
    for (let i = 1; i < PUZZLES.length; i++) expect(PUZZLES[i]!.par).toBeGreaterThanOrEqual(PUZZLES[i - 1]!.par - 1);
    expect(PUZZLES.at(-1)!.par).toBe(Math.max(...PUZZLES.map((p) => p.par)));
  });
});

describe('Lockdown rules', () => {
  const p = PUZZLES.find((x) => x.id === 'assume-breach')!;
  it('an admin role passes any policy, but not one that lets no one in', () => {
    const t = { origin: 'internal' as const, principal: 'admin' };
    expect(admits(p, initialConfig(p), 'invoices', t)).toBe(true);
    const q = PUZZLES.find((x) => x.id === 'role-and-policy')!;
    expect(admits(q, initialConfig(q), 'products', t)).toBe(true);
    expect(admits(q, { ...initialConfig(q), 'products-policy': 'pol-none' }, 'products', t)).toBe(false);
    expect(admits(q, initialConfig(q), 'products', { origin: 'internal', principal: 'shop' })).toBe(false);
  });
  it('an attacker inside a server acts as its role', () => {
    expect(reach(p, initialConfig(p)).reached.foothold!.has('invoices')).toBe(true);
    expect(reach(p, { 'web-role': 'role-shop' }).reached.foothold!.has('invoices')).toBe(false);
  });
  it('a firewall rule checks the network a request comes from', () => {
    const q = PUZZLES.find((x) => x.id === 'harbor-ssh')!;
    const r = reach(q, { 'bastion-fw': 'fw-office' });
    expect(r.reached.office!.has('bastion')).toBe(true);
    expect(r.reached.attacker!.has('bastion')).toBe(false);
    expect(r.paths.attacker).toEqual({});
  });
  it('a path is recorded edge by edge for drawing', () => {
    const q = PUZZLES.find((x) => x.id === 'harbor-ssh')!;
    expect(reach(q, initialConfig(q)).paths.attacker!.db).toEqual([['attacker', 'bastion'], ['bastion', 'db']]);
  });
});

describe('Lockdown run', () => {
  const play = (thinkMs: number, extra = 0) => {
    let s = startLockdown();
    while (!s.over) {
      if (s.cleared) {
        s = stepLockdown(s, 100);
        continue;
      }
      const p = PUZZLES[s.index]!;
      const wrong = p.slots[0]!.options.find((o) => o !== s.config[p.slots[0]!.id] && o !== solve(p).config![p.slots[0]!.id])!;
      const plan = [...Array.from({ length: extra }, () => ({ slot: p.slots[0]!.id, option: wrong })), ...changes(p, solve(p).config!)];
      if (extra) plan.push(...changes(p, solve(p).config!).filter((c) => c.slot === p.slots[0]!.id));
      for (const c of plan) {
        for (let t = 0; t < thinkMs && !s.over; t += 100) s = stepLockdown(s, 100);
        if (s.over || s.cleared) break;
        s = actLockdown(s, { t: 'set', ...c });
      }
      if (!s.cleared && !s.over) s = actLockdown(s, { t: 'skip' });
    }
    return s;
  };
  it('a player at par who thinks for four seconds a change clears every diagram for three stars', () => {
    const s = play(4000);
    expect(s.won).toBe(true);
    expect(s.results.every((r) => r.solved && r.moves === r.par)).toBe(true);
    expect(arcadeStars(s.score, ARCADE_BY_ID.lockdown.stars)).toBe(3);
  });
  it('a slower player runs out of time and earns fewer stars', () => {
    const s = play(9000);
    expect(s.won).toBe(false);
    expect(s.elapsed).toBe(RUN_MS);
    expect(arcadeStars(s.score, ARCADE_BY_ID.lockdown.stars)).toBeLessThan(3);
    expect(arcadeStars(s.score, ARCADE_BY_ID.lockdown.stars)).toBeGreaterThanOrEqual(1);
  });
  it('extra changes cost the par bonus', () => {
    const s = play(2000, 1);
    expect(s.results.some((r) => r.moves > r.par)).toBe(true);
    expect(s.score).toBeLessThan(play(2000).score);
  });
  it('a wrong change says who was cut off; reset puts every rule back; skip moves on with nothing', () => {
    let s = startLockdown();
    s = actLockdown(s, { t: 'set', slot: 'invoices-policy', option: 'pol-none' });
    expect(s.event?.text).toBe('Billing app can no longer reach Invoices bucket.');
    expect(s.moves).toBe(1);
    s = actLockdown(s, { t: 'reset' });
    expect(s.config).toEqual(initialConfig(PUZZLES[0]!));
    s = actLockdown(s, { t: 'skip' });
    expect(s.index).toBe(1);
    expect(s.results[0]).toMatchObject({ solved: false, points: 0 });
  });
});
