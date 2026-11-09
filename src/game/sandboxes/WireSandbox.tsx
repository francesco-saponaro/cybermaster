import { useEffect, useReducer, useRef, useState } from 'react';
import type { WireAct, WireLevel, WireState, ConsoleRun, WireExchange } from '../../content/types';
import {
  parseRequest,
  parseResponseHead,
  serializeResponseHead,
  applySetCookies,
  documentCookie,
  header,
  base64UrlDecode,
  base64UrlEncode,
  statusLine,
  type HttpRequest,
  type HttpResponse,
  type StoredCookie,
  type PageView,
} from '../../sim/http';
import { SERVERS, corsReport } from '../../sim/wire';
import { play } from '../../engine/audio';
import { Panes } from '../Panes';
import { Editor } from '../Editor';
import type { SandboxProps } from '../types';

// ---- The model: a reducer so Show me can replay several steps in order ----

interface Intercepted {
  req: HttpRequest;
  res: HttpResponse;
  text: string;
}

interface Model {
  reqText: string;
  exchanges: WireExchange[];
  forwarded: HttpResponse[];
  console: ConsoleRun[];
  jar: StoredCookie[];
  page: { url: string; res: HttpResponse } | null;
  intercepted: Intercepted | null;
  /** A failure for the shell to flash, with a nonce so repeats register. */
  failure: { reason: string; nonce: number } | null;
  alert: string | null;
  sends: number;
  focus: { id: string; nonce: number } | null;
}

type Action =
  | { t: 'req'; text: string }
  | { t: 'path'; path: string }
  | { t: 'jwt'; header?: string; payload?: string; signature?: string }
  | { t: 'send' }
  | { t: 'resp'; text: string }
  | { t: 'forward' }
  | { t: 'console'; input: string }
  | { t: 'dismiss' };

export function replacePath(raw: string, path: string): string {
  return raw.replace(/^(\s*\w+)\s+\S+/, `$1 ${path}`);
}

/** Split the bearer token of a raw request into its three decoded parts (any text, not only JSON). */
export function tokenParts(raw: string): { header: string; payload: string; signature: string } | null {
  const m = /^Authorization:\s*Bearer\s+(\S*)\s*$/im.exec(raw);
  if (!m) return null;
  const [h = '', p = '', s = ''] = (m[1] ?? '').split('.');
  return { header: base64UrlDecode(h) ?? '', payload: base64UrlDecode(p) ?? '', signature: s };
}

export function rebuildToken(raw: string, parts: { header?: string; payload?: string; signature?: string }): string {
  const cur = tokenParts(raw);
  if (!cur) return raw;
  const h = parts.header ?? cur.header;
  const p = parts.payload ?? cur.payload;
  const s = parts.signature ?? cur.signature;
  const token = `${base64UrlEncode(h)}.${base64UrlEncode(p)}.${s}`;
  return raw.replace(/^(Authorization:\s*Bearer\s+)\S*/im, `$1${token}`);
}

function cookieHeader(jar: StoredCookie[]): string {
  return jar.map((c) => `${c.name}=${c.value}`).join('; ');
}

