import { createRootRoute, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router';
import { TopBar } from './components/Hud';
import { HomePage } from './routes/Home';
import { ZonePage } from './routes/Zone';
import { LevelPage } from './routes/LevelRoute';
import { CodexPage } from './routes/Codex';
import { ProfilePage } from './routes/Profile';

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

const rootRoute = createRootRoute({ component: Outlet });
const site = createRoute({ getParentRoute: () => rootRoute, id: 'site', component: SiteLayout });

const indexRoute = createRoute({ getParentRoute: () => site, path: '/', component: HomePage });
const zoneRoute = createRoute({ getParentRoute: () => site, path: 'zones/$zoneId', component: ZonePage });
const codexRoute = createRoute({ getParentRoute: () => site, path: 'codex', component: CodexPage });
const profileRoute = createRoute({ getParentRoute: () => site, path: 'profile', component: ProfilePage });
const levelRoute = createRoute({ getParentRoute: () => rootRoute, path: 'play/$levelId', component: LevelPage });
// Old mission links from the first version of the game land on the zones.
const oldMission = createRoute({
  getParentRoute: () => rootRoute,
  path: 'missions/$missionId',
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
});

const routeTree = rootRoute.addChildren([site.addChildren([indexRoute, zoneRoute, codexRoute, profileRoute]), levelRoute, oldMission]);

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
