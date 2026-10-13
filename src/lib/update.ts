import { APP_VERSION, releasesForUpdate, type LatestRelease, type Release } from './changelog';
import { compareVersions, fetchLatestApk } from './apk-update';
import { DEMO, notify } from './demo';
import { NATIVE } from './native';

/**
 * Updates der installierten App über den Service Worker – immer von Hand: Die App sucht selten nach
 * neuen Versionen und zeigt „Update verfügbar“. „Jetzt aktualisieren“ zeigt zuerst die Änderungen,
 * installiert wird erst nach dem Bestätigen (danach kein zweites „Was ist neu?“).
 */

/** Früher: Schalter „Updates automatisch installieren“ (wird beim Start entfernt). */
const OLD_AUTO_KEY = 'timetrack.autoUpdate';
/** Von Versionen bis 0.11.1 gesetzt: nach dem Update „Was ist neu?“ auf jeden Fall zeigen. */
const SHOW_NOTES_KEY = 'timetrack.showNotesAfterUpdate';
/** Änderungen wurden schon vor dem Update gezeigt. */
const NOTES_SHOWN_KEY = 'timetrack.notesShownBeforeUpdate';
export const UPDATE_PREVIEW_EVENT = 'timetrack-update-preview';

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'current' }
  | { state: 'available'; release?: Release }
  | { state: 'installing' }
  | { state: 'offline' }
  | { state: 'unsupported' };

let status: UpdateStatus = { state: 'idle' };
const listeners = new Set<(s: UpdateStatus) => void>();

function setStatus(s: UpdateStatus) {
  status = s;
  listeners.forEach((l) => l(s));
}

export function getUpdateStatus() {
  return status;
}

export function onUpdateStatus(fn: (s: UpdateStatus) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function updateSupported(): boolean {
  // Android-App: neue Versionen als APK über GitHub (lib/apk-update.ts)
  return !DEMO && import.meta.env.PROD && (NATIVE || 'serviceWorker' in navigator);
}

/** Einstellung für den Service Worker ablegen (er kann localStorage nicht lesen), siehe sw.js. */
async function writeSwSettings(allowMinutes = 0) {
  try {
    const cache = await caches.open('timelytix-settings');
    const settings = { auto: false, allowUntil: allowMinutes ? Date.now() + allowMinutes * 60_000 : 0 };
    await cache.put('./update-settings', new Response(JSON.stringify(settings), { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    /* ohne Cache Storage: Service Worker installiert wie bisher */
  }
}

function consumeFlag(key: string): boolean {
  try {
    const v = sessionStorage.getItem(key) === '1';
    sessionStorage.removeItem(key);
    return v;
  } catch {
    return false;
  }
}

/** Nach einem Update per Knopf aus einer älteren Version „Was ist neu?“ auf jeden Fall zeigen. */
export function consumeForcedReleaseNotes(): boolean {
  return consumeFlag(SHOW_NOTES_KEY);
}

/** Wurden die Änderungen schon vor dem Update gezeigt? Dann nach dem Neustart nicht noch einmal. */
export function consumeNotesShownBeforeUpdate(): boolean {
  return consumeFlag(NOTES_SHOWN_KEY);
}

/** „Jetzt aktualisieren“: öffnet die Vorschau mit den Änderungen (siehe UpdatePreview). */
export function openUpdatePreview() {
  window.dispatchEvent(new CustomEvent(UPDATE_PREVIEW_EVENT));
}

/** Änderungen des bereitstehenden Updates (vom Server, sonst was beim Prüfen gemerkt wurde). */
export async function fetchUpdateNotes(): Promise<Release[]> {
  try {
    return releasesForUpdate(await fetchLatest());
  } catch {
    return status.state === 'available' && status.release ? [status.release] : [];
  }
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!updateSupported() || NATIVE) return undefined;
  return (await navigator.serviceWorker.getRegistration()) ?? undefined;
}

/** Neuester Stand auf dem Server (ohne Cache). */
async function fetchLatest(): Promise<LatestRelease> {
  if (NATIVE) {
    const latest = await fetchLatestApk();
    if (!latest) throw new Error('keine APK');
    return latest;
  }
  const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as LatestRelease;
}

function waitForInstalled(worker: ServiceWorker, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve) => {
    if (worker.state === 'installed' || worker.state === 'activated') return resolve();
    const t = setTimeout(resolve, timeoutMs);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

/** Web: jede andere Version auf dem Server (auch zurückgezogene); Android-App: nur neuere APKs. */
function isNewer(version: string): boolean {
  return NATIVE ? compareVersions(version, APP_VERSION) > 0 : version !== APP_VERSION;
}

/** Bei manuellen Updates gefundene neue Version – der Hinweis bleibt nach dem Schließen der App stehen. */
const PENDING_KEY = 'timetrack.pendingUpdate';

function rememberPending(latest?: LatestRelease) {
  try {
    if (latest && isNewer(latest.version)) localStorage.setItem(PENDING_KEY, JSON.stringify(latest));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignorieren */
  }
}

function restorePending() {
  try {
    const latest = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as LatestRelease | null;
    if (latest && isNewer(latest.version)) setStatus({ state: 'available', release: latest });
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignorieren */
  }
}

const LAST_CHECK_KEY = 'timetrack.lastUpdateCheck';
/** Automatische Update-Suche höchstens alle 12 Stunden – die App läuft sonst ganz lokal. */
const CHECK_INTERVAL = 12 * 60 * 60 * 1000;

function updateCheckDue(): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0);
    if (Date.now() - last < CHECK_INTERVAL) return false;
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
  } catch {
    /* ohne Speicher: trotzdem prüfen */
  }
  return true;
}

/** Ein geladenes, wartendes Update gefunden: nur anbieten, installiert wird erst nach Bestätigung. */
function handleWaiting(release?: Release) {
  setStatus({ state: 'available', release: release ?? (status.state === 'available' ? status.release : undefined) });
}

/** „Auf Updates prüfen“: fragt den Server und lädt ein neues Update im Hintergrund. */
export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!updateSupported()) {
    setStatus({ state: 'unsupported' });
    return status;
  }
  setStatus({ state: 'checking' });
  let latest: LatestRelease | undefined;
  try {
    latest = await fetchLatest();
  } catch {
    setStatus({ state: 'offline' });
    return status;
  }
  const reg = await registration();
  try {
    await reg?.update();
  } catch {
    /* z. B. offline – version.json war aber erreichbar */
  }
  if (reg?.installing) await waitForInstalled(reg.installing);

  if (reg?.waiting) {
    // Selbst geprüft → Update mit Knopf anbieten (auch bei automatischen Updates)
    setStatus({ state: 'available', release: latest });
  } else if (latest && isNewer(latest.version)) {
    // Server kennt eine neuere Version, der Browser hat sie aber noch nicht geladen
    setStatus({ state: 'available', release: latest });
  } else {
    setStatus({ state: 'current' });
  }
  rememberPending(latest);
  return status;
}

