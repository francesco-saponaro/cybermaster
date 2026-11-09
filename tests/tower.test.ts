import { describe, it, expect } from 'vitest';
import { ATTACKS, FIXES, FIX_BY_ID, passWhy, stops, type AttackId, type FixId } from '../src/content/arcade/defence';
import { ARCADE_BY_ID } from '../src/content/arcade';
import { arcadeStars } from '../src/engine/arcade';
import { makeRng } from '../src/engine/rng';
import {
  actTower, buildable, COLS, DB, isRoute, MAX_UNITS, ROUTES, ROWS, SPACING, startTower, stepTower, UNIT_SIZE, unitXY, WAVE_COUNTS, WAVE_TYPES, wavePreview, type TowerState,
} from '../src/arcade/tower';

const FRAME = 16;

function assertNoOverlap(s: TowerState) {
  expect(s.units.length).toBeLessThanOrEqual(MAX_UNITS);
  const pos = s.units.map(unitXY);
  for (let i = 0; i < pos.length; i++)
    for (let j = i + 1; j < pos.length; j++) {
      const a = pos[i]!;
      const b = pos[j]!;
      const overlap = Math.abs(a.x - b.x) < UNIT_SIZE - 1e-9 && Math.abs(a.y - b.y) < UNIT_SIZE - 1e-9;
      expect(overlap, `units ${s.units[i]!.id} and ${s.units[j]!.id} overlap at ${JSON.stringify(a)} ${JSON.stringify(b)}`).toBe(false);
    }
  for (const p of pos) expect(p.x >= 0 && p.x < COLS && p.y >= 0 && p.y < ROWS).toBe(true);
}

function place(s: TowerState, fix: FixId, c: number, r: number): TowerState {
  s = actTower(s, { t: 'select', fix });
  s = actTower(s, { t: 'cursor-set', c, r });
  return actTower(s, { t: 'place' });
}

/** Plays to the end. `plan` runs at the start of every build phase. */
function playTower(seed: number, plan: (s: TowerState) => TowerState, check = false, pace = 1): TowerState {
  let s = startTower(seed, pace);
  let lastWave = -1;
  while (!s.over) {
    if (s.phase === 'build' && s.wave !== lastWave) {
      lastWave = s.wave;
      s = plan(s);
    }
    s = stepTower(s, FRAME);
    if (check) assertNoOverlap(s);
    expect(s.budget).toBeGreaterThanOrEqual(0);
    expect(s.elapsed).toBeLessThan(400_000);
  }
  return s;
}

const CENTRE = [1, 3, 5, 6, 2, 4, 0, 7].map((r) => ({ c: 3, r }));
/** A player who knows the matrix: the right fix in the middle column, which covers both routes. */
const expert = (s: TowerState) => {
  for (const { type } of wavePreview(s)) {
    if (s.fixes.some((f) => FIX_BY_ID[f.fix].stops === type)) continue;
    const fix = FIXES.find((f) => f.stops === type)!;
    const spot = CENTRE.find((t) => buildable(s, t.c, t.r));
    if (spot && s.budget >= fix.cost) s = place(s, fix.id, spot.c, spot.r);
  }
  return s;
};

describe('Hold the Line: which fix stops which attack', () => {
  it('exactly one fix stops each attack, and the WAF stops none', () => {
    for (const a of ATTACKS) expect(FIXES.filter((f) => stops(f.id, a.id)).map((f) => f.id)).toHaveLength(1);
    for (const a of ATTACKS) expect(stops('waf', a.id)).toBe(false);
  });
  it('the full matrix: parameterised queries stop SQL injection and nothing else, and so on', () => {
    const expected: Record<Exclude<FixId, 'waf'>, AttackId> = { params: 'sqli', escape: 'xss', owner: 'idor', args: 'cmdi', urls: 'ssrf', fields: 'mass' };
    for (const f of FIXES) for (const a of ATTACKS) expect(stops(f.id, a.id), `${f.id} vs ${a.id}`).toBe(f.id !== 'waf' && expected[f.id as Exclude<FixId, 'waf'>] === a.id);
  });
  it('every miss has a reason that names the fix that would work', () => {
    for (const f of FIXES) for (const a of ATTACKS) if (!stops(f.id, a.id)) expect(passWhy(f.id, a.id)).toContain(a.why);
  });
  it('the labels are short enough for a tile on a phone', () => {
    for (const a of ATTACKS) expect(a.short.length).toBeLessThanOrEqual(5);
    for (const f of FIXES) expect(f.short.length).toBeLessThanOrEqual(6);
  });
});

