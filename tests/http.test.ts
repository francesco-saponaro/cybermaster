import { describe, it, expect } from 'vitest';
import {
  parseRequest, parseSetCookie, applySetCookies, documentCookie, corsAllowsRead, sha256, hmacSha256, toHex,
  base64UrlEncode, base64UrlDecode, decodeJwt, signHs256, verifyJwt, parseResponseHead,
} from '../src/sim/http';
import { SERVERS, SAM_TOKEN, JWT_SECRET, corsReport } from '../src/sim/wire';

function send(server: keyof typeof SERVERS, raw: string) {
  const p = parseRequest(raw);
  if (!p.ok) throw new Error(p.error);
  return SERVERS[server](p.req);
}

describe('parseRequest', () => {
  it('reads method, path, query, headers, cookies and body', () => {
    const p = parseRequest('POST /login?next=%2Faccount HTTP/1.1\nHost: shop.example\nCookie: a=1; role=user\n\nname=sam');
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.req.method).toBe('POST');
    expect(p.req.path).toBe('/login');
    expect(p.req.query.next).toBe('/account');
    expect(p.req.cookies).toEqual({ a: '1', role: 'user' });
    expect(p.req.body).toBe('name=sam');
  });
  it('explains what is wrong with a broken request in one line', () => {
    const a = parseRequest('robots.txt');
    expect(a.ok).toBe(false);
    const b = parseRequest('FETCH / HTTP/1.1');
    expect(b.ok || b.error).toMatch(/not an HTTP method/);
    const c = parseRequest('GET robots.txt HTTP/1.1');
    expect(c.ok || c.error).toMatch(/start with a slash/);
    const d = parseRequest('GET / HTTP/1.1\nHost shop');
    expect(d.ok || d.error).toMatch(/no colon/);
  });
  it('accepts CRLF and a missing version', () => {
    const p = parseRequest('GET /cart\r\nHost: x\r\n\r\n');
    expect(p.ok).toBe(true);
  });
});

describe('cookies in the browser', () => {
  it('parses flags and hides HttpOnly cookies from document.cookie', () => {
    const c = parseSetCookie('session=abc; Path=/; HttpOnly; Secure; SameSite=Lax');
    expect(c).toMatchObject({ name: 'session', value: 'abc', httpOnly: true, secure: true, sameSite: 'Lax' });
    const jar = applySetCookies([], [['Set-Cookie', 'session=abc; HttpOnly'], ['Set-Cookie', 'theme=dark']]);
    expect(documentCookie(jar)).toBe('theme=dark');
    const open = applySetCookies(jar, [['Set-Cookie', 'session=abc']]);
    expect(documentCookie(open)).toContain('session=abc');
  });
});

describe('CORS', () => {
  it('blocks a credentialed read unless the exact origin is named with credentials', () => {
    const h = (o: string, c = 'true'): [string, string][] => [['Access-Control-Allow-Origin', o], ['Access-Control-Allow-Credentials', c]];
    expect(corsAllowsRead(h('https://evil.example'), 'https://evil.example', true).allowed).toBe(true);
    expect(corsAllowsRead(h('https://bank.example'), 'https://evil.example', true).allowed).toBe(false);
    expect(corsAllowsRead(h('*'), 'https://evil.example', true).allowed).toBe(false);
    expect(corsAllowsRead(h('https://bank.example', 'false'), 'https://bank.example', true).allowed).toBe(false);
    expect(corsAllowsRead([], 'https://bank.example', true).allowed).toBe(false);
  });
  it('the boss report follows the edited headers', () => {
    const before = corsReport([['Access-Control-Allow-Origin', '{origin}'], ['Access-Control-Allow-Credentials', 'true'], ['Set-Cookie', 'sid=1; Path=/']]);
    expect(before.evil.allowed).toBe(true);
    expect(before.bank.allowed).toBe(true);
    const after = corsReport([
      ['Access-Control-Allow-Origin', 'https://bank.example'],
      ['Access-Control-Allow-Credentials', 'true'],
      ['Set-Cookie', 'sid=1; Path=/; HttpOnly; Secure; SameSite=Lax'],
      ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
    ]);
    expect(after.evil.allowed).toBe(false);
    expect(after.bank.allowed).toBe(true);
    expect(after.cookie).toEqual({ httpOnly: true, secure: true, sameSite: 'Lax' });
    expect(after.hsts).toBe(true);
  });
  it('parses an edited response head', () => {
    const r = parseResponseHead('HTTP/1.1 200 OK\nX-A: 1');
    expect(r.ok && r.headers).toEqual([['X-A', '1']]);
    expect(parseResponseHead('200 OK').ok).toBe(false);
  });
});