/**
 * Installiert das bereitstehende Update (nach „Jetzt installieren“); die App lädt danach neu.
 * Die Änderungen wurden in der Vorschau schon gezeigt → nach dem Neustart kein „Was ist neu?“.
 */
export async function applyUpdate() {
  if (NATIVE) return installApk();
  const reg = await registration();
  setStatus({ state: 'installing' });
  try {
    sessionStorage.setItem(NOTES_SHOWN_KEY, '1');
  } catch {
    /* ignorieren */
  }
  // Installation freigeben (der Service Worker lädt sonst nichts)
  await writeSwSettings(5);
  // Kennt der Server schon eine neuere Version, der Browser hat sie aber noch nicht geladen: jetzt laden
  if (reg && !reg.waiting && !reg.installing) {
    try {
      await reg.update();
    } catch {
      /* offline – dann einfach neu laden */
    }
  }
  if (reg?.installing) await waitForInstalled(reg.installing);
  if (reg?.waiting) {
    reg.waiting.postMessage('SKIP_WAITING'); // → controllerchange → Neuladen
    // Falls der Wechsel ausbleibt, trotzdem neu laden
    setTimeout(() => window.location.reload(), 8000);
  } else {
    window.location.reload();
  }
}

/**
 * Android-App: APK der neuen Version im Browser herunterladen; Android fragt danach „Diese App
 * aktualisieren?“ (die Daten bleiben erhalten).
 */
async function installApk() {
  const url = (status.state === 'available' ? (status.release as LatestRelease | undefined)?.apkUrl : undefined) ?? (await fetchLatest().catch(() => undefined))?.apkUrl;
  if (!url) {
    setStatus({ state: 'offline' });
    return;
  }
  try {
    sessionStorage.setItem(NOTES_SHOWN_KEY, '1');
  } catch {
    /* ignorieren */
  }
  const { AppLauncher } = await import('@capacitor/app-launcher');
  await AppLauncher.openUrl({ url });
  notify('Download gestartet – danach in der Benachrichtigung auf die Datei tippen und „Aktualisieren“ wählen.');
}

/** Beim Start: Service Worker registrieren und auf neue Versionen achten. */
export function registerServiceWorker() {
  if (!updateSupported()) return;
  if (NATIVE) {
    // Android-App: kein Service Worker, nur selten bei GitHub nach einer neuen APK fragen
    restorePending();
    if (updateCheckDue()) void checkForUpdates();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && updateCheckDue()) void checkForUpdates();
    });
    return;
  }
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  // Nach einem Update einmal neu laden, damit alle Dateien zur neuen Version passen
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  try {
    localStorage.removeItem(OLD_AUTO_KEY);
  } catch {
    /* ignorieren */
  }

  window.addEventListener('load', async () => {
    let reg: ServiceWorkerRegistration;
    await writeSwSettings();
    try {
      reg = await navigator.serviceWorker.register('./sw.js');
    } catch {
      return;
    }
    if (!reg) return; // z. B. Service Worker im Browser gesperrt
    const watch = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) handleWaiting();
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) handleWaiting();
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));

    // Beim Start und beim Zurückholen der App nur selten nachfragen (höchstens alle 12 Stunden)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && updateCheckDue()) void checkForUpdates();
    });
    restorePending();
    if (updateCheckDue()) void checkForUpdates();
  });
}
