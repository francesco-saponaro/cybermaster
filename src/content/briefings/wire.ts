import type { Briefing } from '../types';

const M = 'Ines';

export const WIRE_BRIEFINGS: Briefing[] = [
  {
    missionId: 'wire-headers',
    mentor: M,
    beats: [
      {
        id: 'cookie-no-httponly',
        concepts: ['cookie-flags', 'http-anatomy'],
        say: 'This is the Set-Cookie line from a login response. It has no HttpOnly flag, so a script on the page can read the session id. Tap that line.',
        material: {
          kind: 'lines',
          title: 'POST /login (response)',
          lines: ['HTTP/1.1 302 Found', 'Location: /account', 'Set-Cookie: PHPSESSID=8c2f1b9e; Path=/'],
        },
        action: { kind: 'tap-line', line: 2 },
        then: 'Right. No HttpOnly, no Secure, no SameSite. A session cookie needs all three. Catch packets like this one.',
        codex: 'cookie-flags',
      },
      {
        id: 'cookie-good',
        concepts: ['cookie-flags'],
        say: 'Now a good one, so you know what to let pass. Tap the SameSite word: that flag, with HttpOnly and Secure, is what a safe session cookie looks like.',
        material: {
          kind: 'lines',
          title: 'GET / (response)',
          lines: ['HTTP/1.1 200 OK', 'Set-Cookie: sid=3f9a; Path=/; HttpOnly; Secure; SameSite=Lax'],
        },
        action: { kind: 'tap-token', line: 1, token: 'SameSite' },
        then: 'Exactly. When you see all three flags, that packet is clean. Let it pass.',
      },
      {
        id: 'version-string',
        concepts: ['version-disclosure'],
        say: 'Servers love to announce themselves. This Server header gives the exact Apache version, which an attacker just looks up for known holes. Tap it.',
        material: {
          kind: 'lines',
          title: 'GET /account (response)',
          lines: ['HTTP/1.1 200 OK', 'Server: Apache/2.4.49 (Unix)', 'Content-Type: text/html'],
        },
        action: { kind: 'tap-line', line: 1 },
        then: 'That is version disclosure. X-Powered-By does the same for the language. Catch both.',
        codex: 'security-headers',
      },
      {
        id: 'role-in-cookie',
        concepts: ['cookie-client-data'],
        say: 'Last idea. This cookie stores role=customer. The browser owns the cookie, so the client can change it to role=admin. Authorization must live on the server. Tap the Set-Cookie line.',
        material: {
          kind: 'lines',
          title: 'GET /account (response)',
          lines: ['HTTP/1.1 200 OK', 'Set-Cookie: role=customer; Path=/'],
        },
        action: { kind: 'tap-line', line: 1 },
        then: 'Good. Anything the client could rewrite to its own advantage is a catch. You are ready; go intercept the shift.',
      },
    ],
  },
  {
    missionId: 'wire-tokens',
    mentor: M,
    beats: [
      {
        id: 'token-in-url',
        concepts: ['credentials-in-url'],
        say: 'A token in the query string ends up in history, proxy logs and server logs. Tap the request line where the token rides in the URL.',
        material: {
          kind: 'lines',
          title: 'GET /api/v2/profile',
          lines: ['GET /api/v2/profile?token=eyJ0.sKx HTTP/1.1', 'Host: api.kestrelpay.app', 'Accept: application/json'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'That is the catch. Credentials belong in a header or a cookie, over TLS, never in the URL.',
        codex: 'tokens-in-urls',
      },
      {
        id: 'referer-leak',
        concepts: ['referer-leak'],
        say: 'When a page loads an image on another host, the browser sends the current URL in the Referer header. If a reset token is in that URL, it leaks. Tap the Referer line.',
        material: {
          kind: 'lines',
          title: 'GET /img/avatar.png',
          lines: ['GET /img/avatar.png HTTP/1.1', 'Host: cdn.kestrelpay.app', 'Referer: https://app.kestrelpay.app/reset?rt=5f9c1e2'],
        },
        action: { kind: 'tap-line', line: 2 },
        then: 'Caught. The reset token just went to the CDN. Same rule: secrets never travel in a URL.',
      },
      {
        id: 'jwt-payload',
        concepts: ['jwt-payload-readable'],
        say: 'A JWT is three base64 parts, and the middle one, the payload, is readable by anyone. This payload literally contains the password. Tap the Authorization line.',
        material: {
          kind: 'lines',
          title: 'POST /api/v2/login',
          lines: ['POST /api/v2/login HTTP/1.1', 'Authorization: Bearer eyJ.eyJwZCI6IlN1bW1lcjIwMjYhIn0.9bQ'],
        },
        action: { kind: 'tap-line', line: 1 },
        then: 'Right. Decoded, that payload reads "pwd":"Summer2026!". Never put a secret in a JWT; the signature proves it, it does not hide it.',
        codex: 'jwt-basics',
      },
      {
        id: 'auth-in-log',
        concepts: ['auth-header-logged'],
        say: 'Now the logs. Debug logging here prints the whole Authorization header, so anyone who reads the log holds the session. Tap the log line.',
        material: {
          kind: 'lines',
          title: 'access log',
          lines: ['2026-11-03T09:14:23Z debug headers={"authorization":"Bearer eyJ.eyJzdWIiOiI0MTkyIn0.sKx"}'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'That is a catch too. Headers with credentials must never be logged. Now go find them all in the stream.',
      },
    ],
  },
  {
    missionId: 'wire-cookies',
    mentor: M,
    beats: [
      {
        id: 'three-flags',
        concepts: ['cookie-flags'],
        say: 'Cookie Jar is a race: cookies slide in, you flick each to fine or fix. First the rule. Tap HttpOnly: a session cookie needs it, plus Secure and SameSite.',
        material: {
          kind: 'lines',
          title: 'A healthy session cookie',
          lines: ['Set-Cookie: sid=3f9a; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600'],
        },
        action: { kind: 'tap-token', line: 0, token: 'HttpOnly' },
        then: 'That one is fine: all three flags, short life. Flick cookies like it to fine.',
        codex: 'cookie-flags',
      },
      {
        id: 'missing-flag',
        concepts: ['cookie-flags'],
        say: 'This session cookie is missing HttpOnly. Tap where it should be, right after SameSite, and remember: a session cookie without HttpOnly goes to fix.',
        material: {
          kind: 'lines',
          title: 'A weak session cookie',
          lines: ['Set-Cookie: session=91bd; Path=/; Secure; SameSite=Lax'],
        },
        action: { kind: 'tap-token', line: 0, token: 'SameSite' },
        then: 'Right, no HttpOnly after it. That cookie is readable by any injected script. Flick it to fix, reason: missing HttpOnly.',
      },
      {
        id: 'editable-value',
        concepts: ['cookie-client-data'],
        say: 'The flags can be perfect and the cookie still be a bug. This value spells out role=admin, which the client can rewrite. Tap the Set-Cookie line.',
        material: {
          kind: 'lines',
          title: 'A remember-me cookie',
          lines: ['Set-Cookie: auth=user=4192;role=admin; Path=/; HttpOnly; Secure; SameSite=Strict'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Fix, and the reason is the value, not the flags. The cookie should hold an opaque id; the role is looked up server side.',
      },
      {
        id: 'preference-ok',
        concepts: ['cookie-preference', 'cookie-domain'],
        say: 'Not every cookie is a session. A language preference holds nothing secret, so scripts may read it and a year is fine. Tap the lang cookie.',
        material: {
          kind: 'cards',
          cards: [
            { id: 'lang', title: 'preference', lines: ['Set-Cookie: lang=en; Path=/; SameSite=Lax; Max-Age=31536000'] },
            { id: 'cms', title: 'CMS session', lines: ['Set-Cookie: cms=7c1e; Domain=.site.io; HttpOnly; Secure'] },
          ],
        },
        action: { kind: 'tap-card', card: 'lang' },
        then: 'Fine. The CMS one beside it is not: Domain=.site.io sends it to every subdomain. Watch for that. Now sort the jar.',
      },
    ],
  },
  {
    missionId: 'wire-login-lab',
    mentor: M,
    beats: [
      {
        id: 'alg-none',
        concepts: ['jwt-alg-none'],
        say: 'Login Lab is live: messages play out and you freeze the moment something breaks. Here the attacker sets the token header to "alg":"none" and the server accepts it. The break is when the server replies 200. Tap that message.',
        material: {
          kind: 'flow',
          messages: [
            { from: 'attacker', to: 'server', text: 'GET /account  Bearer forged.token. (alg:none, no signature)' },
            { from: 'server', to: 'attacker', text: '200 OK  "Welcome back": accepted a token with no signature' },
          ],
        },
        action: { kind: 'tap-message', index: 1 },
        then: 'That is the moment. The fix is to pin the algorithm on the server and reject "none".',
        codex: 'jwt-basics',
      },
      {
        id: 'enumeration',
        concepts: ['login-hardening'],
        say: 'Next, a login that tells the attacker too much. "Wrong password" confirms the username exists. The break is that reply. Tap it.',
        material: {
          kind: 'flow',
          messages: [
            { from: 'attacker', to: 'server', text: 'POST /login  user=admin pass=guess1' },
            { from: 'server', to: 'attacker', text: '401  "wrong password": so the username is valid' },
          ],
        },
        action: { kind: 'tap-message', index: 1 },
        then: 'Right. One generic "invalid credentials", plus a rate limit and lockout, closes both enumeration and guessing.',
        codex: 'sessions',
      },
      {
        id: 'reset-token',
        concepts: ['reset-token-random'],
        say: 'Last one. The reset link is just the user id in base64, so anyone can mint one for anyone. The break is when the server hands out that guessable link. Tap it.',
        material: {
          kind: 'flow',
          messages: [
            { from: 'attacker', to: 'server', text: 'POST /forgot  email=victim@site.test' },
            { from: 'server', to: 'attacker', text: 'Reset link: /reset?rt=base64(userId=5012)' },
          ],
        },
        action: { kind: 'tap-message', index: 1 },
        then: 'Caught. A reset token must be random, single use and short lived. Now run the live session yourself.',
      },
    ],
  },
  {
    missionId: 'wire-session-lab',
    mentor: M,
    beats: [
      {
        id: 'fixation',
        concepts: ['session-fixation', 'tls-everywhere'],
        say: 'Sessions now. If the id is the same before and after login, an attacker who planted it owns the logged-in session. Tap the line where the id does not change.',
        material: {
          kind: 'lines',
          title: 'What the app does',
          lines: ['Before login: sid=1044', 'After login: sid=1044 (unchanged)', 'Login form posts to http://'],
        },
        action: { kind: 'tap-line', line: 1 },
        then: 'That is session fixation. The fix is to issue a brand-new id at login. The http:// line is a second flaw: TLS everywhere.',
        codex: 'sessions',
      },
      {
        id: 'logout',
        concepts: ['logout-server-side'],
        say: 'Logout should end the session on the server, not just drop the cookie in the browser. Tap the broken logout.',
        material: {
          kind: 'lines',
          title: 'What the app does',
          lines: ['Logout: clears the cookie in the browser only', 'Server: session still valid'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Right. A copied cookie keeps working until the server invalidates it. Kill it server side.',
      },
      {
        id: 'ids-and-hashes',
        concepts: ['session-id-rules', 'password-hashing'],
        say: 'Two more. Sequential ids can be guessed, and MD5 passwords crack by the billion per second. Tap the sequential-id line first.',
        material: {
          kind: 'lines',
          title: 'What the app does',
          lines: ['Session ids: 1041, 1042, 1043 ...', 'Passwords: stored as unsalted MD5', 'Sessions never time out'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Good. Use long random ids from a CSPRNG, add idle and absolute timeouts, and store passwords with bcrypt, scrypt or Argon2. Now match every flaw to its fix.',
        codex: 'crypto-failures',
      },
    ],
  },
  {
    missionId: 'wire-boss',
    mentor: M,
    beats: [
      {
        id: 'review-leaks',
        concepts: ['credentials-in-url', 'session-fixation'],
        say: 'The Front Door puts it all together: intercept the login, then fix the live flow. Quick review. The username is in the URL here. Tap that line.',
        material: {
          kind: 'lines',
          title: 'POST /login',
          lines: ['POST /login?next=/account&user=lena.ortiz HTTP/1.1', 'Host: portal.harborline.dev'],
        },
        action: { kind: 'tap-line', line: 0 },
        then: 'Good. Credentials in the URL, as before. Catch it in the stream.',
      },
      {
        id: 'password-hint',
        concepts: ['password-hint'],
        say: 'One new thing to watch. The welcome page prints a password hint that describes the password. That is a leak on the page itself. Tap the line.',
        material: {
          kind: 'lines',
          title: 'GET /account (response body)',
          lines: ['HTTP/1.1 200 OK', '<p>Welcome back, Lena. Your password hint: first pet + 2026</p>'],
        },
        action: { kind: 'tap-line', line: 1 },
        then: 'Caught. A hint that points at the password helps the attacker, not the user. Remove it and use a real reset flow.',
      },
      {
        id: 'review-fixation',
        concepts: ['session-fixation'],
        say: 'In the fix stage you will freeze the flow where the id fails to rotate at login. Tap the reply that reuses the old id.',
        material: {
          kind: 'flow',
          messages: [
            { from: 'browser', to: 'server', text: 'POST /login  (cookie sid=1044 already set)' },
            { from: 'server', to: 'browser', text: '200 OK  Set-Cookie: sid=1044: same id' },
          ],
        },
        action: { kind: 'tap-message', index: 1 },
        then: 'That is the one. Freeze there, then rotate the id. You know every idea in this fight. Go.',
      },
    ],
  },
];