describe('Hold the Line: the board', () => {
  it('two routes from the top to the database, never closer than two tiles to each other', () => {
    for (const r of ROUTES) {
      expect(r.tiles.at(-1)).toEqual(DB);
      for (let i = 1; i < r.tiles.length; i++) expect(Math.abs(r.tiles[i]!.c - r.tiles[i - 1]!.c) + Math.abs(r.tiles[i]!.r - r.tiles[i - 1]!.r)).toBe(1);
    }
    for (const a of ROUTES[0]!.tiles.slice(0, -1)) for (const b of ROUTES[1]!.tiles.slice(0, -1)) expect(Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r))).toBeGreaterThanOrEqual(2);
    expect(SPACING).toBeGreaterThanOrEqual(2 * UNIT_SIZE);
  });
  it('fixes go only beside a route, never on it or on another fix', () => {
    let s = startTower(1);
    expect(isRoute(0, 0)).toBe(true);
    expect(place(s, 'params', 0, 0).fixes).toHaveLength(0);
    s = place(s, 'params', 3, 1);
    expect(s.fixes).toHaveLength(1);
    expect(s.budget).toBe(50);
    expect(place(s, 'escape', 3, 1).fixes).toHaveLength(1);
    expect(place(s, 'escape', 6, 6).event?.text).toMatch(/Too far|costs/);
  });
  it('waves bring in the attacks a few at a time, each wave with every type it lists, on both routes', () => {
    const s = startTower(77);
    expect(s.waves.map((w) => w.length)).toEqual(WAVE_COUNTS);
    s.waves.forEach((w, i) => {
      expect(new Set(w.map((u) => u.type))).toEqual(new Set(WAVE_TYPES[i]));
      expect(new Set(w.map((u) => u.route))).toEqual(new Set([0, 1]));
    });
    expect(startTower(77).waves).toEqual(s.waves);
  });
});

describe('Hold the Line: spacing over long runs', () => {
  it('no two attacks ever overlap, over 30 full games with random, wrong and slowing defences', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = makeRng(seed * 31);
      const random = (s: TowerState) => {
        for (let k = 0; k < 3; k++) {
          const c = rng.int(0, COLS - 1);
          const r = rng.int(0, ROWS - 1);
          if (buildable(s, c, r)) s = place(s, rng.pick(FIXES).id, c, r);
        }
        return s;
      };
      playTower(seed, seed % 3 === 0 ? expert : random, true, seed % 4 === 0 ? 0.75 : 1);
    }
  });
});

describe('Hold the Line: play', () => {
  it('the right fix stops its attack where the route passes it', () => {
    const s = playTower(5, expert);
    expect(s.won).toBe(true);
    expect(s.leaks).toBe(0);
    expect(s.stops).toBe(WAVE_COUNTS.reduce((a, b) => a + b, 0));
  });
  it('a wrong fix lets the attack walk past and says why', () => {
    let s = place(startTower(2), 'escape', 3, 1);
    let saw = '';
    while (s.wave === 0 && !s.over) {
      s = stepTower(s, FRAME);
      if (s.event?.tone === 'bad' && !saw) saw = s.event.text;
    }
    expect(saw).toContain('Output escaping does nothing against sql injection');
    expect(s.leaks).toBe(WAVE_COUNTS[0]);
    expect(s.fixes[0]!.passedBy.sqli).toBeGreaterThan(0);
  });
  it('a WAF slows attacks down but stops none of them', () => {
    const time = (withWaf: boolean) => {
      let s = startTower(3);
      if (withWaf) s = place(place(s, 'waf', 3, 1), 'waf', 1, 1);
      while (s.wave === 0 && !s.over) s = stepTower(s, FRAME);
      return s;
    };
    const plain = time(false);
    const waf = time(true);
    expect(waf.stops).toBe(0);
    expect(waf.leaks).toBe(plain.leaks);
    expect(waf.elapsed).toBeGreaterThan(plain.elapsed + 1000);
  });
  it('doing nothing, or only buying firewalls, loses to the leak meter', () => {
    expect(playTower(4, (s) => s).won).toBe(false);
    const wafOnly = playTower(4, (s) => {
      const spot = CENTRE.find((t) => buildable(s, t.c, t.r));
      return spot && s.budget >= 30 ? place(s, 'waf', spot.c, spot.r) : s;
    });
    expect(wafOnly.won).toBe(false);
    expect(wafOnly.stops).toBe(0);
  });
  it('an expert wins every seed with three stars inside two minutes; a player who learns one fix late gets fewer', () => {
    const t = ARCADE_BY_ID['tower-defence'].stars;
    for (let seed = 1; seed <= 20; seed++) {
      const s = playTower(seed, expert);
      expect(s.won).toBe(true);
      expect(arcadeStars(s.score, t)).toBe(3);
      expect(s.elapsed).toBeLessThan(125_000);
      // Skips the XSS fix until wave 4.
      const late = playTower(seed, (x) => (x.wave < 3 ? { ...expert({ ...x, waves: x.waves.map((w) => w.filter((u) => u.type !== 'xss')) }), waves: x.waves } : expert(x)));
      expect(late.score).toBeLessThan(s.score);
      expect(arcadeStars(late.score, t)).toBeLessThan(3);
    }
  });
});
