import { DEMO } from './demo';
import { NATIVE, nativeNotifyPermission, runningNativeDelivered, showRunningNative, showTestNative, type NativePermission } from './native';
import { fmtTime } from './time';
import type { AppState } from './types';

/**
 * Zeigt, solange die Zeit läuft, eine Benachrichtigung (Symbol in der Statusleiste) und eine
 * Markierung am App-Symbol. Android: im Browser und als installierte App. iPhone: ab iOS 16.4,
 * nur als installierte App (Home-Bildschirm). Android-App: dauerhafte Benachrichtigung über Android.
 */

/** Android-App: zuletzt bekannte Berechtigung (wird beim Start und nach Anfragen aktualisiert). */
let nativePermission: NativePermission = 'prompt';
if (NATIVE) void nativeNotifyPermission().then((p) => (nativePermission = p), () => undefined);

const TAG = 'timetrack-running';
const PREF_KEY = 'timetrack.notify';

export type NotifySupport = 'ok' | 'denied' | 'ask' | 'install' | 'unsupported';

export function notifyEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setNotifyEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
  } catch {
    /* ignorieren */
  }
}

export function notifySupport(): NotifySupport {
  if (DEMO) return 'unsupported';
  if (NATIVE) return nativePermission === 'granted' ? 'ok' : nativePermission === 'denied' ? 'denied' : 'ask';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // iOS bietet Benachrichtigungen nur in installierten Web-Apps an
  if (ios && !standalone) return 'install';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (Notification.permission === 'granted') return 'ok';
  if (Notification.permission === 'denied') return 'denied';
  return 'ask';
}

/** Wie notifySupport, in der Android-App aber erst nach dem Abfragen der aktuellen Berechtigung. */
export async function refreshNotifySupport(): Promise<NotifySupport> {
  if (NATIVE) nativePermission = await nativeNotifyPermission().catch(() => nativePermission);
  return notifySupport();
}

const ASKED_KEY = 'timetrack.notifyAsked';

/**
 * Android-App: Beim ersten Start einmal fragen, ob die Anzeige „Zeit läuft“ erlaubt werden soll
 * (statt erst beim ersten „Zeit starten“). `true`, wenn jetzt gefragt werden soll.
 */
export async function shouldAskNotifyOnStart(): Promise<boolean> {
  if (!NATIVE || !notifyEnabled()) return false;
  try {
    if (localStorage.getItem(ASKED_KEY)) return false;
    localStorage.setItem(ASKED_KEY, '1');
  } catch {
    return false;
  }
  return (await refreshNotifySupport()) === 'ask';
}

/** Muss direkt aus einem Tipp heraus aufgerufen werden (sonst lehnt iOS die Anfrage ab). */
export async function requestNotifyPermission(): Promise<boolean> {
  if (NATIVE) {
    nativePermission = await nativeNotifyPermission(true).catch(() => nativePermission);
    return nativePermission === 'granted';
  }
  if (notifySupport() !== 'ask') return notifySupport() === 'ok';
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return undefined;
  }
}

async function setBadge(on: boolean) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (on) await nav.setAppBadge?.(1);
    else await nav.clearAppBadge?.();
  } catch {
    /* nicht unterstützt */
  }
}

async function clearNotification() {
  const reg = await registration();
  const list = (await reg?.getNotifications({ tag: TAG })) ?? [];
  list.forEach((n) => n.close());
}

/** Text der Benachrichtigung für den aktuellen Zustand (ohne laufende Buchung: null). */
export function runningNotice(state: AppState): { title: string; body: string; start: number; session: string; paused: boolean } | null {
  const s = state.sessions.find((x) => x.end === undefined);
  if (!s) return null;
  const project = state.projects.find((p) => p.id === s.projectId);
  const pause = s.pauses.find((p) => p.end === undefined);
  const name = project?.name ?? 'Timelytix';
  // „❚❚“ statt „⏸“: das zeigen manche Handys (z. B. Samsung) als buntes Emoji
  return pause
    ? { title: `❚❚ Pause – ${name}`, body: `Pause seit ${fmtTime(pause.start)} · Arbeitsbeginn ${fmtTime(s.start)}`, start: pause.start, session: s.id, paused: true }
    : { title: `⏱ Zeit läuft – ${name}`, body: `Seit ${fmtTime(s.start)} · Tippen zum Öffnen`, start: s.start, session: s.id, paused: false };
}

let last = '';

/** Benachrichtigung und Badge an den Zustand anpassen. Mehrfachaufrufe sind unkritisch. */
export async function syncRunningStatus(state: AppState, force = false) {
  if (DEMO) return;
  const notice = notifyEnabled() ? runningNotice(state) : null;
  const key = notice ? `${notice.title}|${notice.body}` : '';
  if (key === last && !force) return;
  last = key;

  if (NATIVE) {
    await syncNative(notice).catch(() => undefined);
    return;
  }

  await setBadge(!!runningNotice(state));
  if (!notice) {
    await clearNotification();
    return;
  }
  if (notifySupport() !== 'ok') return;
  const reg = await registration();
  try {
    await reg?.showNotification(notice.title, {
      body: notice.body,
      tag: TAG,
      icon: './icon-192.png',
      badge: './badge-96.png',
      silent: true,
      requireInteraction: true,
      timestamp: notice.start,
    } as NotificationOptions);
  } catch {
    /* z. B. Berechtigung zurückgezogen */
  }
}

/** Android-App: zuletzt gezeigte Anzeige („Buchung|Titel|Text“), übersteht das Schließen der App. */
const SHOWN_KEY = 'timetrack.notifyShown';

function readShown(): string | null {
  try {
    return localStorage.getItem(SHOWN_KEY);
  } catch {
    return null;
  }
}

function writeShown(key: string | null) {
  try {
    if (key) localStorage.setItem(SHOWN_KEY, key);
    else localStorage.removeItem(SHOWN_KEY);
  } catch {
    /* ignorieren */
  }
}

/**
 * Android-App: Die Anzeige meldet sich nur einmal beim Start der Zeit. Beim Öffnen der App bleibt
 * sie unverändert stehen; Änderungen (Pause) und das Wiederherstellen geschehen still.
 */
async function syncNative(notice: ReturnType<typeof runningNotice>) {
  nativePermission = await nativeNotifyPermission().catch(() => nativePermission);
  const shown = readShown();
  if (!notice) {
    await showRunningNative(null);
    writeShown(null);
    return;
  }
  if (nativePermission !== 'granted') return;
  const key = `${notice.session}|${notice.title}|${notice.body}`;
  const delivered = await runningNativeDelivered().catch(() => false);
  if (shown === key && delivered) return;
  // Dieselbe Buchung wurde schon gemeldet (Pause, App neu geöffnet, Anzeige angetippt) oder die Anzeige steht
  // schon (Zeit im Widget gestartet) → still
  await showRunningNative(notice, { quiet: !!shown?.startsWith(`${notice.session}|`) || delivered });
  writeShown(key);
}


/** Probe-Benachrichtigung aus den Einstellungen. */
export async function showTestNotification() {
  if (NATIVE) {
    await showTestNative({ title: 'Timelytix', body: 'So sieht die Anzeige aus, solange die Zeit läuft.' });
    return;
  }
  const reg = await registration();
  await reg?.showNotification('Timelytix', {
    body: 'So sieht die Anzeige aus, solange die Zeit läuft.',
    tag: 'timetrack-test',
    icon: './icon-192.png',
    badge: './badge-96.png',
  });
}
