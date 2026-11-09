// The requests in Packet Runner. Each one is three short lines a player reads
// in a second: the request line, the one header that decides it, and what the
// gate knows about it. The rules are the ones The Wire teaches.

export interface PacketTemplate {
  id: string;
  req: string;
  header: string;
  note: string;
  bad: boolean;
  /** One line on why, shown after a wrong call. */
  why: string;
}

const OURS = 'shop.lantern.example';

export const PACKETS: PacketTemplate[] = [
  // ---- Fine to let through ----------------------------------------------
  { id: 'ok-products', req: 'GET /products', header: 'No cookie', note: 'Public page', bad: false, why: 'The catalogue is public. Anyone may read it.' },
  { id: 'ok-robots', req: 'GET /robots.txt', header: 'No cookie', note: 'Public file', bad: false, why: 'robots.txt is public by design.' },
  { id: 'ok-cart', req: 'GET /cart', header: 'Cookie: sid=7d1e…', note: "A customer's own session", bad: false, why: 'A valid session asking for its own cart is normal.' },
  { id: 'ok-admin-staff', req: 'GET /admin', header: 'Cookie: sid=a91f…', note: 'Server: session is staff', bad: false, why: 'The server looked up the session and it is staff. That is how a role should be checked.' },
  { id: 'ok-notes-staff', req: 'GET /staff-notes', header: 'Cookie: sid=c40b…', note: 'Server: session is staff', bad: false, why: 'Staff with a real session may read the staff notes.' },
  { id: 'ok-orders-token', req: 'GET /api/orders', header: 'Token alg: HS256', note: 'Signature checks out', bad: false, why: 'A signed token with a valid signature is what the API expects.' },
  { id: 'ok-me-exp', req: 'GET /api/me', header: 'Token exp: in 40 min', note: 'Signature checks out', bad: false, why: 'The token is signed and still in date.' },
  { id: 'ok-pay-origin', req: 'POST /api/pay', header: `Origin: ${OURS}`, note: "The shop's own site", bad: false, why: 'A call from our own origin is allowed.' },
  { id: 'ok-preflight', req: 'OPTIONS /api/pay', header: `Origin: ${OURS}`, note: 'Preflight from our shop', bad: false, why: 'Our own shop asking permission first is normal CORS.' },
  { id: 'ok-account', req: 'GET /account', header: 'Cookie: sid=4b7a…', note: 'Same device as the login', bad: false, why: 'The session is used from where it was created.' },
  { id: 'ok-login', req: 'POST /login', header: 'No cookie yet', note: 'Login form', bad: false, why: 'Anyone may try to log in. The login page is meant to be reached without a session.' },
  { id: 'ok-orders-post', req: 'POST /api/orders', header: 'Token alg: HS256', note: 'Signature checks out', bad: false, why: 'A signed, valid token may place an order.' },
  // ---- Stop at the gate -----------------------------------------------------
  { id: 'bad-role-cookie', req: 'GET /admin', header: 'Cookie: role=admin', note: 'No session, only this', bad: true, why: 'A role in a plain cookie is set by the browser. Anyone can edit it.' },
  { id: 'bad-role-edit', req: 'GET /admin', header: 'Cookie: role=admin', note: 'Was role=user a minute ago', bad: true, why: 'The client changed its own role cookie. The server must look the role up, not read it.' },
  { id: 'bad-no-auth', req: 'GET /api/orders', header: 'No token, no cookie', note: 'Private API', bad: true, why: 'No session and no token: the private API must refuse it.' },
  { id: 'bad-notes-anon', req: 'GET /staff-notes', header: 'No cookie', note: 'Found in robots.txt', bad: true, why: 'robots.txt only hides a page from search engines. The page still needs a login.' },
  { id: 'bad-alg-none', req: 'GET /api/admin', header: 'Token alg: none', note: 'No signature', bad: true, why: 'A token with alg none has no signature. Anyone can write one.' },
  { id: 'bad-alg-none-me', req: 'GET /api/me', header: 'Token alg: none', note: 'Claims to be Sam', bad: true, why: 'Unsigned tokens prove nothing about who sent them.' },
  { id: 'bad-sig', req: 'DELETE /api/orders', header: 'Token alg: HS256', note: 'Signature does not match', bad: true, why: 'The signature does not match the shop key: the token was changed after signing.' },
  { id: 'bad-exp', req: 'GET /api/me', header: 'Token exp: yesterday', note: 'Signature checks out', bad: true, why: 'An expired token must be refused, even with a good signature.' },
  { id: 'bad-origin', req: 'POST /api/pay', header: 'Origin: evil.example', note: "Carries the user's cookies", bad: true, why: "Another site's page is calling the payment API with the user's cookies." },
  { id: 'bad-preflight', req: 'OPTIONS /api/pay', header: 'Origin: evil.example', note: 'Asks to send cookies', bad: true, why: 'The preflight comes from a site that is not ours. Refuse it and the browser stops there.' },
  { id: 'bad-replay', req: 'GET /account', header: 'Cookie: sid=4b7a…', note: 'Same sid, other city', bad: true, why: 'That session id was copied: it is in use from two places at once.' },
  { id: 'bad-admin-customer', req: 'GET /admin', header: 'Cookie: sid=e02d…', note: 'Server: session is a customer', bad: true, why: "A customer's session asking for the admin page must be refused." },
];

export const PACKET_BY_ID = Object.fromEntries(PACKETS.map((p) => [p.id, p])) as Record<string, PacketTemplate>;
