import { useRef } from 'react';

/** A plain textarea with line numbers; `errorLine` marks a line in the gutter. */
export function Editor({ value, onChange, label, errorLine, minRows = 8 }: { value: string; onChange: (v: string) => void; label: string; errorLine?: number | null; minRows?: number }) {
  const gutter = useRef<HTMLDivElement>(null);
  const lines = Math.max(value.split('\n').length, minRows);
  return (
    <div className="editor">
      <div className="editor-gutter" ref={gutter} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className={errorLine === i + 1 ? 'err' : undefined}>
            {i + 1}
          </div>
        ))}
      </div>
      <textarea
        aria-label={label}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        wrap="off"
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Tab' && !e.shiftKey) {
            e.preventDefault();
            const t = e.currentTarget;
            const s = t.selectionStart;
            const next = t.value.slice(0, s) + '  ' + t.value.slice(t.selectionEnd);
            onChange(next);
            requestAnimationFrame(() => t.setSelectionRange(s + 2, s + 2));
          }
        }}
      />
    </div>
  );
}
