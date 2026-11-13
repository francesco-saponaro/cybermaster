// The packet captures behind The Capture. The café on the quai keeps a
// rolling capture of its guest Wi-Fi for troubleshooting, and the owner sent
// Sunday night's file; the last one comes from Harbor's own switch on Monday
// morning. Each capture is built from a plan, so the challenges can move the
// addresses, the counts and the names around. Addresses are private ranges or
// the documentation blocks; names end in .example.

import { CaptureBuilder, type Packet } from '../sim/pcap';

export interface CafePlan {
  /** First three octets of the café /24. */
  lan: string;
  mara: number;
  attacker: number;
  theo: number;
  phones: number[];
  tv: number;
  shopIp: string;
  payIp: string;
  lookIp: string;
  sid: string;
  /** How many plain HTTP requests Mara's laptop makes in the first capture. */
  requests: number;
  openPort: number;
  scanPorts: number[];
  lookalike: string;
  user: string;
  payHost: string;
  pages: string[];
}

export const CAFE: CafePlan = {
  lan: '10.20.0',
  mara: 14,
  attacker: 37,
  theo: 61,
  phones: [22, 41],
  tv: 50,
  shopIp: '203.0.113.10',
  payIp: '203.0.113.30',
  lookIp: '198.51.100.44',
  sid: 'a7f3c21e9b04',
  requests: 3,
  openPort: 445,
  scanPorts: [21, 22, 23, 80, 135, 139, 443, 445, 3389, 8080],
  lookalike: 'shop-lantern.example',
  user: 'theo',
  payHost: 'pay.lantern.example',
  pages: ['/', '/lamps/aurora', '/account'],
};

const ip = (p: CafePlan, n: number) => `${p.lan}.${n}`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/132.0';
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)';

const get = (host: string, path: string, cookie?: string, ua = UA) => `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nUser-Agent: ${ua}\r\nAccept: text/html${cookie ? `\r\nCookie: ${cookie}` : ''}\r\n\r\n`;
const ok = (title: string, extra = '') => `HTTP/1.1 200 OK\r\nServer: nginx\r\nContent-Type: text/html; charset=utf-8${extra}\r\n\r\n<!doctype html><title>${title}</title>`;

/** What any café Wi-Fi carries: phones finding each other, a TV looking for casts, lookups and encrypted apps. */
function noise(b: CaptureBuilder, p: CafePlan, round: number): void {
  const [a = 22, c = 41] = p.phones;
  b.arp(ip(p, 1), ip(p, a), 'c4:41:1e:20:00:01');
  b.mdns(ip(p, a), '_companion-link._tcp.local');
  b.ssdp(ip(p, p.tv));
  b.dns(ip(p, c), ip(p, 1), round % 2 ? 'graph.social.example' : 'api.weather.example', [round % 2 ? '203.0.113.200' : '203.0.113.210']);
  b.tcp(ip(p, c), round % 2 ? '203.0.113.200' : '203.0.113.210', 52100 + round * 7, 443, [{ from: 'client', text: '', size: 380 }, { from: 'server', text: '', size: 1200 }], { tls: round % 2 ? 'graph.social.example' : 'api.weather.example', gap: 0.4 });
  b.mdns(ip(p, c), '_googlecast._tcp.local');
  b.wait(0.7);
}

function maraPage(b: CaptureBuilder, p: CafePlan, path: string, port: number, cookie = true): number {
  return b.tcp(ip(p, p.mara), p.shopIp, port, 80, [
    { from: 'client', text: get('shop.lantern.example', path, cookie ? `sid=${p.sid}; lang=fr` : undefined) },
    { from: 'server', text: ok(path === '/account' ? 'Your account' : 'Lantern & Co.') },
  ], { gap: 0.3 });
}