function makeReducer(level: WireLevel) {
  const server = SERVERS[level.server];
  const fail = (m: Model, reason: string): Model => ({ ...m, failure: { reason, nonce: (m.failure?.nonce ?? 0) + 1 } });
  return function reduce(m: Model, a: Action): Model {
    switch (a.t) {
      case 'req':
        return { ...m, reqText: a.text };
      case 'path':
        return { ...m, reqText: replacePath(m.reqText, a.path) };
      case 'jwt':
        return { ...m, reqText: rebuildToken(m.reqText, a) };
      case 'send': {
        const p = parseRequest(m.reqText);
        if (!p.ok) return fail(m, p.error);
        const res = server(p.req);
        const ex = { req: p.req, res };
        const sends = m.sends + 1;
        if (level.mode === 'response') {
          return { ...m, sends, exchanges: [...m.exchanges, ex], intercepted: { req: p.req, res, text: serializeResponseHead(res) }, focus: { id: 'response', nonce: sends } };
        }
        return { ...m, sends, exchanges: [...m.exchanges, ex], page: { url: level.host + p.req.target, res }, focus: { id: 'browser', nonce: sends } };
      }
      case 'resp':
        return m.intercepted ? { ...m, intercepted: { ...m.intercepted, text: a.text } } : m;
      case 'forward': {
        if (!m.intercepted) return fail(m, 'Nothing is waiting in the proxy: Send the request first.');
        const head = parseResponseHead(m.intercepted.text);
        if (!head.ok) return fail(m, head.error);
        const final: HttpResponse = { ...m.intercepted.res, status: head.status, headers: head.headers };
        const jar = applySetCookies(m.jar, head.headers);
        let next: Model = { ...m, forwarded: [...m.forwarded, final], jar, intercepted: null, page: { url: level.host + m.intercepted.req.target, res: final }, focus: { id: 'browser', nonce: m.sends + 1000 } };
        // After a login the browser loads the account page, sending every cookie it holds.
        if (level.server === 'httponly' && m.intercepted.req.path === '/login') {
          const raw = `GET /account HTTP/1.1\nHost: ${level.host}\nCookie: ${cookieHeader(jar)}`;
          const p = parseRequest(raw);
          if (p.ok) {
            const res = server(p.req);
            next = { ...next, exchanges: [...next.exchanges, { req: p.req, res }], page: { url: level.host + '/account', res } };
          }
        }
        return next;
      }
      case 'console': {
        const input = a.input.trim();
        let output: string;
        let alert: string | null = null;
        if (/^document\.cookie;?$/.test(input)) output = JSON.stringify(documentCookie(m.jar));
        else if (/^document\.domain;?$/.test(input)) output = JSON.stringify(level.host);
        else if (/^(window\.)?alert\((.*)\);?$/.test(input)) {
          const arg = /^(?:window\.)?alert\((.*)\);?$/.exec(input)?.[1] ?? '';
          alert = /document\.cookie/.test(arg) ? documentCookie(m.jar) : arg.replace(/^['"`]|['"`]$/g, '');
          output = 'undefined';
        } else if (input === '') return m;
        else output = 'This console only runs document.cookie, document.domain and alert(...) here.';
        return { ...m, console: [...m.console, { input, output }], alert };
      }
      case 'dismiss':
        return { ...m, alert: null };
    }
  };
}

function actionsFor(act: WireAct): Action[] {
  const out: Action[] = [];
  if (act.request !== undefined) out.push({ t: 'req', text: act.request });
  if (act.path !== undefined) out.push({ t: 'path', path: act.path });
  if (act.jwtHeader !== undefined || act.jwtPayload !== undefined || act.jwtSignature !== undefined) out.push({ t: 'jwt', header: act.jwtHeader, payload: act.jwtPayload, signature: act.jwtSignature });
  if (act.send) out.push({ t: 'send' });
  if (act.response !== undefined) out.push({ t: 'resp', text: act.response });
  if (act.forward) out.push({ t: 'forward' });
  if (act.console !== undefined) out.push({ t: 'console', input: act.console });
  return out;
}

export function WireSandbox({ level, onChecks, fail, act }: SandboxProps<WireLevel, WireAct>) {
  const reducer = useRef(makeReducer(level)).current;
  const [m, dispatch] = useReducer(reducer, null, () => ({
    reqText: level.request,
    exchanges: [],
    forwarded: [],
    console: [],
    jar: [],
    page: null,
    intercepted: null,
    failure: null,
    alert: null,
    sends: 0,
    focus: null,
  }));
  const [pulse, setPulse] = useState(0);

  const state: WireState = { exchanges: m.exchanges, forwarded: m.forwarded, console: m.console, jar: m.jar };
  useEffect(() => {
    onChecks(level.evaluate(state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.exchanges, m.forwarded, m.console, m.jar]);

  useEffect(() => {
    if (m.failure) fail(m.failure.reason);
  }, [m.failure, fail]);

  useEffect(() => {
    if (!act) return;
    for (const a of actionsFor(act.act)) dispatch(a);
  }, [act]);

  const send = () => {
    setPulse((p) => p + 1);
    play('blip');
    dispatch({ t: 'send' });
  };

  const lastEx = m.exchanges[m.exchanges.length - 1];
  const parts = level.jwt ? tokenParts(m.reqText) : null;

  const browser = (
    <MiniBrowser
      level={level}
      model={m}
      onNavigate={(path) => {
        dispatch({ t: 'path', path });
        send();
      }}
      onConsole={(input) => dispatch({ t: 'console', input })}
      onDismiss={() => dispatch({ t: 'dismiss' })}
    />
  );

  const request = (
    <div className="stack-12" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {level.captured ? (
        <div className="pane-pad" style={{ paddingBottom: 0 }}>
          <p className="lbl">Proxy history</p>
          <ul className="rowlist">
            {level.captured.map((c) => (
              <li key={c.label} className="row" style={{ padding: '6px 0' }}>
                <span className="grow mono small">{c.label}</span>
                <button type="button" className="cbtn cbtn-sm" onClick={() => dispatch({ t: 'req', text: c.raw })}>
                  Load
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 170 }}>
        <Editor label="Raw HTTP request" value={m.reqText} onChange={(text) => dispatch({ t: 'req', text })} minRows={5} />
      </div>
      {parts ? (
        <div className="pane-pad" style={{ borderTop: '1px solid var(--line)' }}>
          <p className="lbl">The token in the Authorization header, decoded</p>
          <div className="stack-12" style={{ gap: 8 }}>
            <label className="small muted" htmlFor="jwt-h">Header</label>
            <input id="jwt-h" className="field mono" value={parts.header} spellCheck={false} onChange={(e) => dispatch({ t: 'jwt', header: e.target.value })} />
            <label className="small muted" htmlFor="jwt-p">Payload</label>
            <input id="jwt-p" className="field mono" value={parts.payload} spellCheck={false} onChange={(e) => dispatch({ t: 'jwt', payload: e.target.value })} />
            <label className="small muted" htmlFor="jwt-s">Signature</label>
            <input id="jwt-s" className="field mono" value={parts.signature} spellCheck={false} onChange={(e) => dispatch({ t: 'jwt', signature: e.target.value })} />
          </div>
        </div>
      ) : null}
    </div>
  );

  const response = level.mode === 'response' ? (
    <InterceptPane model={m} onEdit={(text) => dispatch({ t: 'resp', text })} onForward={() => {
      play('blip');
      dispatch({ t: 'forward' });
    }} />
  ) : lastEx ? (
    <RawResponse key={m.sends} res={lastEx.res} />
  ) : (
    <p className="pane-pad muted small">The server's answer appears here after you press Send.</p>
  );

  return (
    <Panes
      focus={m.focus}
      grid={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gridTemplateRows: level.jwt ? 'minmax(0, 1.5fr) minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)' }}
      panes={[
        { id: 'browser', label: 'Browser', body: browser, style: { gridRow: '1 / span 2' }, dot: !!m.page },
        {
          id: 'request',
          label: 'Request',
          head: (
            <>
              <h2>Request</h2>
              <span className="small muted mono">{level.host}</span>
              <span className="spacer" />
              <button type="button" key={pulse} className={`cbtn cbtn-go cbtn-sm${pulse ? ' pulse' : ''}`} onClick={send}>
                Send
              </button>
            </>
          ),
          body: request,
          bodyClass: 'req-body',
        },
        {
          id: 'response',
          label: level.mode === 'response' ? 'Proxy' : 'Response',
          dot: level.mode === 'response' ? !!m.intercepted : !!lastEx,
          head: (
            <>
              <h2>{level.mode === 'response' ? 'Proxy: response held' : 'Response'}</h2>
              <span className="spacer" />
              {level.mode === 'request' && lastEx ? <StatusChip status={lastEx.res.status} /> : null}
            </>
          ),
          body: response,
        },
      ]}
    />
  );
}

function StatusChip({ status }: { status: number }) {
  const tone = status < 300 ? 'good' : status < 500 ? 'warn' : 'bad';
  return (
    <span className="status" data-tone={tone}>
      {statusLine(status).replace('HTTP/1.1 ', '')}
    </span>
  );
}

function RawResponse({ res }: { res: HttpResponse }) {
  return (
    <pre className="raw-pre slide-in">
      {serializeResponseHead(res)}
      {'\n\n'}
      {res.body}
    </pre>
  );
}

function InterceptPane({ model, onEdit, onForward }: { model: Model; onEdit: (t: string) => void; onForward: () => void }) {
  const it = model.intercepted;
  if (!it) {
    const last = model.forwarded[model.forwarded.length - 1];
    return (
      <div className="pane-pad">
        <p className="small muted" style={{ marginTop: 0 }}>
          {last ? 'Forwarded to the browser. Send again to hold a fresh response here.' : 'Press Send: the response stops here so you can change it before the browser sees it.'}
        </p>
        {last ? <pre className="raw-pre" style={{ padding: 0 }}>{serializeResponseHead(last)}</pre> : null}
      </div>
    );
  }
  return (
    <div className="slide-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 150 }}>
        <Editor label="Held response headers" value={it.text} onChange={onEdit} minRows={6} />
      </div>
      <div className="row pane-pad" style={{ borderTop: '1px solid var(--line)' }}>
        <span className="grow small muted">Body: {it.res.body.length} bytes, unchanged</span>
        <button type="button" className="cbtn cbtn-go cbtn-sm" onClick={onForward}>
          Forward
        </button>
      </div>
    </div>
  );
}

function PageBlocks({ view }: { view: PageView }) {
  return (
    <>
      {view.blocks.map((b, i) => {
        switch (b.t) {
          case 'h':
            return <h3 key={i}>{b.text}</h3>;
          case 'p':
            return <p key={i}>{b.text}</p>;
          case 'alert':
            return (
              <div key={i} className="note" data-tone={b.tone}>
                {b.text}
              </div>
            );
          case 'list':
            return (
              <ul key={i}>
                {b.items.map((it) => (
                  <li key={it}>{it}</li>
                ))}
              </ul>
            );
          case 'kv':
            return (
              <dl key={i}>
                {b.rows.map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            );
          default:
            return <pre key={i}>{b.text}</pre>;
        }
      })}
    </>
  );
}

function MiniBrowser({ level, model, onNavigate, onConsole, onDismiss }: { level: WireLevel; model: Model; onNavigate: (path: string) => void; onConsole: (s: string) => void; onDismiss: () => void }) {
  const current = model.page?.url.slice(level.host.length) || (parseRequest(model.reqText).ok ? (parseRequest(model.reqText) as { req: HttpRequest }).req.target : '/');
  const [addr, setAddr] = useState(current);
  const [cmd, setCmd] = useState('');
  useEffect(() => setAddr(current), [current]);
  const res = model.page?.res;
  const isCors = level.server === 'cors';
  const editableUrl = level.mode === 'request';
  return (
    <div className="mb">
      <form
        className="mb-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (!editableUrl) return;
          const path = addr.startsWith('/') ? addr : '/' + addr;
          onNavigate(path);
        }}
      >
        <div className="mb-url">
          <span className="host">https://{level.host}</span>
          <input aria-label="Address bar path" value={addr} onChange={(e) => setAddr(e.target.value)} readOnly={!editableUrl} spellCheck={false} autoCapitalize="off" />
        </div>
        {res ? <StatusChip status={res.status} /> : null}
      </form>
      <div className={`mb-page${res && !res.view ? ' plain' : ''}`} key={model.sends + model.forwarded.length}>
        {isCors ? (
          <CorsView model={model} />
        ) : !res ? (
          <p className="mb-blank">Nothing loaded yet. Press Send{editableUrl ? ', or type a path in the address bar' : ''}.</p>
        ) : res.view ? (
          <div className="slide-in">
            <PageBlocks view={res.view} />
          </div>
        ) : (
          <pre className="slide-in">{res.body}</pre>
        )}
        {model.alert !== null ? (
          <div className="fake-alert">
            <div className="fake-alert-box" role="alertdialog" aria-label="Page alert">
              <p>{level.host} says</p>
              <strong>{model.alert || ' '}</strong>
              <button type="button" className="appbtn" onClick={onDismiss}>OK</button>
            </div>
          </div>
        ) : null}
      </div>
      {level.console ? (
        <div className="srvlog" style={{ maxHeight: 180 }}>
          <div className="k">Console</div>
          {model.console.map((c, i) => (
            <div key={i}>
              <span className="k">&gt; </span>
              {c.input}
              {'\n'}
              <span style={{ color: c.output.includes('session=') ? 'var(--bad-ink)' : undefined }}>{c.output}</span>
            </div>
          ))}
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              onConsole(cmd);
              setCmd('');
            }}
          >
            <span className="k">&gt;</span>
            <input
              aria-label="Browser console"
              className="grow mono"
              value={cmd}
              placeholder="document.cookie"
              onChange={(e) => setCmd(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              style={{ background: 'transparent', border: 0, outline: 'none', color: 'var(--ink)', font: 'inherit', minHeight: 32 }}
            />
            <button type="submit" className="cbtn cbtn-sm">Run</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function CorsView({ model }: { model: Model }) {
  const last = model.forwarded[model.forwarded.length - 1];
  if (!last) {
    return <p className="mb-blank">Two pages call this API with Sam's cookies: his bank's dashboard, and a page an attacker lured him to. Send the request and Forward the response to see what each one can read.</p>;
  }
  const r = corsReport(last.headers);
  const data = JSON.parse(last.body) as { owner: string; iban: string; balance: string };
  const hsts = header(last.headers, 'strict-transport-security');
  return (
    <div className="slide-in">
      <h3 style={{ fontSize: '1.1rem' }}>bank.example, Sam's dashboard</h3>
      {r.bank.allowed ? (
        <div className="note" data-tone="good">Balance {data.balance}. The page can read its own API.</div>
      ) : (
        <div className="note" data-tone="bad">Blocked: {r.bank.reason} Sam's own bank page is broken.</div>
      )}
      <h3 style={{ fontSize: '1.1rem', marginTop: 18 }}>evil.example, a page Sam was lured to</h3>
      {r.evil.allowed ? (
        <div className="note" data-tone="bad">
          Read it all: {data.owner}, {data.iban}, {data.balance}.
        </div>
      ) : (
        <div className="note" data-tone="good">The browser hides the response: {r.evil.reason}</div>
      )}
      <p style={{ fontSize: '0.9rem', marginTop: 14 }}>
        Session cookie: {r.cookie ? [r.cookie.httpOnly ? 'HttpOnly' : 'readable by scripts', r.cookie.secure ? 'Secure' : 'sent over plain HTTP', r.cookie.sameSite ? `SameSite=${r.cookie.sameSite}` : 'sent on cross-site requests'].join(', ') : 'none set'}.
        <br />
        HTTPS only: {hsts ? hsts : 'not enforced (no Strict-Transport-Security)'}.
      </p>
    </div>
  );
}
