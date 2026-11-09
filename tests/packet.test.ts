import { describe, it, expect } from 'vitest';
import { PACKETS, PACKET_BY_ID } from '../src/content/arcade/packets';
import { ARCADE_BY_ID } from '../src/content/arcade';
import { arcadeStars } from '../src/engine/arcade';
import { actPackets, difficulty, DURATION, GATE, inGate, LANES, LIVES, MAX_LIVE, multiplier, PER_LANE, SPACING, startPackets, stepPackets, type PacketState } from '../src/arcade/packet';
import { makeRng } from '../src/engine/rng';

const FRAME = 16;

/** Check the board never breaks its spacing rules. */
function assertBoard(s: PacketState) {
  expect(s.live.length).toBeLessThanOrEqual(MAX_LIVE);
  for (let lane = 0; lane < LANES; lane++) {
    const inLane = s.live.filter((p) => p.lane === lane).sort((a, b) => b.pos - a.pos);
    expect(inLane.length).toBeLessThanOrEqual(PER_LANE);
    for (let i = 1; i < inLane.length; i++) expect(inLane[i - 1]!.pos - inLane[i]!.pos).toBeGreaterThanOrEqual(SPACING - 1e-9);
    for (const p of inLane) expect(p.pos).toBeGreaterThanOrEqual(0), expect(p.pos).toBeLessThanOrEqual(GATE);
  }
  expect(new Set(s.live.map((p) => p.id)).size).toBe(s.live.length);
}

/** A player: `skill` is the chance of a right call, `react` the ms before acting on a request in the gate. */
function play(seed: number, skill: number, react = 300, pace = 1, check = false): PacketState {
  const rng = makeRng(seed ^ 0x5eed);
  let s = startPackets(seed, pace);
  let wait = react;
  while (!s.over) {
    s = stepPackets(s, FRAME + (rng.next() < 0.05 ? 50 : 0));
    if (check) assertBoard(s);
    wait -= FRAME;
    if (wait > 0) continue;
    const lane = [0, 1, 2].find((l) => inGate(s, l));
    if (lane === undefined) continue;
    while (s.lane !== lane) s = actPackets(s, { t: 'lane', d: lane > s.lane ? 1 : -1 });
    const t = PACKET_BY_ID[inGate(s, lane)!.template]!;
    const right = rng.next() < skill;
    s = actPackets(s, { t: 'verdict', allow: right ? !t.bad : t.bad });
    wait = react;
  }
  return s;
}

describe('Packet Runner content', () => {
  it('has a mix of fine and bad requests with unique ids and a reason for each', () => {
    expect(new Set(PACKETS.map((p) => p.id)).size).toBe(PACKETS.length);
    expect(PACKETS.filter((p) => p.bad).length).toBeGreaterThanOrEqual(8);
    expect(PACKETS.filter((p) => !p.bad).length).toBeGreaterThanOrEqual(8);
    for (const p of PACKETS) expect(p.why.length).toBeGreaterThan(15);
  });
  it('every card line is short enough to read on a phone', () => {
    for (const p of PACKETS) for (const line of [p.req, p.header, p.note]) expect(line.length, line).toBeLessThanOrEqual(30);
  });
  it('a bad request never looks exactly like a fine one', () => {
    const key = (p: (typeof PACKETS)[number]) => `${p.req}|${p.header}|${p.note}`;
    const seen = new Map<string, boolean>();
    for (const p of PACKETS) {
      expect(seen.has(key(p)) && seen.get(key(p)) !== p.bad, p.id).toBe(false);
      seen.set(key(p), p.bad);
    }
  });
});

