import type { CaptureLevel } from '../types';
import type { ChallengeGenerator } from './types';
import { asChallenge } from './types';
import { LEVEL_BY_ID } from '../index';
import type { Rng } from '../../engine/rng';
import { CAFE, HARBOR, credsCapture, dnsCapture, filterCapture, handshakeCapture, harborCapture, streamCapture, type CafePlan, type HarborPlan } from '../captures';
import { cafeNotes, harborNotes } from '../levels/capture';

const guided = (id: string) => LEVEL_BY_ID[id] as CaptureLevel;
const hex = (rng: Rng, n: number) => Array.from({ length: n }, () => '0123456789abcdef'[rng.int(0, 15)]).join('');

function cafe(rng: Rng): CafePlan {
  const lan = rng.chance(0.5) ? `10.${rng.int(1, 60)}.${rng.int(0, 250)}` : `192.168.${rng.int(2, 250)}`;
  const [mara, attacker, theo, p1, p2, tv] = rng.sample(Array.from({ length: 200 }, (_, i) => i + 10), 6) as [number, number, number, number, number, number];
  const openPort = rng.pick([445, 139, 3389, 5357]);
  const scanPorts = [...new Set([21, 22, 23, 80, 135, 443, 8080, ...rng.sample([139, 445, 3389, 5357, 5900, 25], 3), openPort])].sort((a, b) => a - b);
  return {
    ...CAFE,
    lan,
    mara,
    attacker,
    theo,
    phones: [p1, p2],
    tv,
    shopIp: `203.0.113.${rng.int(2, 60)}`,
    payIp: `203.0.113.${rng.int(61, 120)}`,
    lookIp: `198.51.100.${rng.int(2, 250)}`,
    sid: hex(rng, 12),
    requests: rng.int(2, 3),
    openPort,
    scanPorts,
    lookalike: rng.pick(['shop-lantern.example', 'lantern-shop.example', 'shop.lantern-account.example', 'shop.lantren.example']),
    user: rng.pick(['theo', 'ops', 'sam', 'lyon-admin']),
    payHost: rng.pick(['pay.lantern.example', 'checkout.lantern.example', 'secure-pay.example']),
  };
}

const at = (p: CafePlan, n: number) => `${p.lan}.${n}`;

const filter: ChallengeGenerator = (rng) => {
  const p = cafe(rng);
  const mara = at(p, p.mara);
  const level = asChallenge(guided('pcap-filter'), {
    goal: `Count the plain HTTP requests sent by ${mara}, and submit the number.`,
    instruction: 'Another evening on the café Wi-Fi, another laptop to find.',
    packets: filterCapture(p),
    notes: cafeNotes(p),
    goals: [
      { id: 'http', shows: 'http' },
      { id: 'mara', shows: `ip.addr == ${mara}` },
      { id: 'both', shows: `http.request && ip.src == ${mara}` },
      { id: 'answer', answers: [String(p.requests)] },
    ],
    wrong: [
      { answers: [String(p.requests * 2)], reason: 'That counts the answers too: keep only requests.' },
      { answers: [String(p.requests + 1)], reason: "One of those is someone else's: filter on her address as the source." },
    ],
    otherwise: 'Not that number. Keep HTTP requests sent by her address, then count.',
  });
  return {
    level,
    signature: `${mara}:${p.requests}:${p.phones.join(',')}`,
    hints: ['Start with a protocol name on its own, then add the address.', `\`http.request && ip.src == ${mara}\` keeps only her requests.`, 'Count the rows that are left.'],
    solution: { kind: 'capture', actions: [{ t: 'apply', text: 'http' }, { t: 'apply', text: `ip.addr == ${mara}` }, { t: 'apply', text: `http.request && ip.src == ${mara}` }, { t: 'answer', text: String(p.requests) }] },
  };
};

