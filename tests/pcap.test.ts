import { describe, expect, it } from 'vitest';
import { applyFilter, conversations, details, followStream, asFilter, parseFilter, runCapture, initialCapture, type CaptureAction } from '../src/sim/pcap';
import { CAPTURE_LEVELS } from '../src/content/levels/capture';
import { evaluateCapture, judgeCapture } from '../src/game/evaluateCapture';
import { CAFE, filterCapture, handshakeCapture, streamCapture, harborCapture, HARBOR } from '../src/content/captures';

const count = (packets: ReturnType<typeof filterCapture>, f: string) => {
  const r = applyFilter(packets, f);
  if (!r.ok) throw new Error(r.error);
  return r.shown.length;
};

describe('the display filter', () => {
  const pk = filterCapture(CAFE);
  it('reads Wireshark syntax: protocols, fields, operators, and/or/not, ranges and strings', () => {
    expect(count(pk, '')).toBe(pk.length);
    expect(count(pk, 'http')).toBe(count(pk, 'http.request') + count(pk, 'http.response') + count(pk, 'ssdp'));
    expect(count(pk, 'http.request && ip.src == 10.20.0.14')).toBe(3);
    expect(count(pk, 'http.request and ip.src eq 10.20.0.14')).toBe(3);
    expect(count(pk, 'http.request && !(ip.src == 10.20.0.14)')).toBe(1);
    expect(count(pk, 'http.request && not ip.src == 10.20.0.14')).toBe(1);
    expect(count(pk, 'ip.addr == 10.20.0.0/24')).toBeGreaterThan(0);
    expect(count(pk, 'dns.qry.name contains "lantern"')).toBe(2);
    expect(count(pk, 'tcp.port == 443 || udp.port == 53')).toBeGreaterThan(0);
    expect(count(pk, 'frame.len > 1000')).toBeGreaterThan(0);
  });
  it('!= means no value equals, as in Wireshark 4', () => {
    const notMara = count(pk, 'ip.addr != 10.20.0.14');
    expect(notMara + count(pk, 'ip.addr == 10.20.0.14')).toBe(count(pk, 'ip'));
  });
  it('explains mistakes the way Wireshark does', () => {
    expect(parseFilter('ip.addr = 10.20.0.14')).toMatchObject({ ok: false, error: expect.stringMatching(/use two: ==/) });
    expect(parseFilter('ip.source == 1.2.3.4')).toMatchObject({ ok: false, error: expect.stringMatching(/neither a field nor a protocol/) });
    expect(parseFilter('dns.qry.name contains lantern')).toMatchObject({ ok: false, error: expect.stringMatching(/double quotes/) });
    expect(parseFilter('(http')).toMatchObject({ ok: false, error: expect.stringMatching(/closing parenthesis/) });
    expect(parseFilter('http &&')).toMatchObject({ ok: false, error: expect.stringMatching(/Unexpected end/) });
  });
});

