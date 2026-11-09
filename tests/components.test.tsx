import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreProvider } from '../src/state/store';
import { emptySave } from '../src/engine/save';
import { LevelShell } from '../src/game/LevelShell';
import { WireSandbox } from '../src/game/sandboxes/WireSandbox';
import { ArenaSandbox } from '../src/game/sandboxes/ArenaSandbox';
import { LEVEL_BY_ID } from '../src/content/index';
import type { WireLevel, ArenaLevel } from '../src/content/types';
import { Rich } from '../src/game/Rich';
import { RouterProvider, createRootRoute, createRouter, createMemoryHistory } from '@tanstack/react-router';
import type { ReactNode } from 'react';

function withRouter(node: ReactNode) {
  const root = createRootRoute({ component: () => <>{node}</> });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
  return (
    <StoreProvider initial={emptySave()}>
      <RouterProvider router={router as never} />
    </StoreProvider>
  );
}

describe('the Wire sandbox in its shell', () => {
  it('sending the edited request turns the checks green', async () => {
    const user = userEvent.setup();
    const level = LEVEL_BY_ID['wire-robots'] as WireLevel;
    render(withRouter(<LevelShell level={level}>{(api) => <WireSandbox level={level} onChecks={api.onChecks} fail={api.fail} act={api.act as never} />}</LevelShell>));
    const editor = await screen.findByLabelText('Raw HTTP request');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findAllByText('Lantern & Co.')).not.toHaveLength(0);
    await user.clear(editor);
    await user.type(editor, 'GET /robots.txt HTTP/1.1');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    const checks = screen.getByLabelText('Instructions and checks');
    expect(within(checks).getByText('Read /robots.txt').closest('li')).toHaveAttribute('data-pass', 'true');
  });
  it('a broken request line is a failed attempt with a one-line reason', async () => {
    const user = userEvent.setup();
    const level = LEVEL_BY_ID['wire-robots'] as WireLevel;
    render(withRouter(<LevelShell level={level}>{(api) => <WireSandbox level={level} onChecks={api.onChecks} fail={api.fail} act={api.act as never} />}</LevelShell>));
    const editor = await screen.findByLabelText('Raw HTTP request');
    await user.clear(editor);
    await user.type(editor, 'robots');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/method and a path/);
  });
});

describe('the Arena sandbox', () => {
  it('a wrong line pick fails; the right one unlocks the editor', async () => {
    const user = userEvent.setup();
    const level = LEVEL_BY_ID['arena-sqli'] as ArenaLevel;
    render(withRouter(<LevelShell level={level}>{(api) => <ArenaSandbox level={level} onChecks={api.onChecks} fail={api.fail} act={api.act as never} />}</LevelShell>));
    await user.click(await screen.findByRole('button', { name: /^Line 1:/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/declares the route/);
    await user.click(screen.getByRole('button', { name: /^Line 3:/ }));
    expect(screen.getByLabelText('Your fix (editable)')).toBeInTheDocument();
  });
});

describe('codex terms', () => {
  it('open a one-line definition on tap', async () => {
    const user = userEvent.setup();
    render(<StoreProvider initial={emptySave()}><p><Rich text="Send it as [[sqli|parameters]]." /></p></StoreProvider>);
    await user.click(screen.getByRole('button', { name: 'parameters' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(/SQL injection/);
  });
});