/** Level 1: find Mara's plain HTTP requests in the noise. */
export function filterCapture(p: CafePlan): Packet[] {
  const b = new CaptureBuilder(0);
  noise(b, p, 0);
  b.dns(ip(p, p.mara), ip(p, 1), 'shop.lantern.example', [p.shopIp]);
  p.pages.slice(0, p.requests).forEach((path, i) => {
    maraPage(b, p, path, 51514 + i * 3, i > 0);
    noise(b, p, i + 1);
  });
  // Someone else's plain HTTP, so the address matters.
  b.dns(ip(p, p.phones[0]!), ip(p, 1), 'neverssl.example', ['198.51.100.80']);
  b.tcp(ip(p, p.phones[0]!), '198.51.100.80', 49822, 80, [{ from: 'client', text: get('neverssl.example', '/', undefined, PHONE_UA) }, { from: 'server', text: ok('NeverSSL') }]);
  // Mara's encrypted traffic is not HTTP to a filter.
  b.tcp(ip(p, p.mara), p.payIp, 51630, 443, [{ from: 'client', text: '', size: 610 }, { from: 'server', text: '', size: 3100 }], { tls: p.payHost });
  noise(b, p, 9);
  return b.packets;
}

/** Level 2: a normal connection first, then someone on the Wi-Fi scanning Mara's laptop. */
export function handshakeCapture(p: CafePlan): Packet[] {
  const b = new CaptureBuilder(0);
  b.dns(ip(p, p.mara), ip(p, 1), 'shop.lantern.example', [p.shopIp]);
  maraPage(b, p, '/', 51514, false);
  noise(b, p, 0);
  let sport = 40312;
  for (const port of p.scanPorts) {
    if (port === p.openPort) b.probeOpen(ip(p, p.attacker), ip(p, p.mara), sport, port);
    else b.refused(ip(p, p.attacker), ip(p, p.mara), sport, port);
    sport += 1;
  }
  noise(b, p, 1);
  return b.packets;
}

/** Level 3: the lookups before Mara's connections, one of them a lookalike of the shop. */
export function dnsCapture(p: CafePlan): Packet[] {
  const b = new CaptureBuilder(0);
  noise(b, p, 0);
  b.dns(ip(p, p.mara), ip(p, 1), 'shop.lantern.example', [p.shopIp]);
  b.dns(ip(p, p.mara), ip(p, 1), 'cdn.lantern.example', ['203.0.113.11']);
  maraPage(b, p, '/', 51514);
  noise(b, p, 1);
  b.dns(ip(p, p.mara), ip(p, 1), 'mail.webmail.example', ['203.0.113.150']);
  b.tcp(ip(p, p.mara), '203.0.113.150', 51540, 443, [{ from: 'client', text: '', size: 420 }, { from: 'server', text: '', size: 2200 }], { tls: 'mail.webmail.example' });
  b.dns(ip(p, p.mara), ip(p, 1), p.lookalike, [p.lookIp]);
  b.tcp(ip(p, p.mara), p.lookIp, 51552, 80, [
    { from: 'client', text: get(p.lookalike, '/account/verify', undefined) },
    { from: 'server', text: ok('Lantern & Co. - verify your account') },
  ]);
  b.dns(ip(p, p.phones[1]!), ip(p, 1), 'lantern-lamps.example', []);
  noise(b, p, 2);
  return b.packets;
}

export interface StreamPlan {
  packets: Packet[];
  /** Mara's request for /account, the one to follow. */
  maraStream: number;
}

/** Level 4: Mara's session cookie in the clear, and the same cookie from another laptop minutes later. */
export function streamCapture(p: CafePlan): StreamPlan {
  const b = new CaptureBuilder(0);
  noise(b, p, 0);
  maraPage(b, p, '/', 51514, false);
  const maraStream = b.tcp(ip(p, p.mara), p.shopIp, 51518, 80, [
    { from: 'client', text: get('shop.lantern.example', '/account', `sid=${p.sid}; lang=fr`) },
    { from: 'server', text: ok('Your account', '\r\nCache-Control: private') },
  ], { gap: 0.4 });
  noise(b, p, 1);
  b.wait(42);
  b.tcp(ip(p, p.attacker), p.shopIp, 60122, 80, [
    { from: 'client', text: get('shop.lantern.example', '/account/orders', `sid=${p.sid}`, 'curl/8.5.0') },
    { from: 'server', text: ok('Your orders') },
  ]);
  noise(b, p, 2);
  return { packets: b.packets, maraStream };
}

export interface CredsPlan {
  packets: Packet[];
  postStream: number;
}

