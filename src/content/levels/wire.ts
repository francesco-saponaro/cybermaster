import type { WireLevel, WireState } from '../types';
import { SAM_TOKEN } from '../../sim/wire';
import { corsReport } from '../../sim/wire';
import { header } from '../../sim/http';

const sent = (s: WireState, path: string, status = 200) => s.exchanges.some((e) => e.req.path === path && e.res.status === status);

export const SHOP_REQUEST = `GET / HTTP/1.1
Host: shop.lantern.example
User-Agent: Mozilla/5.0
Accept: text/html`;

const withPath = (raw: string, path: string) => raw.replace(/^(\w+) \S+/, `$1 ${path}`);

const ACCOUNT_REQUEST = `GET /account HTTP/1.1
Host: shop.lantern.example
User-Agent: Mozilla/5.0
Cookie: session=b81c4e2a90f7; role=user`;

const SAM_REPLAY = `GET /account HTTP/1.1
Host: shop.lantern.example
User-Agent: Mozilla/5.0
Cookie: sid=sid-4f19a2c7e0`;

const MARA_CAPTURE = `GET /account HTTP/1.1
Host: shop.lantern.example
User-Agent: Mozilla/5.0 (iPhone)
Cookie: sid=sid-9be03d71c4`;

const LOGIN_REQUEST = `POST /login HTTP/1.1
Host: shop.lantern.example
Content-Type: application/x-www-form-urlencoded

name=sam&pass=brass%26oak77`;

const LOGIN_RESPONSE_FLAGGED = `HTTP/1.1 200 OK
Server: nginx
Content-Type: text/html; charset=utf-8
Set-Cookie: session=e5d1f0a7c3b9; Path=/; HttpOnly`;

export const JWT_REQUEST = `GET /v1/me HTTP/1.1
Host: api.lantern.example
Authorization: Bearer ${SAM_TOKEN}`;

const CORS_REQUEST = `GET /api/account HTTP/1.1
Host: api.bank.example
Origin: https://bank.example
Cookie: sid=c09e4471ab2f`;

const CORS_ORIGIN_ONLY = `HTTP/1.1 200 OK
Server: nginx
Content-Type: application/json
Access-Control-Allow-Origin: https://bank.example
Access-Control-Allow-Credentials: true
Set-Cookie: sid=c09e4471ab2f; Path=/`;

const CORS_FIXED = `HTTP/1.1 200 OK
Server: nginx
Content-Type: application/json
Access-Control-Allow-Origin: https://bank.example
Access-Control-Allow-Credentials: true
Set-Cookie: sid=c09e4471ab2f; Path=/; HttpOnly; Secure; SameSite=Lax
Strict-Transport-Security: max-age=31536000; includeSubDomains`;

function sessionFlagged(s: WireState): boolean {
  return s.forwarded.some((r) => r.headers.some(([k, v]) => k.toLowerCase() === 'set-cookie' && /^session=/.test(v) && /;\s*httponly/i.test(v)));
}

