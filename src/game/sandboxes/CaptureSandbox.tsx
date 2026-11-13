import { useEffect, useMemo, useRef, useState } from 'react';
import type { CaptureAct, CaptureLevel } from '../../content/types';
import { applyFilter, asFilter, conversations, details, followStream, initialCapture, parseFilter, reduceCapture, suggest, type CaptureAction, type CaptureState, type Packet } from '../../sim/pcap';
import { evaluateCapture, judgeCapture } from '../evaluateCapture';
import { Panes } from '../Panes';
import { StartHint } from '../StartHint';
import type { SandboxProps } from '../types';
import { play } from '../../engine/audio';
import '../../styles/capture.css';

/** The short reference beside the capture, one topic per level, all reachable. */
const HELP: Record<NonNullable<CaptureLevel['manual']>, { title: string; rows: [string, string][] }> = {
  filters: {
    title: 'Display filters',
    rows: [
      ['http', 'a protocol on its own: http, dns, tls, arp, tcp, udp'],
      ['ip.addr == 10.20.0.14', 'either end is that address'],
      ['ip.src == 10.20.0.14', 'sent by it (ip.dst: sent to it)'],
      ['ip.dst == 10.0.8.0/24', 'a whole range'],
      ['tcp.port == 443', 'either port (tcp.srcport, tcp.dstport)'],
      ['a && b', 'both (also: and)'],
      ['a || b', 'either (also: or)'],
      ['!(a)', 'not (also: not)'],
      ['http.request', 'requests only (http.response for answers)'],
    ],
  },
  flags: {
    title: 'TCP flags',
    rows: [
      ['[SYN]', 'please connect'],
      ['[SYN, ACK]', 'yes: the port is open'],
      ['[ACK]', 'got it'],
      ['[RST, ACK]', 'no: nothing listens on that port'],
      ['[FIN, ACK]', 'done, closing'],
      ['tcp.flags.syn == 1', 'packets with SYN set (1 set, 0 not)'],
      ['tcp.flags.reset == 1', 'resets'],
      ['tcp.stream == 0', 'one whole connection'],
    ],
  },
  dns: {
    title: 'DNS fields',
    rows: [
      ['dns', 'every lookup and answer'],
      ['dns.qry.name == "a.example"', 'one exact name'],
      ['dns.qry.name contains "lantern"', 'names with that text; quotes needed'],
      ['dns.flags.response == 1', 'answers only (0: questions)'],
      ['dns.a == 203.0.113.10', 'answers pointing at an address'],
    ],
  },
  follow: {
    title: 'Streams and HTTP',
    rows: [
      ['Follow TCP Stream', 'select a packet, press it: the whole conversation as text'],
      ['http.cookie', 'requests that carry a cookie'],
      ['http.cookie contains "x"', 'a cookie with that value'],
      ['http.request.method == "POST"', 'forms being sent'],
      ['tls.handshake.type == 1', 'Client Hello: start of each HTTPS connection'],
      ['tls.handshake.extensions_server_name', 'the site name HTTPS still shows (SNI)'],
    ],
  },
};

const fmtTime = (t: number) => t.toFixed(6);