describe('the capture', () => {
  it('opens every connection with SYN, SYN-ACK, ACK and closes it with FIN', () => {
    const pk = handshakeCapture(CAFE);
    const first = applyFilter(pk, 'tcp.stream == 0');
    if (!first.ok) throw new Error();
    expect(first.shown.slice(0, 3).map((p) => p.tcp!.flags.join(','))).toEqual(['SYN', 'SYN,ACK', 'ACK']);
    expect(first.shown[0]!.info).toMatch(/^51514 → 80 \[SYN\] Seq=0 Win=/);
    expect(first.shown.some((p) => p.tcp!.flags.includes('FIN'))).toBe(true);
  });
  it('a scan shows SYNs to every port, RST from closed ones and SYN-ACK from the open one', () => {
    const pk = handshakeCapture(CAFE);
    expect(count(pk, 'tcp.flags.syn == 1 && tcp.flags.ack == 0 && ip.src == 10.20.0.37')).toBe(CAFE.scanPorts.length);
    expect(count(pk, 'tcp.flags.reset == 1 && ip.src == 10.20.0.14')).toBe(CAFE.scanPorts.length - 1);
    const open = applyFilter(pk, 'tcp.flags.syn == 1 && tcp.flags.ack == 1 && ip.src == 10.20.0.14');
    if (!open.ok) throw new Error();
    expect(open.shown.map((p) => p.sport)).toContain(445);
  });
  it('Follow TCP Stream rebuilds the request with its cookie', () => {
    const s = streamCapture(CAFE);
    const f = followStream(s.packets, s.maraStream)!;
    expect(f.filter).toBe(`tcp.stream eq ${s.maraStream}`);
    expect(f.parts[0]).toMatchObject({ from: 'client' });
    expect(f.parts[0]!.text).toMatch(/GET \/account HTTP\/1\.1\nHost: shop\.lantern\.example[\s\S]*Cookie: sid=a7f3c21e9b04/);
    expect(f.parts[1]!.text).toMatch(/^HTTP\/1\.1 200 OK/);
    expect(f.encrypted).toBe(false);
  });
  it('a TLS stream shows only that it is encrypted, and the SNI', () => {
    const pk = filterCapture(CAFE);
    const hello = pk.find((p) => p.tls?.sni === CAFE.payHost)!;
    const f = followStream(pk, hello.tcp!.stream)!;
    expect(f.encrypted).toBe(true);
    expect(f.parts.map((x) => x.text).join('\n')).not.toMatch(/GET|Cookie/);
  });
  it('Conversations puts the internal backup first and the theft second, so size alone misleads', () => {
    const b = harborCapture(HARBOR);
    const c = conversations(b.packets);
    expect([c[0]!.a, c[0]!.b].sort()).toEqual(['10.0.8.30', '10.0.8.40']);
    expect([c[1]!.a, c[1]!.b]).toContain(HARBOR.dest);
  });
  it('every detail line with a field can be applied as a filter, and that filter finds the packet', () => {
    const pk = streamCapture(CAFE).packets;
    for (const p of pk.slice(0, 40)) {
      for (const sec of details(p)) for (const l of sec.lines) {
        const f = asFilter(l);
        if (!f) continue;
        const r = applyFilter(pk, f);
        expect(r.ok, f).toBe(true);
        if (r.ok) expect(r.shown.some((x) => x.no === p.no), f).toBe(true);
      }
    }
  });
});

describe('the guided levels', () => {
  for (const l of CAPTURE_LEVELS) {
    it(`${l.id}: Show me clears it, and nothing is cleared before`, () => {
      const actions: CaptureAction[] = [];
      for (const st of l.showMe) {
        const a = st.act!;
        if (a.filter !== undefined) actions.push({ t: 'apply', text: a.filter });
        if (a.select !== undefined) actions.push({ t: 'select', no: a.select });
        if (a.follow) actions.push({ t: 'follow' });
        if (a.stats) actions.push({ t: 'stats' });
        if (a.answer) {
          expect(judgeCapture(l, a.answer).correct, a.answer).toBe(true);
          actions.push({ t: 'answer', text: a.answer });
        }
      }
      const s = runCapture(l.packets, actions);
      expect(Object.values(evaluateCapture(l, s)).every(Boolean), JSON.stringify(evaluateCapture(l, s))).toBe(true);
      expect(Object.values(evaluateCapture(l, initialCapture())).some(Boolean)).toBe(false);
    });
    it(`${l.id}: every filter named in the steps parses`, () => {
      for (const c of l.checks) for (const m of c.do.matchAll(/`([^`]+)`/g)) {
        const code = m[1]!;
        if (/^(ip|tcp|http|dns|tls|udp)\b|^(http|dns|tls)$/.test(code) && /[=.]|^(http|dns|tls)$/.test(code) && !/\[|^GET|^POST|:$|=$/.test(code)) expect(parseFilter(code).ok, `${l.id}: ${code}`).toBe(true);
      }
    });
  }
  it('wrong answers get a reason that says what to look at', () => {
    const l = CAPTURE_LEVELS.find((x) => x.id === 'pcap-boss')!;
    expect(judgeCapture(l, '10.0.8.30').reason).toMatch(/backup/);
  });
});