const handshake: ChallengeGenerator = (rng) => {
  const p = cafe(rng);
  const mara = at(p, p.mara);
  const att = at(p, p.attacker);
  const level = asChallenge(guided('pcap-handshake'), {
    goal: `Someone scanned ${mara}. Submit their address, then the port that answered.`,
    instruction: 'Read the handshakes, then the scan.',
    packets: handshakeCapture(p),
    notes: cafeNotes(p),
    goals: [
      { id: 'normal', shows: 'tcp.stream == 0' },
      { id: 'syns', shows: 'tcp.flags.syn == 1 && tcp.flags.ack == 0' },
      { id: 'who', answers: [att] },
      { id: 'closed', shows: 'tcp.flags.reset == 1' },
      { id: 'open', answers: [String(p.openPort), `${p.openPort}/tcp`] },
    ],
    wrong: [
      { answers: [mara], reason: 'That is the laptop being scanned.' },
      { answers: p.scanPorts.filter((x) => x !== p.openPort).map(String), reason: 'That port answered RST: closed.' },
    ],
    otherwise: 'Not that. The scanner sends the SYNs; the open port answers SYN-ACK.',
  });
  return {
    level,
    signature: `${mara}:${att}:${p.openPort}:${p.scanPorts.join(',')}`,
    hints: ['tcp.stream == 0 is one whole connection; then look at first packets only.', '`tcp.flags.syn == 1 && tcp.flags.ack == 0` shows every attempt, and `tcp.flags.reset == 1` the closed ports.', `A SYN-ACK from ${mara} marks the open port.`],
    solution: { kind: 'capture', actions: [{ t: 'apply', text: 'tcp.stream == 0' }, { t: 'apply', text: 'tcp.flags.syn == 1 && tcp.flags.ack == 0' }, { t: 'answer', text: att }, { t: 'apply', text: 'tcp.flags.reset == 1' }, { t: 'answer', text: String(p.openPort) }] },
  };
};

const dns: ChallengeGenerator = (rng) => {
  const p = cafe(rng);
  const packets = dnsCapture(p);
  const resp = packets.find((x) => x.dns?.response && x.dns.name === p.lookalike)!;
  const level = asChallenge(guided('pcap-dns'), {
    goal: 'Find the lookalike of the shop that her laptop looked up, and submit it.',
    instruction: 'Every name visited starts with a lookup.',
    packets,
    notes: cafeNotes(p),
    goals: [
      { id: 'dns', shows: 'dns' },
      { id: 'lantern', shows: 'dns.qry.name contains "lant"' },
      { id: 'read', selectWhere: `dns.flags.response == 1 && dns.qry.name == "${p.lookalike}"` },
      { id: 'answer', answers: [p.lookalike] },
    ],
    wrong: [{ answers: ['shop.lantern.example', 'cdn.lantern.example'], reason: "That is Lantern's own name." }],
    otherwise: 'Not that name. Look at every lookup with the shop in it and compare them letter by letter.',
  });
  return {
    level,
    signature: `${p.lookalike}:${p.lookIp}:${p.lan}`,
    hints: ['Show the lookups, then only the ones mentioning the shop.', '`dns.qry.name contains "lant"` catches the variants, misspellings included.', 'Open the response for the odd one and compare its address with the shop\'s.'],
    solution: { kind: 'capture', actions: [{ t: 'apply', text: 'dns' }, { t: 'apply', text: 'dns.qry.name contains "lant"' }, { t: 'select', no: resp.no }, { t: 'answer', text: p.lookalike }] },
  };
};

const stream: ChallengeGenerator = (rng) => {
  const p = cafe(rng);
  const s = streamCapture(p);
  const req = s.packets.find((x) => x.tcp?.stream === s.maraStream && x.http?.request)!;
  const att = at(p, p.attacker);
  const level = asChallenge(guided('pcap-stream'), {
    goal: "Read her session cookie off the Wi-Fi, then find who used it after her.",
    instruction: 'Rebuild her account request, then search for the cookie.',
    packets: s.packets,
    notes: cafeNotes(p),
    goals: [
      { id: 'cookies', shows: 'http.cookie' },
      { id: 'follow', follow: s.maraStream },
      { id: 'sid', answers: [p.sid, `sid=${p.sid}`] },
      { id: 'reuse', shows: `http.cookie contains "${p.sid}"` },
      { id: 'who', answers: [att] },
    ],
    wrong: [{ answers: [at(p, p.mara)], reason: 'That is her own laptop.' }],
    otherwise: 'Not that. Follow her /account request for the sid, then filter on it.',
  });
  return {
    level,
    signature: `${p.sid}:${att}`,
    hints: ['http.cookie on its own shows requests with a cookie.', 'Select her /account request and Follow TCP Stream: read sid=.', 'Then `http.cookie contains "..."` with that value.'],
    solution: { kind: 'capture', actions: [{ t: 'apply', text: 'http.cookie' }, { t: 'select', no: req.no }, { t: 'follow' }, { t: 'answer', text: p.sid }, { t: 'apply', text: `http.cookie contains "${p.sid}"` }, { t: 'answer', text: att }] },
  };
};

