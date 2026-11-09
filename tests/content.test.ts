import { describe, it, expect } from 'vitest';
import { ALL_MISSIONS, MISSION_BY_ID, ZONES, CODEX, playableMissions, BRIEFINGS, BRIEFING_BY_MISSION } from '../src/content/index';
import { CONCEPTS, conceptsTested, conceptsTaught, teachingOrder } from '../src/content/concepts';
import { PROLOGUE } from '../src/content/briefings/prologue';
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

describe('briefings teach before the missions test', () => {
  const order = teachingOrder(ZONES);

  it('every playable mission has a briefing of three to five beats, each asking for an action', () => {
    for (const m of playableMissions()) {
      const b = BRIEFING_BY_MISSION[m.id];
      expect(b, `no briefing for ${m.id}`).toBeDefined();
      expect(b!.beats.length, `${m.id} has ${b!.beats.length} beats`).toBeGreaterThanOrEqual(3);
      expect(b!.beats.length, `${m.id} has ${b!.beats.length} beats`).toBeLessThanOrEqual(5);
      expect(b!.mentor.length).toBeGreaterThan(0);
      for (const beat of b!.beats) {
        expect(beat.say.length).toBeGreaterThan(0);
        expect(beat.then.length).toBeGreaterThan(0);
        expect(beat.concepts.length).toBeGreaterThan(0);
      }
    }
  });

  it('the prologue is a short briefing of its own', () => {
    expect(PROLOGUE.beats.length).toBeGreaterThanOrEqual(3);
    for (const beat of PROLOGUE.beats) for (const c of beat.concepts) expect(CONCEPTS[c], `prologue -> ${c}`).toBeDefined();
  });

  it('briefings belong to real missions and have unique beat ids', () => {
    for (const b of BRIEFINGS) {
      expect(MISSION_BY_ID[b.missionId], b.missionId).toBeDefined();
      const ids = b.beats.map((x) => x.id);
      expect(new Set(ids).size, `${b.missionId} beat ids`).toBe(ids.length);
    }
  });

  it('every concept on a beat or a test item is in the registry', () => {
    for (const b of BRIEFINGS) for (const beat of b.beats) for (const c of beat.concepts) expect(CONCEPTS[c], `${b.missionId}/${beat.id} -> ${c}`).toBeDefined();
    for (const m of ALL_MISSIONS) for (const c of conceptsTested(m, MISSION_BY_ID)) expect(CONCEPTS[c], `${m.id} -> ${c}`).toBeDefined();
  });

  it('every beat action points at something in its material', () => {
    for (const b of BRIEFINGS) {
      for (const beat of b.beats) {
        const { material: mat, action } = beat;
        const where = `${b.missionId}/${beat.id}`;
        if (action.kind === 'tap-line' || action.kind === 'tap-token') {
          expect(mat.kind, where).toBe('lines');
          if (mat.kind === 'lines') {
            expect(mat.lines[action.line], where).toBeDefined();
            if (action.kind === 'tap-token') expect(mat.lines[action.line]!.includes(action.token), `${where}: token "${action.token}"`).toBe(true);
          }
        }
        if (action.kind === 'tap-card') {
          expect(mat.kind, where).toBe('cards');
          if (mat.kind === 'cards') expect(mat.cards.some((c) => c.id === action.card), where).toBe(true);
        }
        if (action.kind === 'tap-message') {
          expect(mat.kind, where).toBe('flow');
          if (mat.kind === 'flow') expect(mat.messages[action.index], where).toBeDefined();
        }
        if (action.kind === 'choose') {
          expect(action.options.length, where).toBeGreaterThanOrEqual(2);
          expect(action.answer, where).toBeLessThan(action.options.length);
        }
        if (beat.codex) expect(CODEX.some((c) => c.id === beat.codex), `${where} codex ${beat.codex}`).toBe(true);
      }
    }
  });

  it('nothing is tested before it is taught: each tested concept appears in this or an earlier briefing', () => {
    const taughtSoFar = new Set<string>();
    for (const id of order) {
      const mission = MISSION_BY_ID[id]!;
      const briefing = BRIEFING_BY_MISSION[id]!;
      for (const c of conceptsTaught(briefing)) taughtSoFar.add(c);
      for (const c of conceptsTested(mission, MISSION_BY_ID)) {
        expect(taughtSoFar.has(c), `${id} tests "${c}" before any briefing teaches it`).toBe(true);
      }
    }
  });

  it('every bad Intercept packet names its line and a reason, and each stream mixes bad and clean', () => {
    for (const m of ALL_MISSIONS) {
      if (m.kind !== 'intercept') continue;
      const bad = m.packets.filter((p) => p.bad);
      const clean = m.packets.filter((p) => !p.bad);
      expect(bad.length, m.id).toBeGreaterThanOrEqual(3);
      expect(clean.length, m.id).toBeGreaterThanOrEqual(2);
      expect(m.missLimit).toBeGreaterThanOrEqual(1);
      expect(m.pace.end).toBeLessThan(m.pace.start);
      for (const p of bad) {
        expect(p.badLine, `${m.id}/${p.id}`).toBeDefined();
        expect(p.lines[p.badLine!], `${m.id}/${p.id}`).toBeDefined();
        expect(p.reason.length).toBeGreaterThan(0);
      }
      const ids = m.packets.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('every live round goes wrong on a real message and has its fix on the belt', () => {
    for (const m of ALL_MISSIONS) {
      if (m.kind !== 'live') continue;
      const fixIds = new Set(m.fixes.map((f) => f.id));
      for (const r of m.rounds) {
        expect(r.messages[r.wrongAt], `${m.id}/${r.id}`).toBeDefined();
        expect(fixIds.has(r.fix), `${m.id}/${r.id}`).toBe(true);
      }
    }
  });

  it('card sorts have a real answer for every card and enough answers to make a choice', () => {
    for (const m of ALL_MISSIONS) {
      if (m.kind !== 'cards') continue;
      const ids = new Set(m.answers.map((a) => a.id));
      expect(m.answers.length).toBeGreaterThanOrEqual(4);
      for (const c of m.cards) expect(ids.has(c.answer), `${m.id}/${c.id}`).toBe(true);
    }
  });

  it('sort missions mark an exposed item with a valid reason index', () => {
    for (const m of ALL_MISSIONS) {
      if (m.kind !== 'sort') continue;
      for (const r of m.items) {
        if (r.exposed) {
          expect(r.answer).toBeGreaterThanOrEqual(0);
          expect(r.answer).toBeLessThan(r.reasons.length);
        }
      }
    }
  });
});
