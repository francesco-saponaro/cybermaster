import { describe, it, expect } from 'vitest';
import { ARCADE_BY_ID } from '../src/content/arcade';
import { arcadeStars } from '../src/engine/arcade';
import {
  actSweeper, ATTACK_MS, block, COLS, looksVulnerable, ROWS, SERVICES, startSweeper, stepSweeper, targets, USES, vulnerable, type SweepState, type Tool,
} from '../src/arcade/sweeper';

const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1);
const at = (_s: SweepState, c: number, r: number) => r * COLS + c;

/** What the player can see about a host: only what the tools have revealed. */
function view(s: SweepState, i: number) {
  const k = s.known[i]!;
  const h = s.hosts[i]!;
  return {
    inScope: h.inScope,
    live: k.seen ? h.live : undefined,
    possible: k.ports ? h.ports.some((p) => p.guessVuln) : undefined,
    confirmed: k.lookup ? h.ports.some((p) => p.bannerVuln) : undefined,
  };
}

/** Ping centres that cover the scope without touching the outside. Worked out from the visible scope only. */
function scopeCover(s: SweepState): [number, number][] {
  const inside = s.hosts.filter((h) => h.inScope);
  const maxC = Math.max(...inside.map((h) => h.c));
  const maxR = Math.max(...inside.map((h) => h.r));
  const centres = (max: number) => [...new Set([1, Math.min(max - 1, 4)])];
  return centres(maxC).flatMap((c) => centres(maxR).map((r) => [c, r] as [number, number]));
}

/**
 * A careful player who knows nothing in advance: sweep the scope, scan what is up, check versions of what the
 * scanner flags, look those up, flag what is confirmed.
 */
function solve(seed: number, think = 3000): SweepState {
  let s = startSweeper(seed);
  // Picking a host is free; each tool or flag is a decision that takes `think` ms.
  const act = (a: Parameters<typeof actSweeper>[1]) => {
    if (a.t !== 'select') for (let t = 0; t < think; t += 100) s = stepSweeper(s, 100);
    s = actSweeper(s, a);
  };
  const use = (i: number, tool: Tool) => {
    act({ t: 'select', i });
    act({ t: 'tool', tool });
  };
  for (const [c, r] of scopeCover(s)) use(at(s, c, r), 'ping');
  const live = s.hosts.filter((h) => view(s, h.i).inScope && view(s, h.i).live).map((h) => h.i);
  for (const i of live) use(i, 'ports');
  const possible = live.filter((i) => view(s, i).possible);
  for (const i of possible) use(i, 'version');
  for (const i of possible) use(i, 'lookup');
  for (const i of possible) if (view(s, i).confirmed && !s.over) {
    act({ t: 'select', i });
    act({ t: 'flag' });
  }
  return s;
}

describe('Network Sweeper: generation is fair', () => {
  it('the same seed builds the same network', () => {
    expect(startSweeper(12).hosts).toEqual(startSweeper(12).hosts);
    expect(startSweeper(12).hosts).not.toEqual(startSweeper(13).hosts);
  });
  it('across 500 seeds: one or two vulnerable hosts, all inside the scope, with one or two scanner false positives', () => {
    for (const seed of SEEDS) {
      const s = startSweeper(seed);
      const t = targets(s);
      expect(t.length).toBeGreaterThanOrEqual(1);
      expect(t.length).toBeLessThanOrEqual(2);
      const falsePositives = s.hosts.filter((h) => h.inScope && looksVulnerable(h) && !vulnerable(h));
      expect(falsePositives.length).toBeGreaterThanOrEqual(1);
      expect(falsePositives.length).toBeLessThanOrEqual(2);
      // The scanner never misses a real one: every vulnerable host also looks vulnerable.
      for (const h of s.hosts) if (vulnerable(h)) expect(looksVulnerable(h)).toBe(true);
      // There is something outside the scope to be tempted by.
      expect(s.hosts.some((h) => !h.inScope && vulnerable(h))).toBe(true);
      expect(new Set(s.hosts.map((h) => h.ip)).size).toBe(COLS * ROWS);
    }
  });
  it('across 500 seeds the tools are enough: a ping cover of the scope, a port scan per live host, a check per suspect', () => {
    for (const seed of SEEDS) {
      const s = startSweeper(seed);
      const cover = scopeCover(s);
      expect(cover.length).toBeLessThanOrEqual(USES.ping);
      const covered = new Set(cover.flatMap(([c, r]) => block(c, r)));
      for (const h of s.hosts) {
        if (h.inScope) expect(covered.has(h.i), `seed ${seed} host ${h.i}`).toBe(true);
        else expect(covered.has(h.i)).toBe(false);
      }
      const live = s.hosts.filter((h) => h.inScope && h.live);
      expect(live.length).toBeLessThanOrEqual(USES.ports);
      const suspects = live.filter(looksVulnerable);
      expect(suspects.length).toBeLessThanOrEqual(USES.version);
      expect(suspects.length).toBeLessThanOrEqual(USES.lookup);
    }
  });
  it('across 500 seeds a careful player who starts knowing nothing wins in time, with nothing out of scope and no false flags', () => {
    for (const seed of SEEDS) {
      const s = solve(seed);
      expect(s.won, `seed ${seed}`).toBe(true);
      expect(s.outOfScope).toBe(0);
      expect(s.wrongFlags).toBe(0);
      expect(s.attack).toBeLessThan(80);
    }
  });
});

