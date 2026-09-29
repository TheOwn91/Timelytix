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
// Pfad der App (z. B. /Timelytix/); unter derselben Domain liegt noch die alte App …/TimeTrack/
const SCOPE = new URL('./', self.location).pathname;
// Einstellung „Updates automatisch installieren“, von der App hier abgelegt (lib/update.ts)
const SETTINGS = 'timelytix-settings';

// Manuelle Updates: im Hintergrund nichts installieren – sonst würde der Browser die neue Version
// aktivieren, sobald die App ganz geschlossen wird. „Jetzt installieren“ gibt kurz frei (allowUntil).
async function installAllowed() {
  if (!self.registration.active) return true; // erste Installation
  try {
    const res = await (await caches.open(SETTINGS)).match('update-settings');
    if (!res) return true;
    const s = await res.json();
    return s.auto !== false || (s.allowUntil || 0) > Date.now();
  } catch {
    return true;
  }
}

// Ältere Versionen haben ihre Dateien in Speichern „timetrack-…“ abgelegt (geteilt mit der alten App).
// Veraltete Kopien daraus führten zu einer weißen Seite. Nur Einträge dieser App (unter SCOPE) betreffen uns.
async function legacyEntries() {
  const found = [];
  for (const name of await caches.keys()) {
    if (name.startsWith('timelytix-')) continue;
    const cache = await caches.open(name);
    for (const req of await cache.keys()) if (new URL(req.url).pathname.startsWith(SCOPE)) found.push([name, req]);
  }
  return found;
}

// Ein neuer Service Worker wartet, bis die App ihn aktiviert (automatisch oder per „Jetzt aktualisieren“).
// Ausnahme: Liegen noch veraltete Kopien herum, sofort übernehmen – die weiße Seite kann das Update nicht anstoßen.
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const legacy = (await legacyEntries()).length > 0;
    if (!legacy && !(await installAllowed())) throw new Error('Update wartet auf „Jetzt installieren“');
    await (await caches.open(CACHE)).addAll(FILES);
    if (legacy) await self.skipWaiting();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('timelytix-') && k !== CACHE && k !== SETTINGS) await caches.delete(k);
    // Veraltete Kopien dieser App aus fremden Speichern entfernen; Einträge der alten App bleiben
    const legacy = await legacyEntries();
    for (const [name, req] of legacy) {
      const cache = await caches.open(name);
      await cache.delete(req);
      if (!(await cache.keys()).length) await caches.delete(name);
    }
    await self.clients.claim();
    // Hing eine Seite an einer veralteten Kopie, jetzt frisch laden
    if (legacy.length) for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => {});
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/version.json')) return; // immer aus dem Netz
  const own = () => caches.open(CACHE);
  if (req.mode === 'navigate') {
    // Lokal zuerst: Startseite aus dem eigenen Speicher (gehört immer zu den mitgespeicherten Dateien),
    // nur wenn sie dort fehlt, aus dem Netz. Neue Versionen kommen über einen neuen sw.js.
    event.respondWith(own().then((c) => c.match('./')).then((hit) => hit || fetch(req)));
    return;
  }
  // Dateien (mit Versionskennung im Namen): nur aus dem eigenen Speicher, sonst aus dem Netz
  event.respondWith(own().then((c) => c.match(req, { ignoreSearch: true })).then((hit) => hit || fetch(req)));
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
