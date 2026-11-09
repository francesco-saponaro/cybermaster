import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import '@fontsource-variable/libre-franklin';
import '@fontsource-variable/source-serif-4';
import './styles/app.css';
import './styles/game.css';
import { router } from './router';
import { StoreProvider } from './state/store';
import { setMuted } from './engine/audio';
import { loadSave } from './engine/save';

// Carry the saved mute setting into the audio engine before first play.
setMuted(loadSave().settings.muted);

const el = document.getElementById('root');
if (el) {
  createRoot(el).render(
    <StrictMode>
      <StoreProvider>
        <RouterProvider router={router} />
      </StoreProvider>
    </StrictMode>,
  );
}