describe('Packet Runner rules', () => {
  it('the same seed gives the same requests in the same lanes', () => {
    expect(startPackets(42).order).toEqual(startPackets(42).order);
    expect(startPackets(42).order).not.toEqual(startPackets(43).order);
    const s = startPackets(7);
    for (let i = 1; i < s.order.length; i++) expect(s.order[i]).not.toBe(s.order[i - 1]);
    const badShare = s.order.filter((id) => PACKET_BY_ID[id]!.bad).length / s.order.length;
    expect(badShare).toBeGreaterThan(0.3);
    expect(badShare).toBeLessThan(0.6);
  });
  it('gets harder through the run: faster, more often, less patient', () => {
    let prev = difficulty(0);
    for (let t = 5000; t <= DURATION; t += 5000) {
      const d = difficulty(t);
      expect(d.speed).toBeGreaterThan(prev.speed);
      expect(d.spawnEvery).toBeLessThan(prev.spawnEvery);
      expect(d.patience).toBeLessThan(prev.patience);
      prev = d;
    }
    expect(difficulty(DURATION * 2)).toEqual(difficulty(DURATION));
  });
  it('the multiplier climbs every five right calls and stops at x4', () => {
    expect([0, 4, 5, 9, 10, 15, 40].map(multiplier)).toEqual([1, 1, 2, 2, 3, 4, 4]);
  });
  it('a right call scores and builds the combo; a wrong one costs a life, freezes and says why', () => {
    let s = startPackets(3);
    while (!inGate(s, 0) && !inGate(s, 1) && !inGate(s, 2)) s = stepPackets(s, FRAME);
    const lane = [0, 1, 2].find((l) => inGate(s, l))!;
    s = actPackets(s, { t: 'lane-set', lane });
    const t = PACKET_BY_ID[inGate(s, lane)!.template]!;
    const right = actPackets(s, { t: 'verdict', allow: !t.bad });
    expect(right.score).toBe(100);
    expect(right.combo).toBe(1);
    expect(right.lives).toBe(LIVES);
    const wrong = actPackets(s, { t: 'verdict', allow: t.bad });
    expect(wrong.lives).toBe(LIVES - 1);
    expect(wrong.combo).toBe(0);
    expect(wrong.freeze).toBe(1000);
    expect(wrong.last?.text).toContain(t.why);
    expect(wrong.mistakes).toHaveLength(1);
    // While frozen nothing moves and no call is taken.
    const frozen = stepPackets(wrong, 500);
    expect(frozen.live).toEqual(wrong.live);
    expect(frozen.elapsed).toBe(wrong.elapsed);
    expect(actPackets(frozen, { t: 'verdict', allow: true })).toBe(frozen);
  });
  it('a call on a lane with nothing in its gate does nothing', () => {
    const s = startPackets(1);
    expect(actPackets(s, { t: 'verdict', allow: true })).toBe(s);
  });
  it('doing nothing loses: bad requests slip through on their own', () => {
    let s = startPackets(9);
    while (!s.over) s = stepPackets(s, FRAME);
    expect(s.won).toBe(false);
    expect(s.lives).toBe(0);
    expect(s.mistakes.every((m) => m.kind === 'slipped')).toBe(true);
  });
});

describe('Packet Runner spacing over long runs', () => {
  it('no two requests ever share a lane slot, over 40 full runs of mixed players', () => {
    for (let seed = 1; seed <= 40; seed++) play(seed, [1, 0.97, 0.9][seed % 3]!, [200, 450, 900][seed % 3]!, seed % 4 === 0 ? 0.75 : 1, true);
  });
});

describe('Packet Runner scoring', () => {
  it('a careful player survives the full 90 seconds and earns three stars; a sloppy one runs out of lives', () => {
    const scores: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const good = play(seed, 1, 350);
      expect(good.won).toBe(true);
      expect(good.elapsed).toBe(DURATION);
      scores.push(good.score);
      const bad = play(seed, 0.7, 350);
      expect(bad.won).toBe(false);
    }
    const t = ARCADE_BY_ID['packet-runner'].stars;
    for (const sc of scores) expect(arcadeStars(sc, t)).toBe(3);
  });
  it('a slow but accurate player earns fewer stars than a quick one', () => {
    const t = ARCADE_BY_ID['packet-runner'].stars;
    const slow = play(5, 1, 2200);
    const quick = play(5, 1, 300);
    expect(slow.score).toBeLessThan(quick.score);
    expect(arcadeStars(slow.score, t)).toBeGreaterThanOrEqual(1);
    expect(arcadeStars(slow.score, t)).toBeLessThan(3);
  });
});
