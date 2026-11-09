import { describe, it, expect } from 'vitest';
import { readFinding, parseYaml, labChecks, placeArtifact, FINDING_TARGET_VECTOR, type FindingDraft } from '../src/sim/report';

const pass = (checks: { id: string; pass: boolean }[]) => Object.fromEntries(checks.map((c) => [c.id, c.pass]));

const good: FindingDraft = {
  title: 'SQL injection in the login form',
  asset: 'POST https://shop.lantern.example/login',
  vector: FINDING_TARGET_VECTOR,
  description: 'The name field is pasted into the SQL query without parameters. A quote in the name ends the string and the rest of the input becomes part of the query.',
  impact: 'Anyone can log in as the admin account without a password and read or change every customer record.',
  evidence: ['ev-sqli-request', 'ev-sqli-log'],
  fix: 'Use parameterised queries (prepared statements) for every query that takes user input.',
};

describe('the client reading a finding', () => {
  it('accepts a complete finding', () => {
    expect(Object.values(pass(readFinding(good))).every(Boolean)).toBe(true);
  });
  it('says what is weak, field by field', () => {
    const weak = readFinding({ ...good, title: 'Security issue', evidence: ['ev-scanner-sqli'], fix: 'Add a WAF filter for quotes.', description: 'Bad.' });
    const by = Object.fromEntries(weak.map((c) => [c.id, c]));
    expect(by.title!.pass).toBe(false);
    expect(by.evidence!.detail).toMatch(/scanner line is not proof/);
    expect(by.fix!.detail).toMatch(/bandage/);
    expect(by.description!.detail).toMatch(/Two or three sentences/);
    expect(readFinding({ ...good, vector: 'CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N' }).find((c) => c.id === 'severity')!.pass).toBe(false);
  });
});

describe('the phases timeline', () => {
  const a = { id: 'poc', label: '', detail: '', phase: 3, consequence: 'You exploited a server nobody authorised.' };
  it('accepts the right slot and gives the consequence otherwise', () => {
    expect(placeArtifact(a, 3, [null, null, null, null, null, null]).ok).toBe(true);
    expect(placeArtifact(a, 1, ['roe', null, null, null, null, null]).reason).toMatch(/nobody authorised/);
    expect(placeArtifact(a, 1, [null, null, null, null, null, null]).reason).toMatch(/Nothing is signed yet/);
  });
});

describe('the compose file', () => {
  it('reads maps, lists, quotes and comments', () => {
    expect(parseYaml('services:\n  web:\n    image: "nginx:1.27" # pinned\n    ports:\n      - "127.0.0.1:8080:80"\n')).toEqual({ services: { web: { image: 'nginx:1.27', ports: ['127.0.0.1:8080:80'] } } });
    expect(parseYaml('a:\n  - name: x\n    v: 1\n  - name: y\n')).toEqual({ a: [{ name: 'x', v: 1 }, { name: 'y' }] });
    expect(() => parseYaml('a:\n\tb: 1')).toThrow(/tabs/);
  });
  const broken = `services:
  juice-shop:
    image: bkimminich/juice-shop
    ports:
      - "3000:3000"
  zap:
    image: ghcr.io/zaproxy/zaproxy:stable
    command: zap-baseline.py -t http://localhost:3000
    networks:
      - scan
networks:
  scan:
`;
  it('the starting lab fails on exposure, target and network', () => {
    expect(pass(labChecks(broken).checks)).toEqual({ juice: true, local: false, zap: true, target: false, network: false });
    expect(labChecks(broken).checks.find((c) => c.id === 'target')!.detail).toMatch(/localhost is ZAP itself/);
  });
  it('the wired lab passes', () => {
    const fixed = broken.replace('"3000:3000"', '"127.0.0.1:3000:3000"').replace('http://localhost:3000', 'http://juice-shop:3000').replace('    image: bkimminich/juice-shop\n', '    image: bkimminich/juice-shop\n    networks:\n      - scan\n');
    expect(Object.values(pass(labChecks(fixed).checks)).every(Boolean)).toBe(true);
    const noNets = fixed.replace(/\n    networks:\n      - scan/g, '').replace('networks:\n  scan:\n', '');
    expect(pass(labChecks(noNets).checks).network).toBe(true);
  });
  it('reports a bad line', () => {
    expect(labChecks('services:\n  a b c\n').error).toMatch(/Line 2/);
  });
});