const creds: ChallengeGenerator = (rng) => {
  const p = cafe(rng);
  const c = credsCapture(p);
  const post = c.packets.find((x) => x.http?.request?.method === 'POST')!;
  const level = asChallenge(guided('pcap-creds'), {
    goal: 'Submit the user name of the login sent in the clear, then the site Mara paid on.',
    instruction: 'One form crossed the Wi-Fi readable; the rest is encrypted.',
    packets: c.packets,
    notes: [...cafeNotes(p), `${at(p, p.theo)} is a Lantern staff phone.`],
    goals: [
      { id: 'post', shows: 'http.request.method == "POST"' },
      { id: 'follow', follow: c.postStream },
      { id: 'user', answers: [p.user] },
      { id: 'tls', shows: 'tls.handshake.type == 1' },
      { id: 'sni', answers: [p.payHost] },
    ],
    wrong: [{ answers: ['shop.lantern.example'], reason: 'That is the shop itself.' }],
    otherwise: 'Not that. Read user= in the POST, then the SNI of her other HTTPS connection.',
  });
  return {
    level,
    signature: `${p.user}:${p.payHost}:${at(p, p.theo)}`,
    hints: ['Logins are POSTs.', 'Follow the POST and read user=; then show Client Hellos with `tls.handshake.type == 1`.', `Her Client Hellos come from ${at(p, p.mara)}.`],
    solution: { kind: 'capture', actions: [{ t: 'apply', text: 'http.request.method == "POST"' }, { t: 'select', no: post.no }, { t: 'follow' }, { t: 'answer', text: p.user }, { t: 'apply', text: 'tls.handshake.type == 1' }, { t: 'answer', text: p.payHost }] },
  };
};

const boss: ChallengeGenerator = (rng) => {
  const lan = `10.${rng.int(0, 40)}.${rng.int(1, 250)}`;
  const [src, backupFrom, backupTo] = rng.sample([21, 22, 25, 30, 31, 40, 41, 44, 50], 3) as [number, number, number];
  const h: HarborPlan = { ...HARBOR, lan, src, backupFrom, backupTo, dest: `198.51.100.${rng.int(2, 99)}`, file: rng.pick(['harbor-share.tar.gz', 'dock-files.zip', 'invoices-2026.7z', 'customers-export.tar']), chunks: rng.int(18, 30) };
  const b = harborCapture(h);
  const post = b.packets.find((x) => x.http?.request?.method === 'POST')!;
  const out = `ip.src == ${lan}.0/24 && !(ip.dst == ${lan}.0/24)`;
  const level = asChallenge(guided('pcap-boss'), {
    goal: 'Data is leaving the warehouse network. Submit where it goes, then the file name.',
    instruction: 'Direction matters more than size.',
    packets: b.packets,
    notes: harborNotes(h),
    goals: [
      { id: 'stats', stats: true },
      { id: 'out', shows: out },
      { id: 'where', answers: [h.dest] },
      { id: 'follow', follow: b.exfilStream },
      { id: 'file', answers: [h.file] },
    ],
    wrong: [{ answers: [`${lan}.${backupTo}`, `${lan}.${backupFrom}`], reason: 'That is the internal backup; it never leaves.' }],
    otherwise: 'Not that. Show what leaves the range, find where most of it goes, then follow the POST.',
  });
  return {
    level,
    signature: `${lan}:${src}:${h.dest}:${h.file}:${h.chunks}`,
    hints: ['Conversations shows who talked to whom; the biggest may be internal.', `\`${out}\` shows only what leaves.`, 'Follow the POST /upload and read filename=.'],
    solution: { kind: 'capture', actions: [{ t: 'stats' }, { t: 'apply', text: out }, { t: 'answer', text: h.dest }, { t: 'select', no: post.no }, { t: 'follow' }, { t: 'answer', text: h.file }] },
  };
};

export const CAPTURE_CHALLENGES: Record<string, ChallengeGenerator> = {
  'pcap-filter': filter,
  'pcap-handshake': handshake,
  'pcap-dns': dns,
  'pcap-stream': stream,
  'pcap-creds': creds,
  'pcap-boss': boss,
};
