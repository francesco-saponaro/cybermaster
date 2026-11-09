import { useEffect, useRef } from 'react';
import type { ZoneId } from '../content/types';
import { BEATS, CAST } from '../content/story';
import { ZONE_BY_ID } from '../content/zones';
import { Scope } from './Scope';

/** The short scene at the top of a zone, before its map: three or four lines from the team. Skippable, and replayable from the zone map. */
export function BeatCard({ zoneId, onClose }: { zoneId: ZoneId; onClose: () => void }) {
  const beat = BEATS[zoneId];
  const zone = ZONE_BY_ID[zoneId]!;
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    go.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <section className="beat" aria-labelledby="beat-title">
      <div className="beat-top">
        <Scope size={28} filled />
        <p className="eyebrow" style={{ margin: 0 }}>
          {zone.name} · {beat.title}
        </p>
      </div>
      <h2 id="beat-title" className="sr-only">
        Briefing for {zone.name}
      </h2>
      <ol className="beat-lines">
        {beat.lines.map((l, i) => (
          <li key={i} style={{ animationDelay: `${0.15 + i * 0.45}s` }}>
            <span className="beat-who">
              {l.who}
              <span>{CAST[l.who].role}</span>
            </span>
            <p>{l.text}</p>
          </li>
        ))}
      </ol>
      <div className="beat-actions">
        <button ref={go} type="button" className="btn btn-primary" onClick={onClose}>
          Get to work
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Skip
        </button>
      </div>
    </section>
  );
}