describe('SHA-256, HMAC and JWT', () => {
  it('matches the published SHA-256 and HMAC test vectors', () => {
    expect(toHex(sha256(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(toHex(sha256(new Uint8Array()))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    // RFC 4231 test case 2
    expect(toHex(hmacSha256('Jefe', 'what do ya want for nothing?'))).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
  it('signs the classic jwt.io example the way every library does', () => {
    const t = signHs256('{"alg":"HS256","typ":"JWT"}', '{"sub":"1234567890","name":"John Doe","iat":1516239022}', 'your-256-bit-secret');
    expect(t).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
  });
  it('base64url round-trips and rejects junk', () => {
    expect(base64UrlDecode(base64UrlEncode('{"role":"admin"}'))).toBe('{"role":"admin"}');
    expect(base64UrlDecode('%%%')).toBeNull();
    expect(decodeJwt('a.b')).toBeNull();
  });
  it('rejects a tampered token, and alg none only where the server trusts the header', () => {
    expect(verifyJwt(SAM_TOKEN, JWT_SECRET, false).ok).toBe(true);
    const d = decodeJwt(SAM_TOKEN)!;
    const tampered = `${base64UrlEncode(d.headerRaw)}.${base64UrlEncode(d.payloadRaw.replace('user', 'admin'))}.${d.signature}`;
    const v = verifyJwt(tampered, JWT_SECRET, true);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/Invalid signature/);
    const none = `${base64UrlEncode('{"alg":"none","typ":"JWT"}')}.${base64UrlEncode('{"sub":"sam","role":"admin"}')}.`;
    expect(verifyJwt(none, JWT_SECRET, true).ok).toBe(true);
    expect(verifyJwt(none, JWT_SECRET, false).ok).toBe(false);
  });
});

describe('the Wire servers', () => {
  it('shop: robots.txt names the hidden page, which answers 200', () => {
    expect(send('shop', 'GET / HTTP/1.1').status).toBe(200);
    expect(send('shop', 'GET /robots.txt HTTP/1.1').body).toContain('/staff-notes');
    expect(send('shop', 'GET /staff-notes HTTP/1.1').status).toBe(200);
    expect(send('shop', 'GET /nope HTTP/1.1').status).toBe(404);
  });
  it('role-cookie: the server trusts role=admin', () => {
    const base = 'GET /account HTTP/1.1\nCookie: session=b81c4e2a90f7; role=';
    expect(send('role-cookie', base + 'user').view?.title).toBe('Your account');
    expect(send('role-cookie', base + 'admin').view?.title).toBe('Admin');
    expect(send('role-cookie', 'GET /account HTTP/1.1\nCookie: role=admin').status).toBe(401);
  });
  it('replay: a stolen session id makes you that user', () => {
    expect(send('replay', 'GET /account HTTP/1.1\nCookie: sid=sid-9be03d71c4').body).toContain('Signed in as mara');
    expect(send('replay', 'GET /account HTTP/1.1\nCookie: sid=guess').status).toBe(401);
  });
  it('jwt: v1 takes alg none, v2 refuses it', () => {
    const none = `${base64UrlEncode('{"alg":"none"}')}.${base64UrlEncode('{"sub":"sam","role":"admin"}')}.`;
    expect(send('jwt', `GET /v1/admin HTTP/1.1\nAuthorization: Bearer ${SAM_TOKEN}`).status).toBe(403);
    expect(send('jwt', `GET /v1/admin HTTP/1.1\nAuthorization: Bearer ${none}`).status).toBe(200);
    expect(send('jwt', `GET /v2/admin HTTP/1.1\nAuthorization: Bearer ${none}`).status).toBe(401);
    expect(send('jwt', `GET /v2/me HTTP/1.1\nAuthorization: Bearer ${SAM_TOKEN}`).status).toBe(200);
  });
});
