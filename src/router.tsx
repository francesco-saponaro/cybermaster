import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Outlet, redirect } from '@tanstack/react-router';
import { TopBar } from './components/Hud';
import { HomePage } from './routes/Home';
import { ZonePage } from './routes/Zone';

function SiteLayout() {
  return (
    <div className="page">
      <TopBar />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <footer className="footer">
        <div className="wrap">CyberMaster. A learning game, for practice on labs and systems you are authorised to test.</div>
      </footer>
    </div>
  );
}

// The title, the route and the zone maps load first; the sandboxes, the codex,
// the profile and the case board load when they are opened.
const LevelRoute = () => import('./routes/LevelRoute');

const rootRoute = createRootRoute({ component: Outlet });
const site = createRoute({ getParentRoute: () => rootRoute, id: 'site', component: SiteLayout });

const indexRoute = createRoute({ getParentRoute: () => site, path: '/', component: HomePage });
const zoneRoute = createRoute({ getParentRoute: () => site, path: 'zones/$zoneId', component: ZonePage });
const codexRoute = createRoute({ getParentRoute: () => site, path: 'codex', component: lazyRouteComponent(() => import('./routes/Codex'), 'CodexPage') });
const profileRoute = createRoute({ getParentRoute: () => site, path: 'profile', component: lazyRouteComponent(() => import('./routes/Profile'), 'ProfilePage') });
const caseRoute = createRoute({ getParentRoute: () => site, path: 'case', component: lazyRouteComponent(() => import('./routes/Case'), 'CasePage') });
const endingRoute = createRoute({ getParentRoute: () => site, path: 'ending', component: lazyRouteComponent(() => import('./routes/Case'), 'EndingPage') });
const levelRoute = createRoute({ getParentRoute: () => rootRoute, path: 'play/$levelId', component: lazyRouteComponent(LevelRoute, 'LevelPage') });
const challengeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'challenge/$levelId',
  validateSearch: (search: Record<string, unknown>): { seed?: number } => {
    const n = Number(search.seed);
    return Number.isFinite(n) && n >= 0 && search.seed !== undefined && search.seed !== '' ? { seed: Math.floor(n) >>> 0 } : {};
  },
  component: lazyRouteComponent(LevelRoute, 'ChallengePage'),
});
const seedSearch = (search: Record<string, unknown>): { seed?: number } => {
  const n = Number(search.seed);
  return Number.isFinite(n) && n >= 0 && search.seed !== undefined && search.seed !== '' ? { seed: Math.floor(n) >>> 0 } : {};
};
const arcadeRoute = createRoute({ getParentRoute: () => site, path: 'arcade', component: lazyRouteComponent(() => import('./routes/Arcade'), 'ArcadePage') });
// Each game is its own chunk, loaded when it is opened.
const forgeryRoute = createRoute({ getParentRoute: () => rootRoute, path: 'arcade/spot-the-forgery', validateSearch: seedSearch, component: lazyRouteComponent(() => import('./arcade/games/SpotTheForgery'), 'SpotTheForgeryPage') });
// The Wire's first arcade game was Packet Runner; old links land on its replacement.
const packetRoute = createRoute({ getParentRoute: () => rootRoute, path: 'arcade/packet-runner', beforeLoad: () => { throw redirect({ to: '/arcade/spot-the-forgery', search: {} }); } });
const towerRoute = createRoute({ getParentRoute: () => rootRoute, path: 'arcade/tower-defence', validateSearch: seedSearch, component: lazyRouteComponent(() => import('./arcade/games/TowerDefence'), 'TowerDefencePage') });
const sweeperRoute = createRoute({ getParentRoute: () => rootRoute, path: 'arcade/network-sweeper', validateSearch: seedSearch, component: lazyRouteComponent(() => import('./arcade/games/Sweeper'), 'SweeperPage') });
const lockdownRoute = createRoute({ getParentRoute: () => rootRoute, path: 'arcade/lockdown', component: lazyRouteComponent(() => import('./arcade/games/Lockdown'), 'LockdownPage') });
const triageRoute = createRoute({ getParentRoute: () => rootRoute, path: 'arcade/triage-rush', validateSearch: seedSearch, component: lazyRouteComponent(() => import('./arcade/games/Triage'), 'TriagePage') });
const dailyRoute = createRoute({ getParentRoute: () => rootRoute, path: 'daily', component: lazyRouteComponent(LevelRoute, 'DailyPage') });
// Old mission links from the first version of the game land on the zones.
const oldMission = createRoute({
  getParentRoute: () => rootRoute,
  path: 'missions/$missionId',
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
});

const routeTree = rootRoute.addChildren([site.addChildren([indexRoute, zoneRoute, codexRoute, profileRoute, caseRoute, endingRoute, arcadeRoute]), levelRoute, forgeryRoute,
  packetRoute, towerRoute, sweeperRoute, lockdownRoute, triageRoute, challengeRoute, dailyRoute, oldMission]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
