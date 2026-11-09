import { describe, it, expect } from 'vitest';
import {
  evaluate, globMatch, parsePolicy, bucketChecks, iamChecks, sgChecks, portsCover, keyChecks, triageChecks,
  gatewayChecks, perMinute, LEAKED_KEY, BACKUP_KEY, NEW_KEY, APP_ROLE, type SgRule, type KeyState,
} from '../src/sim/cloud';

const pass = (checks: { id: string; pass: boolean }[]) => Object.fromEntries(checks.map((c) => [c.id, c.pass]));

describe('the policy evaluator', () => {
  it('matches globs the way IAM does', () => {
    expect(globMatch('s3:Get*', 's3:GetObject', true)).toBe(true);
    expect(globMatch('s3:get*', 's3:GetObject', true)).toBe(true);
    expect(globMatch('arn:aws:s3:::b/exports/*', 'arn:aws:s3:::b/monthly/x', false)).toBe(false);
  });
  it('explicit deny beats allow; nothing matching is an implicit deny', () => {
    const p = { Statement: [{ Effect: 'Allow' as const, Action: 's3:*', Resource: '*' }, { Effect: 'Deny' as const, Action: 's3:DeleteObject', Resource: '*' }] };
    expect(evaluate(p, { principal: 'x', action: 's3:GetObject', resource: 'arn:aws:s3:::a/b' })).toBe('allow');
    expect(evaluate(p, { principal: 'x', action: 's3:DeleteObject', resource: 'arn:aws:s3:::a/b' })).toBe('deny');
    expect(evaluate({ Statement: [] }, { principal: 'x', action: 's3:GetObject', resource: 'r' })).toBe('implicit-deny');
  });
  it('explains broken JSON', () => {
    const r = parsePolicy('{ "Statement": [ }');
    expect(r.ok).toBe(false);
    expect(parsePolicy('{"Statement":[{"Effect":"Maybe","Action":"a","Resource":"r"}]}')).toMatchObject({ ok: false, error: expect.stringMatching(/Effect/) });
  });
});

const PUBLIC = JSON.stringify({ Version: '2012-10-17', Statement: [
  { Sid: 'PublicRead', Effect: 'Allow', Principal: '*', Action: 's3:GetObject', Resource: 'arn:aws:s3:::harbor-invoices/*' },
  { Sid: 'BillingApp', Effect: 'Allow', Principal: { AWS: APP_ROLE }, Action: 's3:GetObject', Resource: 'arn:aws:s3:::harbor-invoices/*' },
] });

describe('bucket checker', () => {
  it('flags the public statement and lets strangers download', () => {
    const r = bucketChecks(PUBLIC, false);
    expect(pass(r.checks)).toEqual({ 'no-public': false, 'app-reads': true, bpa: false });
    expect(r.anonymousStatus).toBe(200);
  });
  it('Block Public Access stops the download even before the policy is fixed', () => {
    expect(bucketChecks(PUBLIC, true).anonymousStatus).toBe(403);
  });
  it('passes once the public statement is gone, the app keeps access and BPA is on', () => {
    const fixed = JSON.stringify({ Statement: [JSON.parse(PUBLIC).Statement[1]] });
    expect(pass(bucketChecks(fixed, true).checks)).toEqual({ 'no-public': true, 'app-reads': true, bpa: true });
  });
  it('deleting everything breaks the app check', () => {
    expect(pass(bucketChecks('{"Statement":[]}', true).checks)['app-reads']).toBe(false);
  });
});

describe('least privilege checker', () => {
  it('admin access fails; the exact two actions pass; s3:* is still a wildcard', () => {
    expect(pass(iamChecks('{"Statement":[{"Effect":"Allow","Action":"*","Resource":"*"}]}').checks)).toEqual({ task: true, 'no-star-action': false, 'no-star-resource': false, denied: false });
    const good = JSON.stringify({ Statement: [
      { Effect: 'Allow', Action: 's3:GetObject', Resource: 'arn:aws:s3:::harbor-reports/monthly/*' },
      { Effect: 'Allow', Action: 's3:PutObject', Resource: 'arn:aws:s3:::harbor-reports/exports/*' },
    ] });
    expect(Object.values(pass(iamChecks(good).checks)).every(Boolean)).toBe(true);
    const star = JSON.stringify({ Statement: [{ Effect: 'Allow', Action: 's3:*', Resource: 'arn:aws:s3:::harbor-reports/*' }] });
    expect(pass(iamChecks(star).checks)).toMatchObject({ 'no-star-action': false, denied: false });
    const tooTight = JSON.stringify({ Statement: [{ Effect: 'Allow', Action: 's3:GetObject', Resource: 'arn:aws:s3:::harbor-reports/monthly/*' }] });
    expect(pass(iamChecks(tooTight).checks).task).toBe(false);
  });
});

