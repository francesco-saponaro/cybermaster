import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export interface PaneDef {
  id: string;
  label: string;
  /** Show a small dot on the phone tab: something new happened in this pane. */
  dot?: boolean;
  head?: ReactNode;
  body: ReactNode;
  style?: CSSProperties;
  bodyClass?: string;
}

/**
 * Side by side on wide screens (laid out by `grid`), one at a time with tabs on
 * a phone. `focus` switches the phone tab when something happens elsewhere.
 */
export function Panes({ panes, grid, focus }: { panes: PaneDef[]; grid: CSSProperties; focus?: { id: string; nonce: number } | null }) {
  const [active, setActive] = useState(panes[0]?.id ?? '');
  useEffect(() => {
    if (focus) setActive(focus.id);
  }, [focus]);
  return (
    <>
      <div className="pane-tabs" role="tablist" aria-label="Sandbox panels">
        {panes.map((p) => (
          <button key={p.id} type="button" role="tab" className="tab" aria-selected={active === p.id} onClick={() => setActive(p.id)}>
            {p.label}
            {p.dot && active !== p.id ? <span className="dot" aria-label="(updated)" /> : null}
          </button>
        ))}
      </div>
      <div className="panes" style={grid}>
        {panes.map((p) => (
          <section key={p.id} className="pane" data-active={active === p.id} style={p.style} aria-label={p.label}>
            {p.head !== undefined ? <div className="pane-head">{p.head}</div> : null}
            <div className={`pane-body ${p.bodyClass ?? ''}`}>{p.body}</div>
          </section>
        ))}
      </div>
    </>
  );
}