export const WIRE_LEVELS: WireLevel[] = [
  {
    id: 'wire-robots',
    zone: 'wire',
    kind: 'wire',
    title: 'A page nobody linked',
    goal: 'Find the page the shop tried to hide, and open it.',
    instruction: 'On the right is the raw [[http-anatomy|HTTP request]] your browser sends, and you can change it. Change the path on the first line from / to /robots.txt, then press Send.',
    server: 'shop',
    host: 'shop.lantern.example',
    mode: 'request',
    request: SHOP_REQUEST,
    checks: [
      { id: 'sent', label: 'Send a request' },
      { id: 'robots', label: 'Read /robots.txt' },
      { id: 'hidden', label: 'Open the page it names' },
    ],
    evaluate: (s) => ({ sent: s.exchanges.length > 0, robots: sent(s, '/robots.txt'), hidden: sent(s, '/staff-notes') }),
    showMe: [
      { say: 'Press Send: the request goes to the server and the page on the left is its answer.', act: { send: true } },
      { say: 'Replace / with /robots.txt on the first line and Send.', act: { path: '/robots.txt', send: true } },
      { say: 'robots.txt asks search engines to skip /staff-notes. Request that path.', act: { path: '/staff-notes', send: true } },
    ],
    realName: 'Forced browsing',
    didWhat: 'You read robots.txt and requested a page that was hidden only by not being linked.',
    codex: ['http-anatomy', 'forced-browsing'],
    xp: 60,
    par: 60,
  },
  {
    id: 'wire-cookie-role',
    zone: 'wire',
    kind: 'wire',
    title: 'Who the cookie says you are',
    goal: 'Reach the shop\'s admin panel.',
    instruction: 'Your browser sends a [[cookies|cookie]] that says role=user, and the server believes it. Change it to role=admin in the Cookie header and Send.',
    server: 'role-cookie',
    host: 'shop.lantern.example',
    mode: 'request',
    request: ACCOUNT_REQUEST,
    checks: [
      { id: 'sent', label: 'Open your account' },
      { id: 'admin', label: 'Reach the admin panel' },
    ],
    evaluate: (s) => ({ sent: sent(s, '/account'), admin: s.exchanges.some((e) => e.res.view?.title === 'Admin') }),
    showMe: [
      { say: 'Send it as it is first: you are Sam, a customer.', act: { send: true } },
      { say: 'Now change role=user to role=admin on the Cookie line and Send.', act: { request: ACCOUNT_REQUEST.replace('role=user', 'role=admin'), send: true } },
    ],
    realName: 'Privilege escalation through a client-side cookie',
    didWhat: 'You changed a cookie and the server gave you admin, because it trusted a value the browser controls.',
    codex: ['cookies', 'authn-vs-authz'],
    xp: 70,
    par: 60,
  },
  {
    id: 'wire-replay',
    zone: 'wire',
    kind: 'wire',
    title: 'Borrowed session',
    goal: "Get into Mara's account without her password.",
    instruction: "The proxy history caught Mara's request on the café's plain-HTTP Wi-Fi. Put her [[session-hijacking|session id]] in your Cookie header and open /account.",
    server: 'replay',
    host: 'shop.lantern.example',
    mode: 'request',
    request: SAM_REPLAY,
    captured: [
      { label: 'GET /account  you, 09:58', raw: SAM_REPLAY },
      { label: 'GET /account  café Wi-Fi, 10:02', raw: MARA_CAPTURE },
    ],
    checks: [
      { id: 'mine', label: 'Open your own account' },
      { id: 'mara', label: "Get into Mara's account" },
    ],
    evaluate: (s) => ({
      mine: s.exchanges.some((e) => e.res.body.includes('Signed in as sam')),
      mara: s.exchanges.some((e) => e.res.body.includes('Signed in as mara')),
    }),
    showMe: [
      { say: 'Send your own request first.', act: { send: true } },
      { say: "Open the café capture in the history and copy Mara's sid value into your Cookie line, then Send.", act: { request: SAM_REPLAY.replace('sid-4f19a2c7e0', 'sid-9be03d71c4'), send: true } },
    ],
    realName: 'Session hijacking',
    didWhat: "You replayed a session id caught on an open network and the server treated you as Mara.",
    codex: ['sessions', 'session-hijacking'],
    xp: 80,
    par: 75,
  },
  {
    id: 'wire-httponly',
    zone: 'wire',
    kind: 'wire',
    title: "A cookie scripts can't read",
    goal: 'Stay signed in, with a session cookie that no script on the page can read.',
    instruction: 'Send the login, Forward the response, and run document.cookie in the console: any script, an attacker\'s included, can read the session. Send it again, add ; HttpOnly to the Set-Cookie line before you Forward, and check once more.',
    server: 'httponly',
    host: 'shop.lantern.example',
    mode: 'response',
    request: LOGIN_REQUEST,
    console: true,
    checks: [
      { id: 'read', label: 'See the session in document.cookie' },
      { id: 'flag', label: 'Forward a session cookie flagged HttpOnly' },
      { id: 'hidden', label: 'Scripts no longer see the session' },
      { id: 'still', label: 'You are still signed in' },
    ],
    evaluate: (s) => {
      const flagged = sessionFlagged(s);
      return {
        read: s.console.some((c) => /document\.cookie/.test(c.input) && c.output.includes('session=')),
        flag: flagged,
        hidden: flagged && s.console.some((c) => /document\.cookie/.test(c.input) && !c.output.includes('session=') && s.jar.some((k) => k.name === 'session' && k.httpOnly)),
        still: flagged && s.exchanges.some((e) => e.req.path === '/account' && e.res.status === 200 && s.jar.some((k) => k.name === 'session' && k.httpOnly)),
      };
    },
    showMe: [
      { say: 'Send the login, then Forward the response as it is.', act: { send: true, forward: true } },
      { say: 'Type document.cookie in the console and press Enter.', act: { console: 'document.cookie' } },
      { say: 'Send again, add ; HttpOnly to the end of the Set-Cookie line, and Forward.', act: { send: true, response: LOGIN_RESPONSE_FLAGGED, forward: true } },
      { say: 'Run document.cookie again: the session is gone from it, but the browser still sends it.', act: { console: 'document.cookie' } },
    ],
    realName: 'The HttpOnly cookie flag',
    didWhat: 'You flagged the session cookie HttpOnly, so the browser still sends it but no script can steal it.',
    codex: ['cookie-flags'],
    xp: 90,
    par: 120,
  },
  {
    id: 'wire-jwt',
    zone: 'wire',
    kind: 'wire',
    title: 'The token that signs itself',
    goal: 'Become admin on the v1 API, and confirm v2 refuses the same trick.',
    instruction: 'This API reads your role from a [[jwt-basics|JWT]], decoded below the request. Make yourself admin on /v1/admin, then see whether /v2/admin falls for the same token.',
    server: 'jwt',
    host: 'api.lantern.example',
    mode: 'request',
    request: JWT_REQUEST,
    jwt: true,
    checks: [
      { id: 'tampered', label: 'An edited token is rejected (bad signature)' },
      { id: 'v1', label: 'v1 accepts alg "none": you are admin' },
      { id: 'v2', label: 'v2 refuses alg "none"' },
    ],
    evaluate: (s) => ({
      tampered: s.exchanges.some((e) => e.res.status === 401 && e.res.body.includes('Invalid signature')),
      v1: sent(s, '/v1/admin'),
      v2: s.exchanges.some((e) => e.req.path === '/v2/admin' && e.res.status === 401 && /none\\?" refused/.test(e.res.body)),
    }),
    showMe: [
      { say: 'Change "user" to "admin" in the payload and send it to /v1/admin: the signature no longer matches.', act: { path: '/v1/admin', jwtPayload: '{"sub":"sam","role":"admin","iat":1793952000}', send: true } },
      { say: 'Set the header to {"alg":"none","typ":"JWT"}, empty the signature, and Send again.', act: { jwtHeader: '{"alg":"none","typ":"JWT"}', jwtSignature: '', send: true } },
      { say: 'Send the same token to /v2/admin.', act: { path: '/v2/admin', send: true } },
    ],
    realName: 'JWT "alg: none" attack',
    didWhat: 'You forged an unsigned token that v1 accepted because it let the token choose its own algorithm; v2 pins HS256.',
    codex: ['jwt-basics', 'tokens-in-urls', 'crypto-failures'],
    evidence: ['ev-jwt-none'],
    xp: 110,
    par: 150,
  },
  {
    id: 'wire-cors',
    zone: 'wire',
    kind: 'wire',
    boss: true,
    title: 'The API that answers anyone',
    goal: 'Only bank.example may read the account, the session cookie is locked down, and HTTPS is enforced.',
    instruction: "A page on evil.example can read Sam's bank details, because this API copies any [[cors|Origin]] back. Edit the response headers and Forward until every check is green.",
    server: 'cors',
    host: 'api.bank.example',
    mode: 'response',
    request: CORS_REQUEST,
    checks: [
      { id: 'evil', label: 'evil.example cannot read the account' },
      { id: 'bank', label: 'bank.example still can' },
      { id: 'cookie', label: 'Session cookie: HttpOnly, Secure, SameSite' },
      { id: 'hsts', label: 'Browsers are told to use HTTPS only' },
    ],
    evaluate: (s) => {
      const last = s.forwarded[s.forwarded.length - 1];
      if (!last) return { evil: false, bank: false, cookie: false, hsts: false };
      const r = corsReport(last.headers);
      return {
        evil: !r.evil.allowed,
        bank: r.bank.allowed,
        cookie: !!r.cookie && r.cookie.httpOnly && r.cookie.secure && (r.cookie.sameSite === 'Lax' || r.cookie.sameSite === 'Strict'),
        hsts: r.hsts && !!header(last.headers, 'strict-transport-security'),
      };
    },
    showMe: [
      { say: 'Send, then Forward the response unchanged and look at what evil.example gets.', act: { send: true, forward: true } },
      { say: 'Replace {origin} with https://bank.example on the Allow-Origin line.', act: { send: true, response: CORS_ORIGIN_ONLY } },
      { say: 'Add ; HttpOnly; Secure; SameSite=Lax to the cookie and a Strict-Transport-Security: max-age=31536000 line, then Forward.', act: { response: CORS_FIXED, forward: true } },
    ],
    realName: 'CORS misconfiguration and response hardening',
    didWhat: 'You stopped the API reflecting any Origin, flagged the session cookie and turned on HSTS.',
    codex: ['cors', 'security-headers', 'csrf'],
    xp: 160,
    par: 180,
  },
];

export { withPath };
