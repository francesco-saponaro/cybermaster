// Raw HTTP as text: parse what the player types into a request, print
// responses, read cookies, and decide what a browser would do with them.
// Everything here is pure so the simulated servers and the tests share it.

export interface HttpRequest {
  method: string;
  path: string; // path only, no query
  query: Record<string, string>;
  target: string; // path + query as typed
  headers: [string, string][];
  cookies: Record<string, string>;
  body: string;
}

/** What the mini browser draws for a response. Never HTML: a small set of typed blocks. */
export type Block =
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'kv'; rows: [string, string][] }
  | { t: 'alert'; tone: 'good' | 'bad' | 'info'; text: string }
  | { t: 'pre'; text: string };

export interface PageView {
  title: string;
  blocks: Block[];
}

export interface HttpResponse {
  status: number;
  headers: [string, string][];
  body: string;
  view?: PageView;
}

export const REASONS: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  500: 'Internal Server Error',
};

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

export type ParseResult = { ok: true; req: HttpRequest } | { ok: false; error: string };

/** Read a raw request the way a proxy's repeater would: request line, headers, blank line, body. */
export function parseRequest(raw: string): ParseResult {
  const text = raw.replace(/\r\n/g, '\n').replace(/^\n+/, '');
  const [head = '', ...rest] = text.split(/\n\n/);
  const body = rest.join('\n\n').replace(/\n+$/, '');
  const lines = head.split('\n');
  const first = (lines.shift() ?? '').trim();
  const parts = first.split(/\s+/);
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return { ok: false, error: 'The first line needs a method and a path, like GET / HTTP/1.1.' };
  }
  const method = parts[0].toUpperCase();
  if (!METHODS.includes(method)) {
    return { ok: false, error: `${parts[0]} is not an HTTP method. Try GET or POST.` };
  }
  const target = parts[1];
  if (!target.startsWith('/')) {
    return { ok: false, error: 'The path must start with a slash, like /robots.txt.' };
  }
  const headers: [string, string][] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const i = line.indexOf(':');
    if (i <= 0) return { ok: false, error: `This header line has no colon: "${line.trim().slice(0, 40)}".` };
    headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  const [path = '/', qs = ''] = target.split('?');
  return {
    ok: true,
    req: { method, path: safeDecode(path), query: parseQuery(qs), target, headers, cookies: parseCookieHeader(header(headers, 'cookie') ?? ''), body },
  };
}

export function parseQuery(qs: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of qs.split('&')) {
    if (!pair) continue;
    const [k = '', v = ''] = pair.split('=');
    out[safeDecode(k.replace(/\+/g, ' '))] = safeDecode(v.replace(/\+/g, ' '));
  }
  return out;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function header(headers: [string, string][], name: string): string | undefined {
  const n = name.toLowerCase();
  for (const [k, v] of headers) if (k.toLowerCase() === n) return v;
  return undefined;
}

export function parseCookieHeader(value: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of value.split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function serializeRequest(req: Pick<HttpRequest, 'method' | 'target' | 'headers' | 'body'>): string {
  const lines = [`${req.method} ${req.target} HTTP/1.1`, ...req.headers.map(([k, v]) => `${k}: ${v}`)];
  return lines.join('\n') + '\n\n' + (req.body ?? '');
}

export function statusLine(status: number): string {
  return `HTTP/1.1 ${status} ${REASONS[status] ?? ''}`.trim();
}

export function serializeResponseHead(res: Pick<HttpResponse, 'status' | 'headers'>): string {
  return [statusLine(res.status), ...res.headers.map(([k, v]) => `${k}: ${v}`)].join('\n');
}

/** Parse an edited response head (status line and headers). The body is kept from the original. */
export function parseResponseHead(raw: string): { ok: true; status: number; headers: [string, string][] } | { ok: false; error: string } {
  const lines = raw.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() !== '');
  const first = lines.shift() ?? '';
  const m = /^HTTP\/[\d.]+\s+(\d{3})/.exec(first.trim());
  if (!m) return { ok: false, error: 'The first line must be a status line, like HTTP/1.1 200 OK.' };
  const headers: [string, string][] = [];
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i <= 0) return { ok: false, error: `This header line has no colon: "${line.trim().slice(0, 40)}".` };
    headers.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
  }
  return { ok: true, status: Number(m[1]), headers };
}

// ---- Cookies as a browser stores them --------------------------------------

export interface StoredCookie {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: '' | 'Lax' | 'Strict' | 'None';
}

export function parseSetCookie(value: string): StoredCookie | null {
  const [pair = '', ...attrs] = value.split(';');
  const i = pair.indexOf('=');
  if (i <= 0) return null;
  const c: StoredCookie = { name: pair.slice(0, i).trim(), value: pair.slice(i + 1).trim(), httpOnly: false, secure: false, sameSite: '' };
  for (const a of attrs) {
    const [k = '', v = ''] = a.split('=').map((s) => s.trim());
    const key = k.toLowerCase();
    if (key === 'httponly') c.httpOnly = true;
    else if (key === 'secure') c.secure = true;
    else if (key === 'samesite') {
      const s = v.toLowerCase();
      c.sameSite = s === 'lax' ? 'Lax' : s === 'strict' ? 'Strict' : s === 'none' ? 'None' : '';
    }
  }
  return c;
}

