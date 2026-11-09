import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CODEX_BY_ID } from '../content/codex';
import { useStore } from '../state/store';

/** Turns "[[codex-id|words]]" into hoverable, tappable terms. Everything else is plain text. */
export function Rich({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /\[\[([\w-]+)\|([^\]]+)\]\]/g;
  let last = 0;
  let i = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<Term key={i++} id={m[1]!}>{m[2]}</Term>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** Strip the term markup, for places that need plain text. */
export function plain(text: string): string {
  return text.replace(/\[\[[\w-]+\|([^\]]+)\]\]/g, '$1');
}

export function Term({ id, children }: { id: string; children: ReactNode }) {
  const entry = CODEX_BY_ID[id];
  const { save } = useStore();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
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

  if (!entry) return <>{children}</>;
  const known = save.codex.includes(id);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="term-link"
        aria-expanded={open}
        onClick={() => {
          if (viaHover.current) {
            viaHover.current = false;
            setOpen(true);
          } else setOpen((o) => !o);
        }}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return;
          viaHover.current = true;
          setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return;
          viaHover.current = false;
          setOpen(false);
        }}
        onBlur={() => setOpen(false)}
      >
        {children}
      </button>
      {open && (
        <div ref={pop} className="term-pop" role="tooltip" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
          <strong>{entry.title}</strong>
          <p>{entry.short}</p>
          <p className="meta">{known ? 'In your codex.' : 'Goes into your codex when you clear a level that uses it.'}</p>
        </div>
      )}
    </>
  );
}
