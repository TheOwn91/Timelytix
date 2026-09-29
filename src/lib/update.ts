import { APP_VERSION, releasesForUpdate, type LatestRelease, type Release } from './changelog';
import { DEMO } from './demo';

/**
 * Updates der installierten App über den Service Worker:
 * - automatisch (Standard): ein neues Update wird aktiviert, sobald es geladen ist; danach zeigt
 *   die App „Was ist neu?“
 * - manuell: „Jetzt aktualisieren“ zeigt zuerst die Änderungen, installiert wird erst nach dem
 *   Bestätigen (danach kein zweites „Was ist neu?“)
 */

const AUTO_KEY = 'timetrack.autoUpdate';
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
  return !DEMO && import.meta.env.PROD && 'serviceWorker' in navigator;
}

export function autoUpdateEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Einstellung für den Service Worker ablegen (er kann localStorage nicht lesen), siehe sw.js. */
async function writeSwSettings(allowMinutes = 0) {
  try {
    const cache = await caches.open('timelytix-settings');
    const settings = { auto: autoUpdateEnabled(), allowUntil: allowMinutes ? Date.now() + allowMinutes * 60_000 : 0 };
    await cache.put('./update-settings', new Response(JSON.stringify(settings), { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    /* ohne Cache Storage: Service Worker installiert wie bisher */
  }
}

export function setAutoUpdateEnabled(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? 'on' : 'off');
  } catch {
    /* ignorieren */
  }
  void writeSwSettings();
  // Wartet schon ein Update, gleich installieren
  if (on && status.state === 'available') void applyUpdate(false);
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
  if (!updateSupported()) return undefined;
  return (await navigator.serviceWorker.getRegistration()) ?? undefined;
}

/** Neuester Stand auf dem Server (ohne Cache). */
async function fetchLatest(): Promise<LatestRelease> {
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

let autoPending = false;

/** Bei manuellen Updates gefundene neue Version – der Hinweis bleibt nach dem Schließen der App stehen. */
const PENDING_KEY = 'timetrack.pendingUpdate';

function rememberPending(latest?: LatestRelease) {
  try {
    if (latest && latest.version !== APP_VERSION) localStorage.setItem(PENDING_KEY, JSON.stringify(latest));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignorieren */
  }
}

function restorePending() {
  try {
    const latest = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null') as LatestRelease | null;
    if (latest && latest.version !== APP_VERSION) setStatus({ state: 'available', release: latest });
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignorieren */
  }
}

/**
 * Seltene automatische Suche: bei automatischen Updates lädt der Browser die neue Version im
 * Hintergrund; bei manuellen fragt die App nur nach, ob es eine gibt („Update verfügbar“).
 */
function periodicCheck(reg: ServiceWorkerRegistration) {
  if (autoUpdateEnabled()) return reg.update().catch(() => undefined);
  return checkForUpdates();
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

/**
 * Ein geladenes, wartendes Update gefunden: je nach Einstellung installieren oder anbieten.
 * Automatisch wird nur direkt beim Öffnen installiert – nie mitten in der Benutzung, dann
 * erst, wenn die App das nächste Mal wieder in den Vordergrund kommt.
 */
function handleWaiting(release?: Release) {
  if (autoUpdateEnabled()) {
    if (performance.now() < 15_000) void applyUpdate(false);
    else autoPending = true;
  } else setStatus({ state: 'available', release: release ?? (status.state === 'available' ? status.release : undefined) });
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
  } else if (latest && latest.version !== APP_VERSION) {
    // Server kennt eine neuere Version, der Browser hat sie aber noch nicht geladen
    setStatus({ state: 'available', release: latest });
  } else {
    setStatus({ state: 'current' });
  }
  rememberPending(latest);
  return status;
}

/**
 * Installiert das bereitstehende Update; die App lädt danach neu.
 * `manual`: nach der Vorschau bestätigt → nach dem Neustart kein „Was ist neu?“ mehr
 * (automatisch: „Was ist neu?“ erscheint wie eingestellt).
 */
export async function applyUpdate(manual = true) {
  const reg = await registration();
  setStatus({ state: 'installing' });
  if (manual) {
    try {
      sessionStorage.setItem(NOTES_SHOWN_KEY, '1');
    } catch {
      /* ignorieren */
    }
  }
  // Installation freigeben (bei manuellen Updates lädt der Service Worker sonst nichts)
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

/** Beim Start: Service Worker registrieren und auf neue Versionen achten. */
export function registerServiceWorker() {
  if (!updateSupported()) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  // Nach einem Update einmal neu laden, damit alle Dateien zur neuen Version passen
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

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

    // Beim Zurückholen der App (z. B. aus dem Hintergrund): ein geladenes Update installieren,
    // sonst nur selten online nach neuen Versionen schauen (höchstens alle 12 Stunden)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (autoPending && autoUpdateEnabled() && reg.waiting) void applyUpdate(false);
      else if (updateCheckDue()) void periodicCheck(reg);
    });
    // Beim Start ebenfalls höchstens alle 12 Stunden
    if (!autoUpdateEnabled()) restorePending();
    if (updateCheckDue()) void periodicCheck(reg);
  });
}
