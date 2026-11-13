// The Capture: a packet capture and the parts of Wireshark an analyst uses
// first. Packets are built from conversations (a TCP connection with its
// handshake, data and close; a DNS lookup; background noise), the display
// filter is a small parser for Wireshark's own syntax, and Follow TCP Stream
// and Conversations work from the same packets.

// ---- Packets ------------------------------------------------------------------

export type Proto = 'ARP' | 'DNS' | 'MDNS' | 'SSDP' | 'NTP' | 'TCP' | 'HTTP' | 'TLSv1.3' | 'ICMP';
export type TcpFlag = 'SYN' | 'ACK' | 'FIN' | 'RST' | 'PSH';

export interface HttpPart {
  request?: { method: string; uri: string; host: string };
  response?: { code: number; phrase: string };
  headers: [string, string][];
  body: string;
}

export interface Packet {
  no: number;
  /** Seconds since the capture started. */
  t: number;
  src: string;
  dst: string;
  proto: Proto;
  len: number;
  info: string;
  l4?: 'tcp' | 'udp';
  sport?: number;
  dport?: number;
  tcp?: { flags: TcpFlag[]; seq: number; ack: number; stream: number; payload: number };
  /** What the packet carries, as text, for Follow TCP Stream and frame contains. */
  data?: string;
  http?: HttpPart;
  dns?: { id: number; response: boolean; name: string; type: string; answers: string[] };
  tls?: { hello?: 'client' | 'server'; sni?: string };
  arp?: { ask: string; tell: string; mac?: string };
}

/** Builds a capture in time order from conversations and noise. */
export class CaptureBuilder {
  packets: Packet[] = [];
  t = 0;
  private streams = 0;
  private dnsId = 0x1a20;

  constructor(start = 0) {
    this.t = start;
  }

  private add(p: Omit<Packet, 'no' | 't'>, dt = 0.0004): Packet {
    this.t = Math.round((this.t + dt) * 1e6) / 1e6;
    const pk = { ...p, no: this.packets.length + 1, t: this.t } as Packet;
    this.packets.push(pk);
    return pk;
  }

  wait(seconds: number): this {
    this.t = Math.round((this.t + seconds) * 1e6) / 1e6;
    return this;
  }

  arp(ask: string, tell: string, mac: string): this {
    this.add({ src: tell, dst: 'Broadcast', proto: 'ARP', len: 42, info: `Who has ${ask}? Tell ${tell}`, arp: { ask, tell } });
    this.add({ src: ask, dst: tell, proto: 'ARP', len: 42, info: `${ask} is at ${mac}`, arp: { ask, tell, mac } }, 0.002);
    return this;
  }

  mdns(src: string, name: string): this {
    this.add({ src, dst: '224.0.0.251', proto: 'MDNS', len: 82, info: `Standard query 0x0000 PTR ${name}, "QM" question`, l4: 'udp', sport: 5353, dport: 5353 });
    return this;
  }

  ssdp(src: string): this {
    this.add({ src, dst: '239.255.255.250', proto: 'SSDP', len: 216, info: 'M-SEARCH * HTTP/1.1', l4: 'udp', sport: 50000 + (this.packets.length % 900), dport: 1900, data: 'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nST: ssdp:all' });
    return this;
  }

  ntp(client: string, server: string): this {
    const sport = 40000 + (this.packets.length % 2000);
    this.add({ src: client, dst: server, proto: 'NTP', len: 90, info: 'NTP Version 4, client', l4: 'udp', sport, dport: 123 });
    this.add({ src: server, dst: client, proto: 'NTP', len: 90, info: 'NTP Version 4, server', l4: 'udp', sport: 123, dport: sport }, 0.021);
    return this;
  }

  dns(client: string, resolver: string, name: string, answers: string[], type = 'A'): this {
    const id = this.dnsId++;
    const hex = `0x${id.toString(16)}`;
    const sport = 50000 + ((id * 37) % 15000);
    this.add({ src: client, dst: resolver, proto: 'DNS', len: 60 + name.length, info: `Standard query ${hex} ${type} ${name}`, l4: 'udp', sport, dport: 53, dns: { id, response: false, name, type, answers: [] } });
    const ans = answers.length ? answers.map((a) => `${type} ${a}`).join(' ') : 'No such name';
    this.add({ src: resolver, dst: client, proto: 'DNS', len: 76 + name.length + answers.length * 16, info: `Standard query response ${hex} ${type} ${name} ${ans}`, l4: 'udp', sport: 53, dport: sport, dns: { id, response: true, name, type, answers } }, 0.012);
    return this;
  }