export function CaptureSandbox({ level, onChecks, fail, act }: SandboxProps<CaptureLevel, CaptureAct>) {
  const [s, setS] = useState<CaptureState>(initialCapture);
  const [draft, setDraft] = useState('');
  const [answer, setAnswer] = useState('');
  const [side, setSide] = useState<'stream' | 'stats' | null>(null);
  const [topic, setTopic] = useState<NonNullable<CaptureLevel['manual']>>(level.manual ?? 'filters');
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const dispatch = (a: CaptureAction) => setS((x) => reduceCapture(level.packets, x, a));

  useEffect(() => {
    onChecks(evaluateCapture(level, s));
  }, [s, level, onChecks]);

  const shown = useMemo(() => {
    const last = s.applied[s.applied.length - 1];
    if (!last) return level.packets;
    const set = new Set(last.shown);
    return level.packets.filter((p) => set.has(p.no));
  }, [s.applied, level.packets]);

  const selected = level.packets.find((p) => p.no === s.selected) ?? null;
  const live = parseFilter(draft);
  const word = !live.ok ? /^"([^"]+)" is neither/.exec(live.error)?.[1] : undefined;
  const hint = word ? suggest(word) : null;
  const errText = draft.trim() && !live.ok ? live.error : s.error && draft.trim() === s.filter ? s.error : null;

  const apply = (text: string) => {
    const r = applyFilter(level.packets, text);
    setDraft(text);
    dispatch({ t: 'apply', text });
    if (!r.ok) {
      play('miss');
      return;
    }
    play('tick');
    listRef.current?.scrollTo({ top: 0 });
  };

  const follow = () => {
    if (!selected?.tcp) return;
    dispatch({ t: 'follow' });
    setDraft(`tcp.stream eq ${selected.tcp.stream}`);
    setSide('stream');
    setFocus({ id: 'side', nonce: Date.now() });
    play('tick');
  };

  const stats = () => {
    dispatch({ t: 'stats' });
    setSide('stats');
    setFocus({ id: 'side', nonce: Date.now() });
  };

  const check = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const v = judgeCapture(level, t);
    if (v.correct) {
      dispatch({ t: 'answer', text: t });
      setAnswer('');
      play('blip');
    } else fail(v.reason);
  };

  useEffect(() => {
    if (!act) return;
    const a = act.act;
    if (a.filter !== undefined) apply(a.filter);
    if (a.select !== undefined) dispatch({ t: 'select', no: a.select });
    if (a.follow) {
      setS((x) => reduceCapture(level.packets, x, { t: 'follow' }));
      const p = level.packets.find((x) => x.no === a.select);
      if (p?.tcp) setDraft(`tcp.stream eq ${p.tcp.stream}`);
      setSide('stream');
    }
    if (a.stats) stats();
    if (a.answer) {
      setAnswer(a.answer);
      check(a.answer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [act]);

  const stream = side === 'stream' && s.followed.length ? followStream(level.packets, s.followed[s.followed.length - 1]!) : null;
  const convs = side === 'stats' ? conversations(level.packets) : [];

  const capture = (
    <div className="ws">
      <form
        className="ws-bar"
        onSubmit={(e) => {
          e.preventDefault();
          apply(draft);
        }}
      >
        <label htmlFor="ws-filter" className="ws-bar-label">
          Filter
        </label>
        <input
          id="ws-filter"
          className="field mono ws-filter"
          aria-label="Display filter"
          placeholder="Apply a display filter, like http or ip.addr == 10.20.0.14"
          value={draft}
          data-valid={draft.trim() ? (live.ok ? 'yes' : 'no') : undefined}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary ws-apply">
          Apply
        </button>
      </form>
      <StartHint text="Type the filter from the step here and press Enter." arrow="up" />
      <div className="ws-tools">
        <p className="ws-status small" aria-live="polite">
          {errText ? (
            <span className="ws-err">
              {errText}
              {hint ? ` Did you mean ${hint}?` : ''}
            </span>
          ) : (
            <>
              Displayed <b className="tnum">{shown.length}</b> of <span className="tnum">{level.packets.length}</span>
              {s.filter ? (
                <>
                  {' '}
                  with <code className="mono">{s.filter}</code>
                </>
              ) : null}
            </>
          )}
        </p>
        <div className="ws-tool-btns">
          <button type="button" className="btn btn-ghost btn-sm" onClick={follow} disabled={!selected?.tcp}>
            Follow TCP Stream
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={stats}>
            Conversations
          </button>
          {s.filter ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => apply('')}>
              Clear
            </button>
          ) : null}
        </div>
      </div>
      <div className="ws-list" ref={listRef}>
        <table className="ws-table">
          <thead>
            <tr>
              <th scope="col">No.</th>
              <th scope="col">Time</th>
              <th scope="col">Source</th>
              <th scope="col">Destination</th>
              <th scope="col">Protocol</th>
              <th scope="col">Length</th>
              <th scope="col">Info</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => (
              <Row key={p.no} p={p} on={p.no === s.selected} pick={() => dispatch({ t: 'select', no: p.no })} />
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? <p className="ws-none small">No packet matches this filter.</p> : null}
      </div>
      <div className="ws-details" aria-label="Packet details">
        {selected ? (
          details(selected).map((sec, i) => (
            <details key={i} open={i > 0}>
              <summary>{sec.title}</summary>
              <ul>
                {sec.lines.map((l, j) => {
                  const f = asFilter(l);
                  return (
                    <li key={j}>
                      <span className="mono">{l.text}</span>
                      {l.field ? <span className="ws-field mono">{l.field}</span> : null}
                      {f ? (
                        <button type="button" className="ws-asf" onClick={() => apply(f)} aria-label={`Apply as filter: ${f}`} title={`Apply as filter: ${f}`}>
                          Filter
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </details>
          ))
        ) : (
          <p className="ws-none small">Click a packet in the list to see its layers and the filter name of each field.</p>
        )}
      </div>
    </div>
  );

  const help = HELP[topic];
  const sidePane = (
    <div className="ws-side">
      {stream ? (
        <section className="ws-card" aria-label="Follow TCP Stream">
          <div className="ws-card-head">
            <h3>
              Follow TCP Stream <span className="mono muted">(tcp.stream eq {stream.stream})</span>
            </h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSide(null)}>
              Close
            </button>
          </div>
          <p className="small muted ws-legend">
            <span className="ws-c">{stream.client}</span> client, <span className="ws-s">{stream.server}</span> server
          </p>
          <pre className="ws-stream" data-encrypted={stream.encrypted}>
            {stream.parts.map((pt, i) => (
              <span key={i} className={pt.from === 'client' ? 'ws-c' : 'ws-s'}>
                {pt.text}
                {'\n'}
              </span>
            ))}
            {stream.parts.length === 0 ? <span className="muted">(no data in this connection: handshake and close only)</span> : null}
          </pre>
        </section>
      ) : null}
      {side === 'stats' ? (
        <section className="ws-card" aria-label="Conversations">
          <div className="ws-card-head">
            <h3>Conversations, IPv4</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSide(null)}>
              Close
            </button>
          </div>
          <div className="ws-conv-wrap">
            <table className="ws-conv">
              <thead>
                <tr>
                  <th scope="col">Address A</th>
                  <th scope="col">Address B</th>
                  <th scope="col">Packets</th>
                  <th scope="col">Bytes</th>
                  <th scope="col">A → B</th>
                  <th scope="col">B → A</th>
                </tr>
              </thead>
              <tbody>
                {convs.map((c) => (
                  <tr key={c.a + c.b}>
                    <td className="mono">{c.a}</td>
                    <td className="mono">{c.b}</td>
                    <td className="tnum">{c.packets}</td>
                    <td className="tnum">{c.bytes.toLocaleString('en-GB')}</td>
                    <td className="tnum">{c.aToB.toLocaleString('en-GB')}</td>
                    <td className="tnum">{c.bToA.toLocaleString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      <section className="ws-card" aria-label="Case notes">
        <h3>
          <span className="mono">{level.file}</span>
        </h3>
        <ul className="ws-notes">
          {level.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
        <form
          className="ws-answer"
          onSubmit={(e) => {
            e.preventDefault();
            check(answer);
          }}
        >
          <label className="lbl" htmlFor="ws-answer">
            {level.question}
          </label>
          <div className="row">
            <input id="ws-answer" className="field mono grow" value={answer} onChange={(e) => setAnswer(e.target.value)} spellCheck={false} autoCapitalize="off" />
            <button type="submit" className="btn btn-primary">
              Check
            </button>
          </div>
          {s.answers.length ? <p className="small ws-ok">Accepted: {s.answers.join(', ')}</p> : null}
        </form>
      </section>
      <section className="ws-card" aria-label="Filter reference">
        <div className="ws-topics" role="tablist" aria-label="Reference topics">
          {(Object.keys(HELP) as (keyof typeof HELP)[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={topic === k} className="ws-topic" onClick={() => setTopic(k)}>
              {HELP[k].title}
            </button>
          ))}
        </div>
        <dl className="ws-help">
          {help.rows.map(([k, v]) => (
            <div key={k}>
              <dt className="mono">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );

  return (
    <Panes
      hint="capture"
      focus={focus}
      grid={{ gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)' }}
      panes={[
        { id: 'capture', label: 'Capture', head: <span className="mono small">{level.file}</span>, body: capture, bodyClass: 'flush' },
        { id: 'side', label: stream ? 'Stream' : side === 'stats' ? 'Conversations' : 'Notes', dot: !!stream || side === 'stats', body: sidePane },
      ]}
    />
  );
}

function Row({ p, on, pick }: { p: Packet; on: boolean; pick: () => void }) {
  const tone = p.tcp?.flags.includes('RST') ? 'rst' : p.tcp?.flags.includes('SYN') || p.tcp?.flags.includes('FIN') ? 'ctl' : p.proto === 'HTTP' ? 'http' : p.proto === 'DNS' || p.proto === 'MDNS' ? 'dns' : p.proto === 'TLSv1.3' ? 'tls' : p.proto === 'ARP' || p.proto === 'SSDP' || p.proto === 'NTP' ? 'misc' : 'tcp';
  return (
    <tr
      data-tone={tone}
      data-on={on}
      aria-selected={on}
      tabIndex={0}
      onClick={pick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      }}
    >
      <td className="tnum">{p.no}</td>
      <td className="tnum">{fmtTime(p.t)}</td>
      <td className="mono">{p.src}</td>
      <td className="mono">{p.dst}</td>
      <td>{p.proto}</td>
      <td className="tnum">{p.len}</td>
      <td className="mono ws-info">{p.info}</td>
    </tr>
  );
}
