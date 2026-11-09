import { describe, it, expect } from 'vitest';
import { LEVEL_BY_ID } from '../src/content/index';
import type { WireLevel, TerminalLevel, WireState } from '../src/content/types';
import { parseRequest, applySetCookies, documentCookie, type HttpResponse } from '../src/sim/http';
import { SERVERS } from '../src/sim/wire';
import { replacePath, rebuildToken, tokenParts } from '../src/game/sandboxes/WireSandbox';
import { evaluateTerminal, judgeAnswer } from '../src/game/evaluate';
import { execute } from '../src/sim/terminal';
import { levelStars, xpForClear, starNotes } from '../src/engine/scoring';
import { applyClear } from '../src/state/store';
import { emptySave } from '../src/engine/save';
import { levelUnlocked, zoneUnlocked, earnedBadges } from '../src/engine/progress';
import { ZONES } from '../src/content/zones';

const empty = (): WireState => ({ exchanges: [], forwarded: [], console: [], jar: [] });
const send = (level: WireLevel, s: WireState, raw: string) => {
  const p = parseRequest(raw);
  if (!p.ok) throw new Error(p.error);
  s.exchanges.push({ req: p.req, res: SERVERS[level.server](p.req) });
};

describe('Wire level completion', () => {
  it('wire-robots completes after robots.txt and the hidden page', () => {
    const l = LEVEL_BY_ID['wire-robots'] as WireLevel;
    const s = empty();
    send(l, s, l.request);
    expect(l.evaluate(s)).toEqual({ sent: true, robots: false, hidden: false });
    send(l, s, replacePath(l.request, '/robots.txt'));
    send(l, s, replacePath(l.request, '/staff-notes'));
    expect(Object.values(l.evaluate(s)).every(Boolean)).toBe(true);
  });
  it('wire-cookie-role completes when the role cookie says admin', () => {
    const l = LEVEL_BY_ID['wire-cookie-role'] as WireLevel;
    const s = empty();
    send(l, s, l.request.replace('role=user', 'role=admin'));
    expect(l.evaluate(s).admin).toBe(true);
  });
  it('wire-httponly needs the flag, the hidden cookie and a live session', () => {
    const l = LEVEL_BY_ID['wire-httponly'] as WireLevel;
    const s = empty();
    const parsed = parseRequest(l.request);
    if (!parsed.ok) throw new Error(parsed.error);
    const login = SERVERS.httponly(parsed.req);
    const flagged: HttpResponse = { ...login, headers: login.headers.map(([k, v]) => [k, k === 'Set-Cookie' ? v + '; HttpOnly' : v]) };
    s.forwarded.push(login);
    s.jar = applySetCookies(s.jar, login.headers);
    s.console.push({ input: 'document.cookie', output: documentCookie(s.jar) });
    expect(l.evaluate(s)).toMatchObject({ read: true, flag: false });
    s.forwarded.push(flagged);
    s.jar = applySetCookies(s.jar, flagged.headers);
    s.console.push({ input: 'document.cookie', output: documentCookie(s.jar) });
    send(l, s, 'GET /account HTTP/1.1\nCookie: session=e5d1f0a7c3b9');
    expect(Object.values(l.evaluate(s)).every(Boolean)).toBe(true);
  });
  it('wire-jwt: the JWT editor helpers re-encode the token in the request', () => {
    const l = LEVEL_BY_ID['wire-jwt'] as WireLevel;
    let raw = replacePath(l.request, '/v1/admin');
    raw = rebuildToken(raw, { payload: '{"sub":"sam","role":"admin"}' });
    expect(tokenParts(raw)?.payload).toBe('{"sub":"sam","role":"admin"}');
    const s = empty();
    send(l, s, raw);
    raw = rebuildToken(raw, { header: '{"alg":"none"}', signature: '' });
    send(l, s, raw);
    send(l, s, replacePath(raw, '/v2/admin'));
    expect(l.evaluate(s)).toEqual({ tampered: true, v1: true, v2: true });
  });
});

describe('Perimeter level completion', () => {
  it('perimeter-versions: facts from the scan and the lookup, then the right CVE', () => {
    const l = LEVEL_BY_ID['perimeter-versions'] as TerminalLevel;
    const ctx = { net: l.network, history: [] };
    const facts = [...execute('nmap -sV -p 21 10.0.8.21', ctx).facts, ...execute('vulndb vsftpd 2.3.4', ctx).facts];
    expect(evaluateTerminal(l, facts, [])).toEqual({ version: true, lookup: true, answer: false });
    expect(judgeAnswer(l, 'CVE-2016-6210')).toMatchObject({ correct: false, reason: expect.stringMatching(/SSH/) });
    expect(judgeAnswer(l, ' cve-2011-2523 ').correct).toBe(true);
    expect(evaluateTerminal(l, facts, ['CVE-2011-2523']).answer).toBe(true);
  });
  it('perimeter-sweep accepts a sweep by prefix', () => {
    const l = LEVEL_BY_ID['perimeter-sweep'] as TerminalLevel;
    expect(evaluateTerminal(l, ['sweep:10.0.8.0/24'], ['5'])).toEqual({ sweep: true, answer: true });
  });
});

describe('stars, XP and unlocks', () => {
  it('stars come from Show me, failures and time', () => {
    expect(levelStars({ showMe: 0, fails: 0, seconds: 30 }, 60)).toBe(3);
    expect(levelStars({ showMe: 1, fails: 0, seconds: 30 }, 60)).toBe(2);
    expect(levelStars({ showMe: 3, fails: 5, seconds: 999 }, 60)).toBe(1);
    expect(starNotes({ showMe: 2, fails: 0, seconds: 10 }, 60)).toEqual(['Show me used 2 times']);
    expect(xpForClear(100, 3, true)).toBe(150);
    expect(xpForClear(100, 1, false)).toBe(67);
  });
  it('clearing a level saves stars, XP, codex, evidence and opens the next level', () => {
    const shapes = ZONES.map((z) => ({ id: z.id, levelIds: z.levelIds }));
    const s0 = emptySave();
    expect(levelUnlocked(s0, shapes, 'wire-cookie-role')).toBe(false);
    const { save, outcome } = applyClear(s0, 'arena-sqli', { showMe: 0, fails: 0, seconds: 40 }, '2026-11-09', 'now');
    expect(outcome).toMatchObject({ stars: 3, firstClear: true, unlockedCodex: ['sqli'], newEvidence: ['ev-sqli-request', 'ev-sqli-log'] });
    expect(save.evidence).toContain('ev-sqli-request');
    const s2 = applyClear(s0, 'wire-robots', { showMe: 0, fails: 0, seconds: 40 }, '2026-11-09', 'now').save;
    expect(levelUnlocked(s2, shapes, 'wire-cookie-role')).toBe(true);
    expect(zoneUnlocked(s2, shapes, 'arena')).toBe(false);
    expect(zoneUnlocked({ ...s0, zones: ['arena'] }, shapes, 'arena')).toBe(true);
    expect(earnedBadges(s2, shapes, 40)).toContain('first-clear');
  });
});
