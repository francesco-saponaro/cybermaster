/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Writes sw.js at build time with the list of every file the game is made of,
 * so the service worker can store them all on the first visit and the game
 * plays offline, lazy-loaded levels and arcade games included.
 */
function offline(): Plugin {
  return {
    name: 'cybermaster-offline',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js');
      const pub = readdirSync('public').filter((f) => !f.startsWith('_'));
      const files = [...new Set(['/', ...built.map((f) => '/' + f), ...pub.map((f) => '/' + f)])];
      const version = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorker(files, version) });
    },
  };
}

function serviceWorker(files: string[], version: string): string {
  return `// CyberMaster offline cache, version ${version}. Generated at build time.
const CACHE = 'cybermaster-${version}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('cybermaster-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Pages: the network first, so an update shows up; the stored app when offline.
    e.respondWith(fetch(req).catch(() => caches.match('/').then((r) => r || caches.match('/index.html'))));
    return;
  }
  // Files: built with a hash in their name, so the stored copy is always right.
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
`;
}

export default defineConfig({
  plugins: [react(), tailwindcss(), offline()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
    // The arcade tests play hundreds of full runs; give them room on a busy machine.
    testTimeout: 60_000,
  },
});