describe('security group checker', () => {
  const start: SgRule[] = [
    { id: 'a', protocol: 'tcp', ports: '443', source: '0.0.0.0/0', note: '' },
    { id: 'b', protocol: 'tcp', ports: '22', source: '0.0.0.0/0', note: '' },
    { id: 'c', protocol: 'tcp', ports: '3389', source: '::/0', note: '' },
    { id: 'd', protocol: 'tcp', ports: '5432', source: '0.0.0.0/0', note: '' },
  ];
  it('flags the open admin ports and the database', () => {
    expect(pass(sgChecks(start))).toEqual({ ssh: false, rdp: false, db: false, web: true, office: true });
  });
  it('passes when SSH is limited to the office and the rest closed', () => {
    const fixed = [start[0]!, { ...start[1]!, source: '203.0.113.64/27' }];
    expect(Object.values(pass(sgChecks(fixed))).every(Boolean)).toBe(true);
  });
  it('a port range or "all" still counts; deleting SSH entirely locks the office out', () => {
    expect(pass(sgChecks([start[0]!, { id: 'x', protocol: 'all', ports: 'all', source: '0.0.0.0/0', note: '' }])).ssh).toBe(false);
    expect(portsCover('20-25', 22)).toBe(true);
    expect(pass(sgChecks([start[0]!])).office).toBe(false);
  });
});

describe('key rotation checker', () => {
  const s = (over: Partial<KeyState>): KeyState => ({
    keys: [{ id: LEAKED_KEY, status: 'Active', created: '' }, { id: BACKUP_KEY, status: 'Active', created: '' }],
    ciKey: LEAKED_KEY, backupKey: BACKUP_KEY, found: true, ...over,
  });
  it('rotating in the right order passes', () => {
    const done = s({ keys: [{ id: LEAKED_KEY, status: 'Inactive', created: '' }, { id: BACKUP_KEY, status: 'Active', created: '' }, { id: NEW_KEY, status: 'Active', created: '' }], ciKey: NEW_KEY });
    expect(Object.values(pass(keyChecks(done))).every(Boolean)).toBe(true);
  });
  it('switching the leaked key off before moving the pipeline breaks deploys', () => {
    expect(pass(keyChecks(s({ keys: [{ id: LEAKED_KEY, status: 'Inactive', created: '' }, { id: BACKUP_KEY, status: 'Active', created: '' }] })))).toMatchObject({ revoked: true, deploys: false });
  });
  it('switching off the wrong key breaks backups', () => {
    expect(pass(keyChecks(s({ keys: [{ id: LEAKED_KEY, status: 'Active', created: '' }, { id: BACKUP_KEY, status: 'Inactive', created: '' }] }))).backups).toBe(false);
  });
});

describe('triage and the gateway', () => {
  it('counts real issues and false alarms separately', () => {
    const f = [{ id: 'a', truth: 'fix' }, { id: 'b', truth: 'dismiss' }] as never;
    expect(pass(triageChecks(f, { a: 'fix', b: 'fix' }))).toEqual({ real: true, noise: false });
  });
  it('reads rate limits', () => {
    expect(perMinute('5/min')).toBe(5);
    expect(perMinute('1/s')).toBe(60);
    expect(perMinute('soon')).toBeNull();
  });
  const base = { routes: [
    { path: '/v1/login', method: 'POST', auth: 'none' },
    { path: '/v1/orders', method: 'GET', auth: 'jwt' },
    { path: '/v1/orders/{id}', method: 'GET', auth: 'jwt', ownerCheck: false },
    { path: '/internal/export', method: 'GET', auth: 'none' },
  ] };
  it('the starting gateway fails export, BOLA and rate limit but customers are fine', () => {
    expect(pass(gatewayChecks(JSON.stringify(base)).checks)).toEqual({ export: false, bola: false, ratelimit: false, customers: true });
  });
  it('the fixed gateway passes; locking the login route breaks customers; deleting export breaks the job', () => {
    const fixed = { routes: [
      { path: '/v1/login', method: 'POST', auth: 'none', rateLimit: '5/min' },
      { path: '/v1/orders', method: 'GET', auth: 'jwt' },
      { path: '/v1/orders/{id}', method: 'GET', auth: 'jwt', ownerCheck: true },
      { path: '/internal/export', method: 'GET', auth: 'service-token' },
    ] };
    expect(Object.values(pass(gatewayChecks(JSON.stringify(fixed)).checks)).every(Boolean)).toBe(true);
    const locked = { routes: fixed.routes.map((r) => (r.path === '/v1/login' ? { ...r, auth: 'jwt' } : r)) };
    expect(pass(gatewayChecks(JSON.stringify(locked)).checks).customers).toBe(false);
    const gone = { routes: fixed.routes.filter((r) => r.path !== '/internal/export') };
    expect(pass(gatewayChecks(JSON.stringify(gone)).checks).export).toBe(false);
  });
});