/** Apply every Set-Cookie of a response to a cookie jar. */
export function applySetCookies(jar: StoredCookie[], headers: [string, string][]): StoredCookie[] {
  let next = [...jar];
  for (const [k, v] of headers) {
    if (k.toLowerCase() !== 'set-cookie') continue;
    const c = parseSetCookie(v);
    if (!c) continue;
    next = next.filter((x) => x.name !== c.name);
    next.push(c);
  }
  return next;
}

/** What `document.cookie` returns: every cookie except the HttpOnly ones. */
export function documentCookie(jar: StoredCookie[]): string {
  return jar
    .filter((c) => !c.httpOnly)
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

// ---- CORS, as the browser enforces it --------------------------------------

/**
 * Can a script on `origin` read a credentialed response? The browser lets it
 * only when Allow-Origin names that exact origin (never "*" with credentials)
 * and Allow-Credentials is "true".
 */
export function corsAllowsRead(headers: [string, string][], origin: string, credentials: boolean): { allowed: boolean; reason: string } {
  const acao = header(headers, 'access-control-allow-origin');
  const acac = header(headers, 'access-control-allow-credentials');
  if (!acao) return { allowed: false, reason: 'No Access-Control-Allow-Origin: the browser hides the response from other origins.' };
  if (acao === '*') {
    if (credentials) return { allowed: false, reason: 'Allow-Origin is "*", which browsers refuse for requests with cookies.' };
    return { allowed: true, reason: 'Allow-Origin "*" lets any site read this response.' };
  }
  const listed = acao.split(/\s+/)[0];
  if (listed !== origin) return { allowed: false, reason: `Allow-Origin names ${listed}, not ${origin}.` };
  if (credentials && acac?.toLowerCase() !== 'true') {
    return { allowed: false, reason: 'Allow-Credentials is not "true", so a request with cookies cannot be read.' };
  }
  return { allowed: true, reason: `Allow-Origin names ${origin} and credentials are allowed.` };
}

// ---- base64url, SHA-256, HMAC and JWT ---------------------------------------

export function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64Url(bytes);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(part: string): string | null {
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256, synchronous, so the simulated server can sign tokens inside a render. */
export function sha256(data: Uint8Array): Uint8Array {
  const len = data.length;
  const withOne = len + 1;
  const total = Math.ceil((withOne + 8) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(data);
  buf[len] = 0x80;
  const bits = len * 8;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 4, bits >>> 0);
  view.setUint32(total - 8, Math.floor(bits / 2 ** 32));
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]!);
  return out;
}

export function hmacSha256(key: string, message: string): Uint8Array {
  const enc = new TextEncoder();
  let k: Uint8Array = enc.encode(key);
  if (k.length > 64) k = sha256(k);
  const block = new Uint8Array(64);
  block.set(k);
  const ipad = block.map((b) => b ^ 0x36);
  const opad = block.map((b) => b ^ 0x5c);
  const msg = enc.encode(message);
  const inner = new Uint8Array(64 + msg.length);
  inner.set(ipad);
  inner.set(msg, 64);
  const innerHash = sha256(inner);
  const outer = new Uint8Array(64 + 32);
  outer.set(opad);
  outer.set(innerHash, 64);
  return sha256(outer);
}

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  headerRaw: string;
  payloadRaw: string;
  signature: string;
}

export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  const [h = '', p = '', s = ''] = parts;
  const hr = base64UrlDecode(h);
  const pr = base64UrlDecode(p);
  if (hr === null || pr === null) return null;
  try {
    const header = JSON.parse(hr) as unknown;
    const payload = JSON.parse(pr) as unknown;
    if (!isObject(header) || !isObject(payload)) return null;
    return { header, payload, headerRaw: hr, payloadRaw: pr, signature: s };
  } catch {
    return null;
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function signHs256(headerJson: string, payloadJson: string, secret: string): string {
  const signingInput = `${base64UrlEncode(headerJson)}.${base64UrlEncode(payloadJson)}`;
  return `${signingInput}.${bytesToBase64Url(hmacSha256(secret, signingInput))}`;
}

export type JwtVerdict = { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string };

/**
 * Verify a token. `trustAlgHeader` is the classic bug: the server reads the
 * algorithm from the token itself, so "alg": "none" means "no signature to check".
 */
export function verifyJwt(token: string, secret: string, trustAlgHeader: boolean): JwtVerdict {
  const decoded = decodeJwt(token);
  if (!decoded) return { ok: false, reason: 'Malformed token: it must be three base64url parts of JSON.' };
  const alg = String(decoded.header.alg ?? '');
  if (alg.toLowerCase() === 'none') {
    if (trustAlgHeader) return { ok: true, payload: decoded.payload };
    return { ok: false, reason: 'Algorithm "none" refused: this server only accepts HS256.' };
  }
  if (alg !== 'HS256') return { ok: false, reason: `Algorithm ${alg || '(missing)'} refused: this server only accepts HS256.` };
  const [h = '', p = ''] = token.trim().split('.');
  const expected = bytesToBase64Url(hmacSha256(secret, `${h}.${p}`));
  if (expected !== decoded.signature) return { ok: false, reason: 'Invalid signature: the token was changed after it was signed.' };
  return { ok: true, payload: decoded.payload };
}