  /** A full TCP connection: handshake, each message with its ACK, then a clean close. */
  tcp(client: string, server: string, sport: number, dport: number, messages: { from: 'client' | 'server'; text: string; size?: number }[], opts: { tls?: string; gap?: number } = {}): number {
    const stream = this.streams++;
    let cseq = 1;
    let sseq = 1;
    const seg = (from: 'client' | 'server', flags: TcpFlag[], payload: number, extra: Partial<Packet> = {}, dt?: number) => {
      const fromClient = from === 'client';
      const [src, dst, sp, dp] = fromClient ? [client, server, sport, dport] : [server, client, dport, sport];
      const seq = fromClient ? cseq : sseq;
      const ack = fromClient ? sseq : cseq;
      const synOnly = flags.length === 1 && flags[0] === 'SYN';
      const info = extra.info ?? `${sp} → ${dp} [${flags.join(', ')}] Seq=${synOnly || (flags.includes('SYN') && !fromClient) ? 0 : seq} ${synOnly ? '' : `Ack=${ack} `}Win=${fromClient ? 64256 : 65160} Len=${payload}`;
      this.add({ src, dst, proto: extra.proto ?? 'TCP', len: 54 + payload + (flags.includes('SYN') ? 12 : 0), info: info.replace(/\s+/g, ' ').trim(), l4: 'tcp', sport: sp, dport: dp, tcp: { flags, seq: flags.includes('SYN') ? 0 : seq, ack: synOnly ? 0 : flags.includes('SYN') ? 1 : ack, stream, payload }, ...extra }, dt);
      if (fromClient) cseq += payload;
      else sseq += payload;
    };
    seg('client', ['SYN'], 0, {}, opts.gap ?? 0.0004);
    seg('server', ['SYN', 'ACK'], 0, {}, 0.018);
    seg('client', ['ACK'], 0, {}, 0.0002);
    if (opts.tls) {
      seg('client', ['PSH', 'ACK'], 517, { proto: 'TLSv1.3', info: `Client Hello (SNI=${opts.tls})`, tls: { hello: 'client', sni: opts.tls } });
      seg('server', ['ACK'], 0, {}, 0.018);
      seg('server', ['PSH', 'ACK'], 1400, { proto: 'TLSv1.3', info: 'Server Hello, Change Cipher Spec, Application Data', tls: { hello: 'server' } });
      seg('client', ['ACK'], 0);
    }
    for (const m of messages) {
      const size = m.size ?? m.text.length;
      const http = !opts.tls ? parseHttp(m.text) : undefined;
      if (opts.tls) seg(m.from, ['PSH', 'ACK'], size, { proto: 'TLSv1.3', info: 'Application Data', tls: {} }, 0.03);
      else seg(m.from, ['PSH', 'ACK'], size, { ...(http ? { proto: 'HTTP' as Proto, http, info: httpInfo(http) } : {}), data: m.text }, 0.03);
      seg(m.from === 'client' ? 'server' : 'client', ['ACK'], 0, {}, 0.0003);
    }
    seg('client', ['FIN', 'ACK'], 0, {}, 0.05);
    seg('server', ['FIN', 'ACK'], 0, {}, 0.002);
    seg('client', ['ACK'], 0, {}, 0.0002);
    return stream;
  }

  /** A connection attempt to a closed port: SYN, then RST. Counts as its own stream, like Wireshark. */
  refused(client: string, server: string, sport: number, dport: number): this {
    const stream = this.streams++;
    this.add({ src: client, dst: server, proto: 'TCP', len: 58, info: `${sport} → ${dport} [SYN] Seq=0 Win=1024 Len=0 MSS=1460`, l4: 'tcp', sport, dport, tcp: { flags: ['SYN'], seq: 0, ack: 0, stream, payload: 0 } }, 0.0009);
    this.add({ src: server, dst: client, proto: 'TCP', len: 54, info: `${dport} → ${sport} [RST, ACK] Seq=1 Ack=1 Win=0 Len=0`, l4: 'tcp', sport: dport, dport: sport, tcp: { flags: ['RST', 'ACK'], seq: 1, ack: 1, stream, payload: 0 } }, 0.0006);
    return this;
  }