/** Level 5: a staff login posted over plain HTTP, next to Mara paying over HTTPS. */
export function credsCapture(p: CafePlan): CredsPlan {
  const b = new CaptureBuilder(0);
  noise(b, p, 0);
  b.dns(ip(p, p.mara), ip(p, 1), p.payHost, [p.payIp]);
  b.tcp(ip(p, p.mara), p.payIp, 51700, 443, [{ from: 'client', text: '', size: 880 }, { from: 'server', text: '', size: 4100 }, { from: 'client', text: '', size: 512 }], { tls: p.payHost });
  noise(b, p, 1);
  b.tcp(ip(p, p.theo), p.shopIp, 50410, 80, [{ from: 'client', text: get('shop.lantern.example', '/admin-old/') }, { from: 'server', text: ok('Staff login') }]);
  const body = `user=${p.user}&pass=Lanterne2019%21&remember=1`;
  const postStream = b.tcp(ip(p, p.theo), p.shopIp, 50414, 80, [
    { from: 'client', text: `POST /admin-old/login HTTP/1.1\r\nHost: shop.lantern.example\r\nUser-Agent: ${UA}\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: ${body.length}\r\n\r\n${body}` },
    { from: 'server', text: 'HTTP/1.1 302 Found\r\nServer: nginx\r\nLocation: /admin-old/dashboard\r\nSet-Cookie: staff=9c1e0b7a; Path=/admin-old\r\n\r\n' },
  ]);
  b.tcp(ip(p, p.mara), p.shopIp, 51710, 443, [{ from: 'client', text: '', size: 700 }, { from: 'server', text: '', size: 5200 }], { tls: 'shop.lantern.example' });
  noise(b, p, 2);
  return { packets: b.packets, postStream };
}

// ---- Harbor, Monday 03:40 ------------------------------------------------------------

export interface HarborPlan {
  lan: string;
  /** The machine sending the data out, and where to. */
  src: number;
  dest: string;
  file: string;
  /** The internal backup that is bigger than the theft, so size alone misleads. */
  backupFrom: number;
  backupTo: number;
  chunks: number;
}

export const HARBOR: HarborPlan = { lan: '10.0.8', src: 21, dest: '198.51.100.23', file: 'harbor-share.tar.gz', backupFrom: 40, backupTo: 30, chunks: 26 };

export interface BossPlan {
  packets: Packet[];
  exfilStream: number;
}

export function harborCapture(h: HarborPlan): BossPlan {
  const b = new CaptureBuilder(0);
  const at = (n: number) => `${h.lan}.${n}`;
  b.ntp(at(12), '203.0.113.123');
  b.dns(at(15), at(1), 'archive.ubuntu.example', ['203.0.113.80']);
  b.tcp(at(15), '203.0.113.80', 41820, 443, [{ from: 'client', text: '', size: 520 }, { from: 'server', text: '', size: 1448 }, { from: 'server', text: '', size: 1448 }, { from: 'server', text: '', size: 900 }], { tls: 'archive.ubuntu.example' });
  // The nightly backup: big, but it stays inside the network.
  b.tcp(at(h.backupFrom), at(h.backupTo), 52010, 873, [{ from: 'client', text: '@RSYNCD: 31.0\n', size: 14 }, ...Array.from({ length: h.chunks + 12 }, () => ({ from: 'client' as const, text: '', size: 1448 })), { from: 'server', text: '@RSYNCD: EXIT\n', size: 14 }]);
  b.arp(at(1), at(21), '00:16:3e:08:00:01');
  b.dns(at(h.src), at(1), 'drop.fileshare-tmp.example', [h.dest]);
  const exfilStream = b.tcp(at(h.src), h.dest, 38211, 80, [
    { from: 'client', text: `POST /upload HTTP/1.1\r\nHost: drop.fileshare-tmp.example\r\nUser-Agent: curl/7.47.0\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="${h.file}"\r\nContent-Length: ${h.chunks * 1448}\r\n\r\n` },
    ...Array.from({ length: h.chunks }, () => ({ from: 'client' as const, text: '', size: 1448 })),
    { from: 'server', text: 'HTTP/1.1 201 Created\r\nServer: nginx\r\nContent-Type: application/json\r\n\r\n{"stored":true,"expires":"24h"}' },
  ]);
  b.ntp(at(40), '203.0.113.123');
  b.dns(at(12), at(1), 'updates.printer.example', ['203.0.113.90']);
  b.tcp(at(12), '203.0.113.90', 44102, 443, [{ from: 'client', text: '', size: 300 }, { from: 'server', text: '', size: 600 }], { tls: 'updates.printer.example' });
  return { packets: b.packets, exfilStream };
}
