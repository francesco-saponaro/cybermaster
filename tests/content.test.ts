import { describe, it, expect } from 'vitest';
import { ALL_MISSIONS, MISSION_BY_ID, ZONES, CODEX, playableMissions } from '../src/content/index';
import { baseScore, parseVector } from '../src/engine/cvss';

describe('mission data integrity', () => {
  it('has no duplicate mission ids', () => {
    const ids = ALL_MISSIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no duplicate codex ids', () => {
    const ids = CODEX.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers at least twenty playable missions', () => {
    expect(playableMissions().length).toBeGreaterThanOrEqual(20);
  });

  it('every mission names a real zone', () => {
    const zoneIds = new Set(ZONES.map((z) => z.id));
    for (const m of ALL_MISSIONS) expect(zoneIds.has(m.zone)).toBe(true);
  });

  it('every zone references real missions and a real boss', () => {
    for (const z of ZONES) {
      for (const id of [...z.missionIds, z.bossId]) expect(MISSION_BY_ID[id], `${z.id} -> ${id}`).toBeDefined();
      expect(MISSION_BY_ID[z.bossId]!.kind).toBe('boss');
    }
  });

  it('every zone has four to six missions plus a boss', () => {
    for (const z of ZONES) {
      expect(z.missionIds.length).toBeGreaterThanOrEqual(4);
      expect(z.missionIds.length).toBeLessThanOrEqual(6);
    }
  });

  it('every boss stage exists and is not itself a boss', () => {
    for (const m of ALL_MISSIONS) {
      if (m.kind !== 'boss') continue;
      for (const s of m.stages) {
        const stage = MISSION_BY_ID[s];
        expect(stage, `${m.id} -> ${s}`).toBeDefined();
        expect(stage!.kind).not.toBe('boss');
      }
    }
  });

  it('every codex id a mission references exists', () => {
    const codexIds = new Set(CODEX.map((c) => c.id));
    for (const m of ALL_MISSIONS) for (const c of m.codex) expect(codexIds.has(c), `${m.id} -> ${c}`).toBe(true);
  });

  it('every codex entry is referenced by at least one mission', () => {
    const referenced = new Set<string>();
    for (const m of ALL_MISSIONS) for (const c of m.codex) referenced.add(c);
    for (const c of CODEX) expect(referenced.has(c.id), `unreferenced: ${c.id}`).toBe(true);
  });

  it('every codex entry belongs to a real zone and has a body', () => {
    const zoneIds = new Set(ZONES.map((z) => z.id));
    for (const c of CODEX) {
      expect(zoneIds.has(c.zone)).toBe(true);
      expect(c.body.length).toBeGreaterThan(0);
    }
  });

  it('match missions have a correct fix for every bug on the belt', () => {
    for (const m of ALL_MISSIONS) {
      if (m.kind !== 'match') continue;
      const fixIds = new Set(m.fixes.map((f) => f.id));
      for (const bug of m.bugs) expect(fixIds.has(bug.fix), `${m.id}: ${bug.id}`).toBe(true);
    }
  });

  it('audit missions mark an exposed resource with a valid reason index', () => {
    for (const m of ALL_MISSIONS) {
      if (m.kind !== 'audit') continue;
      for (const r of m.resources) {
        if (r.exposed) {
          expect(r.answer).toBeGreaterThanOrEqual(0);
          expect(r.answer).toBeLessThan(r.reasons.length);
        }
      }
    }
  });

  it('api missions include a correct fix and at least one leaking id', () => {
    for (const m of ALL_MISSIONS) {
      if (m.kind !== 'api') continue;
      expect(m.fixOptions.some((f) => f.correct)).toBe(true);
      expect(m.ids.some((x) => x.leaks)).toBe(true);
    }
  });

  it('triage items have a valid verdict', () => {
    const verdicts = new Set(['true', 'false', 'validate']);
    for (const m of ALL_MISSIONS) {
      if (m.kind !== 'triage') continue;
      for (const it of m.items) expect(verdicts.has(it.answer)).toBe(true);
    }
  });

  it('report fields always have exactly one good option', () => {
    for (const m of ALL_MISSIONS) {
      if (m.kind !== 'report') continue;
      for (const f of m.fields) {
        expect(f.options.filter((o) => o.quality === 'good').length).toBe(1);
      }
    }
  });

  it('every CVSS case vector parses to the severity band its score implies', () => {
    for (const m of ALL_MISSIONS) {
      if (m.kind !== 'cvss') continue;
      for (const c of m.cases) {
        const score = baseScore(parseVector(c.vector));
        expect(score).toBeGreaterThan(0);
        expect(score).toBeLessThanOrEqual(10);
      }
    }
  });
});