  /** A port scanner's probe to an open port: SYN, SYN-ACK, then the scanner resets instead of finishing. */
  probeOpen(client: string, server: string, sport: number, dport: number): this {
    const stream = this.streams++;
    this.add({ src: client, dst: server, proto: 'TCP', len: 58, info: `${sport} → ${dport} [SYN] Seq=0 Win=1024 Len=0 MSS=1460`, l4: 'tcp', sport, dport, tcp: { flags: ['SYN'], seq: 0, ack: 0, stream, payload: 0 } }, 0.0009);
    this.add({ src: server, dst: client, proto: 'TCP', len: 58, info: `${dport} → ${sport} [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0 MSS=1460`, l4: 'tcp', sport: dport, dport: sport, tcp: { flags: ['SYN', 'ACK'], seq: 0, ack: 1, stream, payload: 0 } }, 0.0006);
    this.add({ src: client, dst: server, proto: 'TCP', len: 54, info: `${sport} → ${dport} [RST] Seq=1 Win=0 Len=0`, l4: 'tcp', sport, dport, tcp: { flags: ['RST'], seq: 1, ack: 0, stream, payload: 0 } }, 0.0002);
    return this;
  }
}

export function parseHttp(text: string): HttpPart | undefined {
  const [head = '', ...rest] = text.split('\r\n\r\n');
  const lines = head.split('\r\n');
  const first = lines[0] ?? '';
  const headers = lines.slice(1).map((l) => {
    const i = l.indexOf(':');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string];
  });
  const body = rest.join('\r\n\r\n');
  const req = /^([A-Z]+) (\S+) HTTP\/1\.[01]$/.exec(first);
  if (req) return { request: { method: req[1]!, uri: req[2]!, host: headers.find(([k]) => k.toLowerCase() === 'host')?.[1] ?? '' }, headers, body };
  const res = /^HTTP\/1\.[01] (\d{3}) (.*)$/.exec(first);
  if (res) return { response: { code: Number(res[1]), phrase: res[2]! }, headers, body };
  return undefined;
}

function httpInfo(h: HttpPart): string {
  if (h.request) return `${h.request.method} ${h.request.uri} HTTP/1.1${h.body && h.request.method === 'POST' ? '  (application/x-www-form-urlencoded)' : ''}`;
  const type = h.headers.find(([k]) => k.toLowerCase() === 'content-type')?.[1]?.split(';')[0];
  return `HTTP/1.1 ${h.response!.code} ${h.response!.phrase}${type ? `  (${type})` : ''}`;
}

const header = (h: HttpPart | undefined, name: string) => h?.headers.filter(([k]) => k.toLowerCase() === name).map(([, v]) => v) ?? [];

// ---- Fields -------------------------------------------------------------------

type Value = string | number;

/** Each field the filter knows, with what it reads from a packet. A field that is absent returns []. */
const FIELDS: Record<string, (p: Packet) => Value[]> = {
  'frame.number': (p) => [p.no],
  'frame.len': (p) => [p.len],
  'frame.time_relative': (p) => [p.t],
  'ip.src': (p) => (p.proto === 'ARP' ? [] : [p.src]),
  'ip.dst': (p) => (p.proto === 'ARP' ? [] : [p.dst]),
  'ip.addr': (p) => (p.proto === 'ARP' ? [] : [p.src, p.dst]),
  'tcp.srcport': (p) => (p.l4 === 'tcp' ? [p.sport!] : []),
  'tcp.dstport': (p) => (p.l4 === 'tcp' ? [p.dport!] : []),
  'tcp.port': (p) => (p.l4 === 'tcp' ? [p.sport!, p.dport!] : []),
  'udp.srcport': (p) => (p.l4 === 'udp' ? [p.sport!] : []),
  'udp.dstport': (p) => (p.l4 === 'udp' ? [p.dport!] : []),
  'udp.port': (p) => (p.l4 === 'udp' ? [p.sport!, p.dport!] : []),
  'tcp.stream': (p) => (p.tcp ? [p.tcp.stream] : []),
  'tcp.len': (p) => (p.tcp ? [p.tcp.payload] : []),
  'tcp.seq': (p) => (p.tcp ? [p.tcp.seq] : []),
  'tcp.ack': (p) => (p.tcp ? [p.tcp.ack] : []),
  'tcp.flags.syn': (p) => (p.tcp ? [p.tcp.flags.includes('SYN') ? 1 : 0] : []),
  'tcp.flags.ack': (p) => (p.tcp ? [p.tcp.flags.includes('ACK') ? 1 : 0] : []),
  'tcp.flags.fin': (p) => (p.tcp ? [p.tcp.flags.includes('FIN') ? 1 : 0] : []),
  'tcp.flags.reset': (p) => (p.tcp ? [p.tcp.flags.includes('RST') ? 1 : 0] : []),
  'tcp.flags.push': (p) => (p.tcp ? [p.tcp.flags.includes('PSH') ? 1 : 0] : []),
  'http.request.method': (p) => (p.http?.request ? [p.http.request.method] : []),
  'http.request.uri': (p) => (p.http?.request ? [p.http.request.uri] : []),
  'http.host': (p) => (p.http?.request ? [p.http.request.host] : []),
  'http.cookie': (p) => header(p.http, 'cookie'),
  'http.set_cookie': (p) => header(p.http, 'set-cookie'),
  'http.user_agent': (p) => header(p.http, 'user-agent'),
  'http.authorization': (p) => header(p.http, 'authorization'),
  'http.content_type': (p) => header(p.http, 'content-type'),
  'http.response.code': (p) => (p.http?.response ? [p.http.response.code] : []),
  'http.file_data': (p) => (p.http?.body ? [p.http.body] : []),
  'dns.qry.name': (p) => (p.dns ? [p.dns.name] : []),
  'dns.a': (p) => (p.dns?.response ? p.dns.answers : []),
  'dns.flags.response': (p) => (p.dns ? [p.dns.response ? 1 : 0] : []),
  'tls.handshake.type': (p) => (p.tls?.hello ? [p.tls.hello === 'client' ? 1 : 2] : []),
  'tls.handshake.extensions_server_name': (p) => (p.tls?.sni ? [p.tls.sni] : []),
};

