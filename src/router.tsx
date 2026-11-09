import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { TopBar } from './components/Hud';
import { HomePage } from './routes/Home';
import { ZonePage } from './routes/Zone';
import { MissionPage } from './routes/MissionRoute';
import { CodexPage } from './routes/Codex';
import { ProfilePage } from './routes/Profile';

function Shell() {
  return (
    <div className="page">
      <TopBar />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <footer className="footer">
        <div className="wrap">
          CyberMaster. A learning game, built for practice on labs and systems you are authorised to test.
        </div>
      </footer>
    </div>
  );
}

const rootRoute = createRootRoute({ component: Shell });

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage });
const zoneRoute = createRoute({ getParentRoute: () => rootRoute, path: 'zones/$zoneId', component: ZonePage });
const missionRoute = createRoute({ getParentRoute: () => rootRoute, path: 'missions/$missionId', component: MissionPage });
const codexRoute = createRoute({ getParentRoute: () => rootRoute, path: 'codex', component: CodexPage });
const profileRoute = createRoute({ getParentRoute: () => rootRoute, path: 'profile', component: ProfilePage });

const routeTree = rootRoute.addChildren([indexRoute, zoneRoute, missionRoute, codexRoute, profileRoute]);

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