describe('Network Sweeper: rules', () => {
  it('the attacker reaches the host on their own after the full time', () => {
    let s = startSweeper(3);
    for (let t = 0; t < ATTACK_MS - 200; t += 100) s = stepSweeper(s, 100);
    expect(s.over).toBe(false);
    for (let t = 0; t < 400; t += 100) s = stepSweeper(s, 100);
    expect(s.over).toBe(true);
    expect(s.won).toBe(false);
    expect(s.event?.text).toContain('reached');
  });
  it('flagging on the scanner guess alone falls for the false positive and says why', () => {
    const seed = SEEDS.find((x) => startSweeper(x).hosts.some((h) => h.inScope && looksVulnerable(h) && !vulnerable(h)))!;
    let s = startSweeper(seed);
    const fp = s.hosts.find((h) => h.inScope && looksVulnerable(h) && !vulnerable(h))!;
    s = actSweeper(s, { t: 'select', i: fp.i });
    s = actSweeper(s, { t: 'tool', tool: 'ports' });
    const before = s.attack;
    s = actSweeper(s, { t: 'flag' });
    expect(s.wrongFlags).toBe(1);
    expect(s.attack).toBeGreaterThan(before);
    expect(s.event?.text).toMatch(/False positive\. The scanner only guessed .* The banner says .*patched/);
  });
  it('the banner and the lookup tell the truth', () => {
    let s = startSweeper(8);
    const t = targets(s)[0]!;
    s = actSweeper(s, { t: 'select', i: t.i });
    expect(actSweeper(s, { t: 'tool', tool: 'lookup' }).event?.text).toMatch(/Check the real version first/);
    s = actSweeper(s, { t: 'tool', tool: 'ports' });
    s = actSweeper(s, { t: 'tool', tool: 'version' });
    s = actSweeper(s, { t: 'tool', tool: 'lookup' });
    expect(s.event?.text).toMatch(/CVE-\d{4}-\d+/);
    const svc = SERVICES[t.ports.find((p) => p.bannerVuln)!.svc]!;
    expect(s.event?.text).toContain(svc.cve);
  });
  it('probing outside the scope pushes the attacker forward and costs points', () => {
    let s = startSweeper(5);
    const out = s.hosts.find((h) => !h.inScope)!;
    s = actSweeper(s, { t: 'select', i: out.i });
    s = actSweeper(s, { t: 'tool', tool: 'ports' });
    expect(s.outOfScope).toBe(1);
    expect(s.attack).toBe(8);
    expect(s.score).toBe(-100);
    s = actSweeper(s, { t: 'flag' });
    expect(s.event?.text).toContain('outside the signed scope');
  });
  it('tools run out', () => {
    let s = startSweeper(6);
    for (let k = 0; k < USES.ping + 1; k++) s = actSweeper(s, { t: 'tool', tool: 'ping' });
    expect(s.uses.ping).toBe(0);
    expect(s.event?.text).toContain('No ping sweeps left');
  });
  it('moving the selection stays on the grid', () => {
    let s = startSweeper(1);
    s = actSweeper(s, { t: 'select', i: 0 });
    s = actSweeper(s, { t: 'move', dc: -1, dr: -1 });
    expect(s.selected).toBe(0);
    for (let k = 0; k < 10; k++) s = actSweeper(s, { t: 'move', dc: 1, dr: 1 });
    expect(s.selected).toBe(COLS * ROWS - 1);
    expect(ROWS).toBe(6);
  });
});

describe('Network Sweeper: scoring', () => {
  it('a quick careful player gets three stars, a slow one fewer, a reckless one fewer still', () => {
    const t = ARCADE_BY_ID['network-sweeper'].stars;
    for (const seed of SEEDS.slice(0, 40)) {
      const quick = solve(seed, 1500);
      const slow = solve(seed, 3200);
      expect(arcadeStars(quick.score, t)).toBe(3);
      expect(slow.score).toBeLessThan(quick.score);
      expect(arcadeStars(slow.score, t)).toBeLessThanOrEqual(2);
    }
  });
});