/** Protocol names and fields used on their own: true when the packet has it. */
const PRESENCE: Record<string, (p: Packet) => boolean> = {
  frame: () => true,
  eth: () => true,
  ip: (p) => p.proto !== 'ARP',
  arp: (p) => p.proto === 'ARP',
  tcp: (p) => p.l4 === 'tcp',
  udp: (p) => p.l4 === 'udp',
  http: (p) => !!p.http || p.proto === 'SSDP',
  'http.request': (p) => !!p.http?.request,
  'http.response': (p) => !!p.http?.response,
  dns: (p) => p.proto === 'DNS',
  mdns: (p) => p.proto === 'MDNS',
  ssdp: (p) => p.proto === 'SSDP',
  ntp: (p) => p.proto === 'NTP',
  tls: (p) => p.proto === 'TLSv1.3',
  icmp: (p) => p.proto === 'ICMP',
};

export const FIELD_NAMES = [...Object.keys(PRESENCE), ...Object.keys(FIELDS)];

function fieldValues(name: string, p: Packet): Value[] | null {
  const f = FIELDS[name];
  if (f) return f(p);
  const pr = PRESENCE[name];
  if (pr) return pr(p) ? [1] : [];
  return null;
}

// ---- The display filter ---------------------------------------------------------

type Tok = { k: 'field' | 'str' | 'num' | 'word' | 'op' | 'and' | 'or' | 'not' | '(' | ')'; v: string };

const OPS: Record<string, string> = { '==': '==', eq: '==', '!=': '!=', ne: '!=', '>': '>', gt: '>', '<': '<', lt: '<', '>=': '>=', ge: '>=', '<=': '<=', le: '<=', contains: 'contains', matches: 'matches' };

function tokenize(src: string): Tok[] | string {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '(' || c === ')') {
      out.push({ k: c, v: c });
      i++;
      continue;
    }
    if (c === '"') {
      const end = src.indexOf('"', i + 1);
      if (end < 0) return 'The string has no closing quote: add a " at the end.';
      out.push({ k: 'str', v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '&&') { out.push({ k: 'and', v: two }); i += 2; continue; }
    if (two === '||') { out.push({ k: 'or', v: two }); i += 2; continue; }
    if (['==', '!=', '>=', '<='].includes(two)) { out.push({ k: 'op', v: OPS[two]! }); i += 2; continue; }
    if (c === '>' || c === '<') { out.push({ k: 'op', v: c }); i++; continue; }
    if (c === '!') { out.push({ k: 'not', v: '!' }); i++; continue; }
    if (c === '=') return '"=" was unexpected in this context. To compare, use two: ==';
    const m = /^[A-Za-z0-9_.:/\-*]+/.exec(src.slice(i));
    if (!m) return `"${c}" was unexpected in this context.`;
    const w = m[0];
    i += w.length;
    const lw = w.toLowerCase();
    if (lw === 'and') out.push({ k: 'and', v: w });
    else if (lw === 'or') out.push({ k: 'or', v: w });
    else if (lw === 'not') out.push({ k: 'not', v: w });
    else if (OPS[lw]) out.push({ k: 'op', v: OPS[lw]! });
    else if (/^\d+(\.\d+)?$/.test(w)) out.push({ k: 'num', v: w });
    else if (FIELDS[w] || PRESENCE[w]) out.push({ k: 'field', v: w });
    else out.push({ k: 'word', v: w });
  }
  return out;
}

