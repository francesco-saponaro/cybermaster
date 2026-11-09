import { Link } from '@tanstack/react-router';
import { useStore, zoneShapes } from '../state/store';
import { ARCADE } from '../content/arcade';
import { ZONE_BY_ID } from '../content/zones';
import { LEVEL_BY_ID } from '../content/index';
import { arcadeUnlocked, ARCADE_XP } from '../engine/arcade';
import { Scope } from '../components/Scope';
import { Stars } from '../components/Stars';
import '../styles/arcade-page.css';

const fmt = new Intl.NumberFormat('en-GB');

/** The arcade: one bonus game per zone, each opened by the zone's boss, with the best score of each. */
export function ArcadePage() {
  const { save } = useStore();
  const open = ARCADE.filter((g) => arcadeUnlocked(save, zoneShapes, g.zone)).length;
  const stars = ARCADE.reduce((n, g) => n + (save.arcade[g.id]?.stars ?? 0), 0);
  return (
    <div className="wrap arcade-page">
      <header className="arcade-head">
        <div>
          <h1>The arcade</h1>
          <p className="arcade-lead">Five quick games, one for each zone, built on what its levels teach. Each run lasts a minute or two. Beat a score to earn stars.</p>
        </div>
        <dl className="arcade-totals tnum">
          <div>
            <dt>Open</dt>
            <dd>{open} of {ARCADE.length}</dd>
          </div>
          <div>
            <dt>Stars</dt>
            <dd>{stars} of {ARCADE.length * 3}</dd>
          </div>
        </dl>
      </header>
      <ol className="arcade-list">
        {ARCADE.map((g) => {
          const zone = ZONE_BY_ID[g.zone]!;
          const unlocked = arcadeUnlocked(save, zoneShapes, g.zone);
          const rec = save.arcade[g.id];
          const boss = LEVEL_BY_ID[zone.levelIds[zone.levelIds.length - 1]!]!;
          return (
            <li key={g.id} className="arcade-row" data-open={unlocked}>
              <span className="arcade-mark" aria-hidden="true">
                <Scope size={52} locked={!unlocked} cleared={!!rec && rec.stars >= 3} filled={!!rec} />
              </span>
              <div className="arcade-text">
                <p className="arcade-zone">{zone.name}</p>
                <h2>{g.title}</h2>
                <p className="arcade-tag">{g.tagline}</p>
                <p className="arcade-teaches">{g.teaches}</p>
              </div>
              <div className="arcade-side">
                {unlocked ? (
                  <>
                    <p className="arcade-best tnum">
                      {rec ? (
                        <>
                          <span>Best {fmt.format(rec.best)}</span>
                          <Stars count={rec.stars} size={14} />
                        </>
                      ) : (
                        <span className="muted">Not played yet</span>
                      )}
                    </p>
                    <Link to={`/arcade/${g.id}` as '/arcade/packet-runner'} search={{}} className="btn btn-primary btn-sm arcade-play">
                      {rec ? 'Play again' : 'Play'}
                    </Link>
                  </>
                ) : (
                  <p className="arcade-locked">
                    Opens when you beat {boss.title}, the boss of {zone.name}.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="small muted arcade-foot">XP comes from new stars only, at most {ARCADE_XP[3]} per game, so the arcade never runs ahead of the levels.</p>
    </div>
  );
}
