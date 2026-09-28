import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Erzeugt beim Build einen Service Worker, der alle Dateien der App vorab
 * zwischenspeichert – danach läuft die App komplett offline.
 */
function serviceWorker(): Plugin {
  return {
    name: 'timetrack-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = [
        './',
        ...Object.keys(bundle).map((f) => `./${f}`),
        ...readdirSync('public').map((f) => `./${f}`),
      ];
      const hash = createHash('sha256');
      for (const f of readdirSync('public')) hash.update(readFileSync(`public/${f}`));
      for (const [name, chunk] of Object.entries(bundle)) {
        hash.update(name);
        hash.update(chunk.type === 'chunk' ? chunk.code : chunk.source);
      }
      const version = hash.digest('hex').slice(0, 12);
      // Aktuelle Version für „Auf Updates prüfen“ (wird nie aus dem Cache geliefert)
      // `history`: letzte Einträge, damit die App vor einem Update alle Neuerungen zeigen kann
      const releases = JSON.parse(readFileSync('src/lib/changelog.json', 'utf8')) as { commit?: string }[];
      const history = releases.slice(0, 30).map(({ commit: _commit, ...r }) => r);
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ ...history[0], history }) });
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        // Eigener Name je App: Unter derselben Domain liegt noch die alte App (…/TimeTrack/, Speicher „timetrack-…“)
        source: `const CACHE = 'timelytix-${version}';
const FILES = ${JSON.stringify(files)};

// Ein neuer Service Worker wartet, bis die App ihn aktiviert (automatisch oder per „Jetzt aktualisieren“)
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('timelytix-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // immer aus dem Netz
  // Cache zuerst: startet sofort, auch ohne Netz. Updates kommen über einen neuen sw.js.
  const key = req.mode === 'navigate' ? './' : req;
  event.respondWith(caches.match(key, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});

// Tipp auf die „Zeit läuft“-Benachrichtigung öffnet die App (oder holt sie nach vorn)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c);
      return open ? open.focus() : self.clients.openWindow('./');
    }),
  );
});
`,
      });
    },
  };
}

const define = { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) };

export default defineConfig(({ mode }) =>
  mode === 'demo'
    ? {
        define,
        // Demo: alles in einer Datei, ohne Service Worker (für eingebettete Vorschau)
        base: './',
        plugins: [react()],
        build: { outDir: 'dist-demo', assetsInlineLimit: 100_000_000, cssCodeSplit: false },
      }
    : {
        define,
        base: './',
        plugins: [react(), serviceWorker()],
      },
);