export type Expr =
  | { t: 'and' | 'or'; a: Expr; b: Expr }
  | { t: 'not'; a: Expr }
  | { t: 'has'; field: string }
  | { t: 'cmp'; field: string; op: string; value: string; quoted: boolean };

export function parseFilter(src: string): { ok: true; expr: Expr | null } | { ok: false; error: string } {
  if (!src.trim()) return { ok: true, expr: null };
  const toks = tokenize(src);
  if (typeof toks === 'string') return { ok: false, error: toks };
  let i = 0;
  const peek = () => toks[i];
  const fail = (msg: string) => {
    throw new Error(msg);
  };
  const or = (): Expr => {
    let a = and();
    while (peek()?.k === 'or') {
      i++;
      a = { t: 'or', a, b: and() };
    }
    return a;
  };
  const and = (): Expr => {
    let a = unary();
    while (peek()?.k === 'and') {
      i++;
      a = { t: 'and', a, b: unary() };
    }
    return a;
  };
  const unary = (): Expr => {
    const t = peek();
    if (!t) return fail('Unexpected end of filter expression.');
    if (t.k === 'not') {
      i++;
      return { t: 'not', a: unary() };
    }
    if (t.k === '(') {
      i++;
      const e = or();
      if (peek()?.k !== ')') fail('Missing a closing parenthesis.');
      i++;
      return e;
    }
    if (t.k === 'word') fail(`"${t.v}" is neither a field nor a protocol name.`);
    if (t.k !== 'field') fail(`"${t.v}" was unexpected in this context.`);
    i++;
    const op = peek();
    if (op?.k !== 'op') return { t: 'has', field: t.v };
    i++;
    const val = peek();
    if (!val || !['str', 'num', 'word'].includes(val.k)) fail(val ? `"${val.v}" was unexpected in this context.` : 'Unexpected end of filter expression.');
    i++;
    if ((op.v === 'contains' || op.v === 'matches') && val!.k !== 'str') fail(`Put the text in double quotes: ${t.v} ${op.v} "${val!.v}"`);
    return { t: 'cmp', field: t.v, op: op.v, value: val!.v, quoted: val!.k === 'str' };
  };
  try {
    const expr = or();
    if (i < toks.length) return { ok: false, error: `"${toks[i]!.v}" was unexpected in this context.` };
    return { ok: true, expr };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function inCidr(ip: string, cidr: string): boolean | null {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(cidr);
  const a = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (!m || !a) return null;
  const n = (x: RegExpExecArray) => ((+x[1]! << 24) >>> 0) + (+x[2]! << 16) + (+x[3]! << 8) + +x[4]!;
  const bits = +m[5]!;
  const size = 2 ** (32 - bits);
  const start = n(m) - (n(m) % size);
  return n(a) >= start && n(a) < start + size;
}

function compare(v: Value, op: string, raw: string): boolean {
  if (op === 'contains') return String(v).includes(raw);
  if (op === 'matches') {
    try {
      return new RegExp(raw, 'i').test(String(v));
    } catch {
      return false;
    }
  }
  if (typeof v === 'number') {
    const n = raw.startsWith('0x') ? parseInt(raw, 16) : Number(raw);
    if (Number.isNaN(n)) return false;
    return op === '==' ? v === n : op === '>' ? v > n : op === '<' ? v < n : op === '>=' ? v >= n : v <= n;
  }
  if (op === '==') {
    const c = inCidr(v, raw);
    return c ?? v === raw;
  }
  return op === '>' ? v > raw : op === '<' ? v < raw : op === '>=' ? v >= raw : v <= raw;
}

export function matches(e: Expr | null, p: Packet): boolean {
  if (!e) return true;
  switch (e.t) {
    case 'and':
      return matches(e.a, p) && matches(e.b, p);
    case 'or':
      return matches(e.a, p) || matches(e.b, p);
    case 'not':
      return !matches(e.a, p);
    case 'has':
      return (fieldValues(e.field, p) ?? []).length > 0;
    case 'cmp': {
      const vals = fieldValues(e.field, p) ?? [];
      // As in Wireshark 4: == is "any value equals", != is "no value equals".
      if (e.op === '!=') return vals.length > 0 && !vals.some((v) => compare(v, '==', e.value));
      return vals.some((v) => compare(v, e.op, e.value));
    }
  }
}

export function applyFilter(packets: Packet[], src: string): { ok: true; shown: Packet[] } | { ok: false; error: string } {
  const f = parseFilter(src);
  if (!f.ok) return f;
  return { ok: true, shown: packets.filter((p) => matches(f.expr, p)) };
}

/** A filter used on its own as a bare word that is not a field, with the field the player probably meant. */
export function suggest(word: string): string | null {
  const w = word.toLowerCase();
  const near: Record<string, string> = { 'ip.source': 'ip.src', 'ip.destination': 'ip.dst', port: 'tcp.port', 'tcp.syn': 'tcp.flags.syn', 'tcp.rst': 'tcp.flags.reset', 'tcp.flags.rst': 'tcp.flags.reset', cookie: 'http.cookie', sni: 'tls.handshake.extensions_server_name', 'dns.name': 'dns.qry.name', https: 'tls', ssl: 'tls' };
  return near[w] ?? null;
}

// ---- Follow TCP Stream and Conversations -------------------------------------

export interface StreamView {
  stream: number;
  client: string;
  server: string;
  /** Each message in order, from which side. */
  parts: { from: 'client' | 'server'; text: string }[];
  /** True when the payload is encrypted: Follow shows nothing readable. */
  encrypted: boolean;
  filter: string;
}

export function followStream(packets: Packet[], stream: number): StreamView | null {
  const pk = packets.filter((p) => p.tcp?.stream === stream);
  if (!pk.length) return null;
  const first = pk[0]!;
  const client = `${first.src}:${first.sport}`;
  const server = `${first.dst}:${first.dport}`;
  const parts: StreamView['parts'] = [];
  let encrypted = false;
  for (const p of pk) {
    if (!p.tcp?.payload) continue;
    const from = `${p.src}:${p.sport}` === client ? 'client' : 'server';
    if (p.proto === 'TLSv1.3') {
      encrypted = true;
      parts.push({ from, text: `(${p.tcp.payload} bytes of encrypted ${p.tls?.hello ? 'handshake' : 'data'}${p.tls?.sni ? `, SNI ${p.tls.sni} in the clear` : ''})` });
    } else if (p.data) parts.push({ from, text: p.data.replace(/\r\n/g, '\n') });
  }
  return { stream, client, server, parts, encrypted, filter: `tcp.stream eq ${stream}` };
}

export interface Conversation {
  a: string;
  b: string;
  packets: number;
  bytes: number;
  aToB: number;
  bToA: number;
  start: number;
  duration: number;
}

/** Statistics > Conversations > IPv4: one row per pair of addresses, biggest first. */
export function conversations(packets: Packet[]): Conversation[] {
  const map = new Map<string, Conversation>();
  for (const p of packets) {
    if (p.proto === 'ARP' || p.dst.startsWith('224.') || p.dst.startsWith('239.')) continue;
    const [a, b] = [p.src, p.dst].sort();
    const key = `${a}|${b}`;
    const c = map.get(key) ?? { a: a!, b: b!, packets: 0, bytes: 0, aToB: 0, bToA: 0, start: p.t, duration: 0 };
    c.packets++;
    c.bytes += p.len;
    if (p.src === a) c.aToB += p.len;
    else c.bToA += p.len;
    c.duration = Math.round((p.t - c.start) * 1000) / 1000;
    map.set(key, c);
  }
  return [...map.values()].sort((x, y) => y.bytes - x.bytes);
}

// ---- Packet details --------------------------------------------------------------

export interface DetailLine {
  text: string;
  /** The filter field this line is, so it can be applied as a filter. */
  field?: string;
  value?: string;
}

export interface DetailSection {
  title: string;
  lines: DetailLine[];
}

const q = (v: string) => (/^[\d.]+$/.test(v) ? v : `"${v}"`);

/** The packet details pane, layer by layer, with the field name behind each line. */
export function details(p: Packet): DetailSection[] {
  const out: DetailSection[] = [{ title: `Frame ${p.no}: ${p.len} bytes on wire`, lines: [{ text: `Arrival time: ${p.t.toFixed(6)} seconds after the capture started`, field: 'frame.time_relative', value: String(p.t) }, { text: `Frame number: ${p.no}`, field: 'frame.number', value: String(p.no) }] }];
  if (p.arp) {
    out.push({ title: 'Address Resolution Protocol', lines: [{ text: p.arp.mac ? `Reply: ${p.arp.ask} is at ${p.arp.mac}` : `Request: who has ${p.arp.ask}? Tell ${p.arp.tell}` }] });
    return out;
  }
  out.push({ title: `Internet Protocol Version 4, Src: ${p.src}, Dst: ${p.dst}`, lines: [{ text: `Source Address: ${p.src}`, field: 'ip.src', value: p.src }, { text: `Destination Address: ${p.dst}`, field: 'ip.dst', value: p.dst }] });
  if (p.tcp) {
    out.push({
      title: `Transmission Control Protocol, Src Port: ${p.sport}, Dst Port: ${p.dport}, Seq: ${p.tcp.seq}${p.tcp.flags.includes('ACK') ? `, Ack: ${p.tcp.ack}` : ''}, Len: ${p.tcp.payload}`,
      lines: [
        { text: `Source Port: ${p.sport}`, field: 'tcp.srcport', value: String(p.sport) },
        { text: `Destination Port: ${p.dport}`, field: 'tcp.dstport', value: String(p.dport) },
        { text: `[Stream index: ${p.tcp.stream}]`, field: 'tcp.stream', value: String(p.tcp.stream) },
        { text: `Sequence Number: ${p.tcp.seq}    (relative)`, field: 'tcp.seq', value: String(p.tcp.seq) },
        { text: `Acknowledgment Number: ${p.tcp.ack}    (relative)`, field: 'tcp.ack', value: String(p.tcp.ack) },
        { text: `Flags: ${p.tcp.flags.join(', ')}` },
        ...(['SYN', 'ACK', 'FIN', 'RST', 'PSH'] as TcpFlag[]).map((f) => ({ text: `    ${f === 'RST' ? 'Reset' : f === 'PSH' ? 'Push' : f === 'SYN' ? 'Syn' : f === 'ACK' ? 'Acknowledgment' : 'Fin'}: ${p.tcp!.flags.includes(f) ? 'Set' : 'Not set'}`, field: `tcp.flags.${f === 'RST' ? 'reset' : f === 'PSH' ? 'push' : f.toLowerCase()}`, value: p.tcp!.flags.includes(f) ? '1' : '0' })),
        { text: `TCP payload: ${p.tcp.payload} bytes`, field: 'tcp.len', value: String(p.tcp.payload) },
      ],
    });
  } else if (p.l4 === 'udp') {
    out.push({ title: `User Datagram Protocol, Src Port: ${p.sport}, Dst Port: ${p.dport}`, lines: [{ text: `Source Port: ${p.sport}`, field: 'udp.srcport', value: String(p.sport) }, { text: `Destination Port: ${p.dport}`, field: 'udp.dstport', value: String(p.dport) }] });
  }
  if (p.dns) {
    const lines: DetailLine[] = [{ text: `Transaction ID: 0x${p.dns.id.toString(16)}` }, { text: `Response: ${p.dns.response ? 'Message is a response' : 'Message is a query'}`, field: 'dns.flags.response', value: p.dns.response ? '1' : '0' }, { text: `Query: ${p.dns.name}, type ${p.dns.type}`, field: 'dns.qry.name', value: p.dns.name }];
    for (const a of p.dns.answers) lines.push({ text: `Answer: ${p.dns.name}: type ${p.dns.type}, addr ${a}`, field: 'dns.a', value: a });
    if (p.dns.response && !p.dns.answers.length) lines.push({ text: 'Reply code: No such name' });
    out.push({ title: `Domain Name System (${p.dns.response ? 'response' : 'query'})`, lines });
  }
  if (p.tls) {
    const lines: DetailLine[] = [];
    if (p.tls.hello) lines.push({ text: `Handshake Type: ${p.tls.hello === 'client' ? 'Client Hello (1)' : 'Server Hello (2)'}`, field: 'tls.handshake.type', value: p.tls.hello === 'client' ? '1' : '2' });
    if (p.tls.sni) lines.push({ text: `Extension: server_name: ${p.tls.sni}`, field: 'tls.handshake.extensions_server_name', value: p.tls.sni });
    if (!p.tls.hello) lines.push({ text: 'Encrypted Application Data: the content cannot be read without the session keys' });
    out.push({ title: 'Transport Layer Security', lines });
  }
  if (p.http) {
    const h = p.http;
    const lines: DetailLine[] = [];
    if (h.request) lines.push({ text: `${h.request.method} ${h.request.uri} HTTP/1.1`, field: 'http.request.method', value: h.request.method }, { text: `Request URI: ${h.request.uri}`, field: 'http.request.uri', value: h.request.uri });
    if (h.response) lines.push({ text: `HTTP/1.1 ${h.response.code} ${h.response.phrase}`, field: 'http.response.code', value: String(h.response.code) });
    const fieldOf: Record<string, string> = { host: 'http.host', cookie: 'http.cookie', 'set-cookie': 'http.set_cookie', 'user-agent': 'http.user_agent', authorization: 'http.authorization', 'content-type': 'http.content_type' };
    for (const [k, v] of h.headers) lines.push({ text: `${k}: ${v}`, field: fieldOf[k.toLowerCase()], value: fieldOf[k.toLowerCase()] ? v : undefined });
    if (h.body) lines.push({ text: `File Data: ${h.body.length} bytes`, field: 'http.file_data', value: h.body });
    out.push({ title: 'Hypertext Transfer Protocol', lines });
    if (h.body && h.request?.method === 'POST') out.push({ title: 'HTML Form URL Encoded: application/x-www-form-urlencoded', lines: h.body.split('&').map((kv) => ({ text: `Form item: "${kv.split('=')[0]}" = "${decodeURIComponent((kv.split('=')[1] ?? '').replace(/\+/g, ' '))}"` })) });
  }
  return out;
}

/** The filter "Apply as Filter" writes for a detail line. */
export function asFilter(line: DetailLine): string | null {
  if (!line.field || line.value === undefined) return null;
  return `${line.field} == ${q(line.value)}`;
}

// ---- The sandbox state, as a reducer --------------------------------------------

export interface CaptureState {
  filter: string;
  /** Every filter applied that parsed, with the packet numbers it showed. */
  applied: { filter: string; shown: number[] }[];
  error: string | null;
  selected: number | null;
  selectedEver: number[];
  followed: number[];
  stats: boolean;
  answers: string[];
}

export type CaptureAction = { t: 'type'; text: string } | { t: 'apply'; text?: string } | { t: 'select'; no: number } | { t: 'follow' } | { t: 'stats' } | { t: 'answer'; text: string };

export const initialCapture = (): CaptureState => ({ filter: '', applied: [], error: null, selected: null, selectedEver: [], followed: [], stats: false, answers: [] });

export function reduceCapture(packets: Packet[], s: CaptureState, a: CaptureAction): CaptureState {
  switch (a.t) {
    case 'type':
      return { ...s, filter: a.text };
    case 'apply': {
      const text = (a.text ?? s.filter).trim();
      const r = applyFilter(packets, text);
      if (!r.ok) return { ...s, filter: text, error: r.error };
      const shown = r.shown.map((p) => p.no);
      const keep = s.selected !== null && shown.includes(s.selected) ? s.selected : null;
      return { ...s, filter: text, error: null, applied: [...s.applied, { filter: text, shown }], selected: keep };
    }
    case 'select':
      return { ...s, selected: a.no, selectedEver: s.selectedEver.includes(a.no) ? s.selectedEver : [...s.selectedEver, a.no] };
    case 'follow': {
      const p = packets.find((x) => x.no === s.selected);
      if (!p?.tcp) return s;
      const f = followStream(packets, p.tcp.stream)!;
      const r = applyFilter(packets, f.filter);
      const shown = r.ok ? r.shown.map((x) => x.no) : [];
      return { ...s, filter: f.filter, error: null, applied: [...s.applied, { filter: f.filter, shown }], followed: s.followed.includes(p.tcp.stream) ? s.followed : [...s.followed, p.tcp.stream] };
    }
    case 'stats':
      return { ...s, stats: true };
    case 'answer':
      return { ...s, answers: [...s.answers, a.text] };
  }
}

export function runCapture(packets: Packet[], actions: CaptureAction[]): CaptureState {
  return actions.reduce((s, a) => reduceCapture(packets, s, a), initialCapture());
}

/** The packet numbers a filter shows, as one string, to compare two filters by what they show. */
export function shownKey(packets: Packet[], filter: string): string | null {
  const r = applyFilter(packets, filter);
  return r.ok ? r.shown.map((p) => p.no).join(',') : null;
}
