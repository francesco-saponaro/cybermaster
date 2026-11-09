import { describe, it, expect } from 'vitest';
import { baseScore, parseVector, formatVector, severity, roundUp, compareVectors } from '../src/engine/cvss';

// Reference scores from the FIRST CVSS v3.1 specification examples and public
// NVD entries. These are the published base scores, so they pin the maths.
const CASES: { vector: string; score: number; sev: string }[] = [
  { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', score: 7.5, sev: 'High' }, // Heartbleed
  { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', score: 10.0, sev: 'Critical' }, // Log4Shell
  { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N', score: 6.1, sev: 'Medium' }, // reflected XSS (FIRST spec example)
  { vector: 'CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H', score: 7.8, sev: 'High' }, // local privilege escalation
  { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H', score: 7.5, sev: 'High' }, // DoS
  { vector: 'CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N', score: 5.9, sev: 'Medium' },
  { vector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N', score: 5.4, sev: 'Medium' }, // stored XSS, authed
  { vector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N', score: 6.5, sev: 'Medium' }, // IDOR reading data
  { vector: 'CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N', score: 1.6, sev: 'Low' },
  { vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N', score: 0.0, sev: 'None' },
];

describe('CVSS v3.1 base score', () => {
  for (const c of CASES) {
    it(`${c.vector} = ${c.score} (${c.sev})`, () => {
      const v = parseVector(c.vector);
      expect(baseScore(v)).toBeCloseTo(c.score, 5);
      expect(severity(baseScore(v))).toBe(c.sev);
    });
  }

  it('round-up matches the spec definition', () => {
    expect(roundUp(4.02)).toBe(4.1);
    expect(roundUp(4.0)).toBe(4.0);
    expect(roundUp(6.001)).toBe(6.1);
    expect(roundUp(0)).toBe(0);
  });

  it('parse and format round-trip', () => {
    const v = parseVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H');
    expect(formatVector(v)).toBe('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H');
  });

  it('rejects an incomplete vector', () => {
    expect(() => parseVector('CVSS:3.1/AV:N/AC:L')).toThrow();
  });

  it('compareVectors counts matched metrics and the score gap', () => {
    const a = parseVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N');
    const b = parseVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N');
    expect(compareVectors(a, b)).toEqual({ matched: 8, scoreGap: 0 });
    const c = parseVector('CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N');
    const res = compareVectors(a, c);
    expect(res.matched).toBe(7);
    expect(res.scoreGap).toBeGreaterThan(0);
  });
});
