import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type React from 'react';
import type { ReactNode } from 'react';
import { CODEX_BY_ID } from '../content/codex';
import { GLOSS_RE, glossFor, type GlossEntry } from '../content/glossary';
import { useStore } from '../state/store';

/**
 * Turns "[[codex-id|words]]" into hoverable, tappable terms and `text` into a
 * code span (something to type, click or look for). In the plain text left
 * over, the first mention of each glossary word is underlined too and explains
 * itself on hover or tap, so no jargon goes unexplained.
 */
export function Rich({ text, gloss = true, hideCode = false }: { text: string; gloss?: boolean; hideCode?: boolean }) {
  const parts: ReactNode[] = [];
  const seen = new Set<string>();
  const re = /\[\[([\w-]+)\|([^\]]+)\]\]|`([^`]+)`/g;
  let last = 0;
  let i = 0;
  const pushPlain = (chunk: string) => {
    if (!gloss) {
      parts.push(chunk);
      return;
    }
    let at = 0;
    for (const m of chunk.matchAll(GLOSS_RE)) {
      const g = glossFor(m[1]!);
      if (!g || g.inline === false || seen.has(g.id)) continue;
      seen.add(g.id);
      if (m.index! > at) parts.push(chunk.slice(at, m.index));
      parts.push(<Gloss key={i++} entry={g}>{m[1]}</Gloss>);
      at = m.index! + m[0].length;
    }
    if (at < chunk.length) parts.push(chunk.slice(at));
  };
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) pushPlain(text.slice(last, m.index));
    if (m[3] !== undefined && hideCode) parts.push(<span key={i++} className="kbd kbd-hidden" aria-label="hidden: type it from memory">{'•'.repeat(Math.min(14, Math.max(4, m[3].length)))}</span>);
    else if (m[3] !== undefined) parts.push(<code key={i++} className={m[3].length > 24 ? 'kbd kbd-long' : 'kbd'}>{m[3]}</code>);
    else parts.push(<Term key={i++} id={m[1]!}>{m[2]}</Term>);
    last = m.index + m[0].length;
  }
  if (last < text.length) pushPlain(text.slice(last));
  return <>{parts}</>;
}

/** Strip the term and code markup, for places that need plain text. */
export function plain(text: string): string {
  return text.replace(/\[\[[\w-]+\|([^\]]+)\]\]/g, '$1').replace(/`([^`]+)`/g, '$1');
}

/** A word that opens a small explanation on hover (mouse) or tap (touch and keyboard). */
function Pop({ children, label, card, kind }: { children: ReactNode; label?: string; card: ReactNode; kind: 'term' | 'gloss' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLElement>(null);
  const tipId = useId();
  const pop = useRef<HTMLDivElement>(null);
  const viaHover = useRef(false);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 32);
    const left = Math.max(16, Math.min(r.left, window.innerWidth - width - 16));
    const height = pop.current?.offsetHeight ?? 120;
    const below = r.bottom + 8;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 8) : below;
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if (e.type === 'pointerdown' && (btn.current?.contains(e.target as Node) || pop.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const handlers = {
    onClick: () => {
      if (viaHover.current) {
        viaHover.current = false;
        setOpen(true);
      } else setOpen((o) => !o);
    },
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      viaHover.current = true;
      setOpen(true);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      viaHover.current = false;
      setOpen(false);
    },
    onBlur: () => setOpen(false),
  };
  return (
    <>
      {kind === 'term' ? (
        <button ref={btn as React.Ref<HTMLButtonElement>} type="button" className="term-link" aria-expanded={open} aria-label={label} {...handlers}>
          {children}
        </button>
      ) : (
        // A plain-word explanation is a focusable span, not a button, so it never shares a name with the game's own buttons.
        <span
          ref={btn as React.Ref<HTMLSpanElement>}
          className="gloss-link"
          tabIndex={0}
          data-open={open}
          aria-describedby={open ? tipId : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
          {...handlers}
        >
          {children}
        </span>
      )}
      {open && (
        <div ref={pop} id={tipId} className="term-pop" role="tooltip" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
          {card}
        </div>
      )}
    </>
  );
}

export function Gloss({ entry, children }: { entry: GlossEntry; children: ReactNode }) {
  return (
    <Pop kind="gloss" card={<GlossCard entry={entry} />}>
      {children}
    </Pop>
  );
}

export function GlossCard({ entry }: { entry: GlossEntry }) {
  return (
    <>
      <strong>{entry.term}</strong>
      <p>{entry.plain}</p>
      {entry.example ? <code className="gloss-ex">{entry.example}</code> : null}
    </>
  );
}

export function Term({ id, children }: { id: string; children: ReactNode }) {
  const entry = CODEX_BY_ID[id];
  const { save } = useStore();
  if (!entry) return <>{children}</>;
  const known = save.codex.includes(id);
  return (
    <Pop
      kind="term"
      card={
        <>
          <strong>{entry.title}</strong>
          <p>{entry.short}</p>
          <p className="meta">{known ? 'In your codex.' : 'Goes into your codex when you clear a level that uses it.'}</p>
        </>
      }
    >
      {children}
    </Pop>
  );
}
