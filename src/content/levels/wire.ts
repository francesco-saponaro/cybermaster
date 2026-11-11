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
    instruction: 'Sites ask search engines to skip some pages by listing them in a public file called robots.txt. The Request panel holds the raw [[http-anatomy|HTTP request]] your browser sends, and you start there by pressing Send.',
    server: 'shop',
    host: 'shop.lantern.example',
    mode: 'request',
    request: SHOP_REQUEST,
    checks: [
      {
        id: 'sent',
        label: 'Send the request as it is',
        do: 'In the Request panel, press the red `Send` button. The page the server sends back appears in the Browser panel.',
        learned: 'Every page you open is one request like this: a method, a path and a few headers.',
      },
      {
        id: 'robots',
        label: 'Read /robots.txt',
        do: 'In the request box, change the first line from `GET / HTTP/1.1` to `GET /robots.txt HTTP/1.1`, then press `Send`.',
        learned: 'robots.txt is public: listing a page there to hide it tells everyone where it is.',
      },
      {
        id: 'hidden',
        label: 'Open the page robots.txt names',
        do: 'robots.txt lists `/staff-notes`. Type `/staff-notes` in the Browser address bar and press Enter, or put `GET /staff-notes HTTP/1.1` on the first line of the request and press `Send`.',
        learned: 'A page that is only unlinked is not protected, because anyone who asks for it gets it: that is [[forced-browsing|forced browsing]].',
      },
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
    instruction: 'A [[cookies|cookie]] is a small value your browser sends with every request, and this shop keeps your role in one. Start in the Request panel by pressing Send to open your account.',
    server: 'role-cookie',
    host: 'shop.lantern.example',
    mode: 'request',
    request: ACCOUNT_REQUEST,
    checks: [
      {
        id: 'sent',
        label: 'Open your account',
        do: 'In the Request panel, press `Send`. The Browser shows your account: you are Sam, an ordinary customer.',
        learned: 'The browser sent the Cookie line, and the server used it to decide who you are.',
      },
      {
        id: 'admin',
        label: 'Reach the admin panel',
        do: 'In the request box, find the line that starts `Cookie:` and change `role=user` to `role=admin`. Press `Send`.',
        learned: 'Anyone can edit their own cookies, so a server must never let a cookie decide who is an admin.',
      },
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
    instruction: "After you sign in, a [[sessions|session id]] in a cookie is all the server checks, so whoever holds it is you. The Proxy history in the Request panel caught Mara's request on the café's open Wi-Fi; start by pressing Send to open your own account.",
    server: 'replay',
    host: 'shop.lantern.example',
    mode: 'request',
    request: SAM_REPLAY,
    captured: [
      { label: 'GET /account  you, 09:58', raw: SAM_REPLAY },
      { label: 'GET /account  café Wi-Fi, 10:02', raw: MARA_CAPTURE },
    ],
    checks: [
      {
        id: 'mine',
        label: 'Open your own account',
        do: 'In the Request panel, press `Send`. The Browser shows you signed in as sam.',
        learned: 'Your `sid` cookie is your session: the server looks it up on every request.',
      },
      {
        id: 'mara',
        label: "Get into Mara's account",
        do: "In Proxy history, press `Load` on the line marked `café Wi-Fi, 10:02`. That puts Mara's request, with her `sid` cookie, in the request box. Press `Send`.",
        learned: 'On plain HTTP anyone on the same Wi-Fi can copy a session id and use it, which is [[session-hijacking|session hijacking]] and why sessions need HTTPS.',
      },
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
    instruction: 'Here the server\'s reply stops in the Proxy panel so you can change it before the browser sees it. You will watch a script read the session cookie, then add the [[cookie-flags|HttpOnly flag]] that hides it; start by pressing Send.',
    server: 'httponly',
    host: 'shop.lantern.example',
    mode: 'response',
    request: LOGIN_REQUEST,
    console: true,
    checks: [
      {
        id: 'read',
        label: 'Watch a script read the session',
        do: 'Press `Send` in the Request panel, then press `Forward` at the top right of the Proxy panel. In the Console under the browser, type `document.cookie` and press Enter: the session cookie shows up.',
        learned: 'Any script on the page can read this cookie, including one an attacker manages to slip in.',
      },
      {
        id: 'flag',
        label: 'Flag the session cookie HttpOnly',
        do: 'Press `Send` again. In the Proxy panel, add `; HttpOnly` to the end of the line that starts `Set-Cookie: session=`, then press `Forward`.',
        hint: 'Set-Cookie: session=e5d1f0a7c3b9; Path=/; HttpOnly',
        learned: 'HttpOnly tells the browser to keep this cookie away from JavaScript.',
      },
      {
        id: 'hidden',
        label: 'Check scripts can no longer see it',
        do: 'Type `document.cookie` in the Console again and press Enter. The session is no longer in the output.',
        learned: 'The cookie is still in the browser, but a script that gets onto the page can no longer steal it.',
      },
      {
        id: 'still',
        label: 'You are still signed in',
        do: 'Nothing to type: after Forward the browser opened your account with the cookie. If this step is still open, press `Send` and `Forward` again, keeping `; HttpOnly` on the Set-Cookie line.',
        learned: 'The browser still sends an HttpOnly cookie with every request, so the flag costs the user nothing.',
      },
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
    instruction: 'A [[jwt-basics|JWT]] is a signed token that says who you are, and this API reads your role from it; its three parts are decoded under the request. You will try to make yourself admin on the old v1 API, then check the new v2 refuses the same trick.',
    server: 'jwt',
    host: 'api.lantern.example',
    mode: 'request',
    request: JWT_REQUEST,
    jwt: true,
    checks: [
      {
        id: 'tampered',
        label: 'Edit the role and see it rejected',
        do: 'On the first line of the request, change `/v1/me` to `/v1/admin`. In the Payload box under the request, change `"user"` to `"admin"`. Press `Send`.',
        learned: 'The signature covers the payload, so changing your role alone gets 401 Invalid signature.',
      },
      {
        id: 'v1',
        label: 'Get past v1 with an unsigned token',
        do: 'In the Header box, replace everything with `{"alg":"none","typ":"JWT"}`. Clear the Signature box completely. Press `Send`.',
        learned: 'v1 let the token choose its own algorithm, and "none" means nothing is checked at all.',
      },
      {
        id: 'v2',
        label: 'Check v2 refuses the same token',
        do: 'On the first line of the request, change `/v1/admin` to `/v2/admin` and press `Send`.',
        learned: 'v2 only accepts the algorithm the server chose (HS256), so an unsigned token gets nowhere.',
      },
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
    instruction: "A page on evil.example can read Sam's bank details, because this API's [[cors|CORS]] header lets any website read its replies. Press Send, then edit the held response in the Proxy panel and press Forward, one step at a time.",
    server: 'cors',
    host: 'api.bank.example',
    mode: 'response',
    request: CORS_REQUEST,
    checks: [
      {
        id: 'evil',
        label: 'Stop evil.example reading the account',
        do: 'Press `Send`, then `Forward`, and look at the Browser: evil.example reads everything. Press `Send` again. In the Proxy panel, on the `Access-Control-Allow-Origin` line, replace `{origin}` with `https://bank.example`. Press `Forward`.',
        learned: 'Echoing back any Origin is the same as trusting every website; naming the one you trust closes the hole.',
      },
      {
        id: 'bank',
        label: 'Keep bank.example working',
        do: 'If this step is open, you removed the line instead of changing it. Press `Send` and make sure the response has `Access-Control-Allow-Origin: https://bank.example`, then `Forward`.',
        learned: "Sam's own bank page still works, because it is the one origin the API names.",
      },
      {
        id: 'cookie',
        label: 'Lock down the session cookie',
        do: 'Press `Send` (the proxy keeps your earlier edits). On the `Set-Cookie:` line, add `; HttpOnly; Secure; SameSite=Lax` to the end, then press `Forward`.',
        learned: 'HttpOnly hides the cookie from scripts, Secure keeps it off plain HTTP, and SameSite stops other sites sending it.',
      },
      {
        id: 'hsts',
        label: 'Tell browsers to use HTTPS only',
        do: 'Press `Send`. Add a new line at the end of the response: `Strict-Transport-Security: max-age=31536000`. Press `Forward`.',
        hint: CORS_FIXED,
        learned: 'This header makes the browser refuse plain HTTP for this site for a year, so the cookie never travels unencrypted.',
      },
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
