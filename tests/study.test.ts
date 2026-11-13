import { describe, expect, it } from 'vitest';
import { ACRONYMS } from '../src/content/acronyms';
import { ROADMAP } from '../src/content/roadmap';
import { CODEX_BY_ID, LEVEL_BY_ID } from '../src/content/index';

/** Levels the roadmap points at that later zones add. Each must be built before the roadmap calls it covered. */
const PLANNED = /^(net|linux|pcap|msf|audit)-/;

describe('acronyms', () => {
  it('are unique, expanded and explained', () => {
    const abbrs = ACRONYMS.map((a) => a.abbr);
    expect(new Set(abbrs).size).toBe(abbrs.length);
    for (const a of ACRONYMS) {
      expect(a.full.length, a.abbr).toBeGreaterThan(3);
      expect(a.meaning.length, a.abbr).toBeGreaterThan(30);
    }
  });
  it('cover every acronym the roadmap uses, and the ones the boss asked about', () => {
    const need = ['CVE', 'KEV', 'CVSS', 'CWE', 'NVD', 'OWASP', 'ASVS', 'WSTG', 'CIS', 'NIST', 'CSF', 'GRC', 'SOC', 'SIEM', 'EDR', 'IAM', 'S3', 'EC2', 'AWS', 'API', 'REST', 'JWT', 'HTTP', 'HTTPS', 'TCP', 'IP', 'DNS', 'NAT', 'VLAN', 'SSH', 'SMB', 'RDP', 'AD', 'NSE', 'SQL', 'XSS', 'IDOR', 'BOLA', 'TLS', 'VM', 'CI/CD', 'SAST'];
    const have = new Set(ACRONYMS.map((a) => a.abbr));
    for (const n of need) expect(have.has(n), n).toBe(true);
  });
});

describe('roadmap', () => {
  it('points only at levels that exist or are planned, and codex entries that exist', () => {
    for (const b of ROADMAP) {
      for (const i of b.items) {
        expect(i.levels.length, i.en).toBeGreaterThan(0);
        for (const id of i.levels) expect(!!LEVEL_BY_ID[id] || PLANNED.test(id), `${b.id}: ${id}`).toBe(true);
        for (const c of i.codex ?? []) expect(CODEX_BY_ID[c], `${b.id}: ${c}`).toBeDefined();
      }
      expect(b.practise.length).toBeGreaterThan(0);
      for (const p of b.practise) expect(p.url).toMatch(/^https:\/\//);
    }
  });
});
