import { DEMO } from './demo';
import releases from './changelog.json';

export interface Release {
  version: string;
  date: string;
  changes: string[];
  commit?: string;
}

/**
 * Neueste Version zuerst. Bei jedem Update in `changelog.json` oben einen Eintrag ergänzen.
 * `commit` nur bei Versionen, die nachträglich getaggt wurden – sonst taggt der Release-Workflow
 * den Stand, mit dem die Version auf `main` ankommt.
 */
export const CHANGELOG: Release[] = releases;

export const APP_VERSION = CHANGELOG[0].version;

/** Solange die Version mit 0. beginnt, ist die App noch in Entwicklung. */
export const IN_DEVELOPMENT = APP_VERSION.startsWith('0.');

const SEEN_KEY = 'timetrack.lastSeenVersion';
const OFF_KEY = 'timetrack.updateNotes';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignorieren */
  }
}

export function updateNotesEnabled(): boolean {
  return read(OFF_KEY) !== 'off';
}

export function setUpdateNotesEnabled(on: boolean) {
  write(OFF_KEY, on ? 'on' : 'off');
}

export function markVersionSeen() {
  write(SEEN_KEY, APP_VERSION);
}

/** Einträge, die seit dem letzten Start neu sind (leer: nichts anzeigen). */
export function releasesSince(lastSeen: string | null, changelog = CHANGELOG): Release[] {
  if (lastSeen === null) return [];
  const idx = changelog.findIndex((r) => r.version === lastSeen);
  if (idx === 0) return [];
  // Unbekannte Version: nur die neueste zeigen
  return idx === -1 ? changelog.slice(0, 1) : changelog.slice(0, idx);
}

/** Inhalt von `version.json`: neueste Version, ab 0.11.2 mit den letzten Einträgen. */
/** `apkUrl`: Android-App – Download der APK dieser Version (GitHub-Release). */
export type LatestRelease = Release & { history?: Release[]; apkUrl?: string };

/** Was bringt ein Update von `current` auf `latest`? Neueste zuerst, mindestens die neueste Version. */
export function releasesForUpdate(latest: LatestRelease, current = APP_VERSION): Release[] {
  const history = latest.history?.length ? latest.history : [latest];
  const idx = history.findIndex((r) => r.version === current);
  if (idx === 0) return [];
  return idx === -1 ? history : history.slice(0, idx);
}

/**
 * Beim Start: Was ist seit dem letzten Start neu? Bei der allerersten Installation wird nichts
 * angezeigt, nur die Version gemerkt. In der Demo zählt der erste Besuch als Update.
 */
export function pendingReleaseNotes(force = false): Release[] {
  let lastSeen = read(SEEN_KEY);
  if (lastSeen === null) {
    if (!DEMO) {
      markVersionSeen();
      return [];
    }
    lastSeen = '';
  }
  const releases = releasesSince(lastSeen);
  if (!releases.length) return [];
  if (!updateNotesEnabled() && !force) {
    markVersionSeen();
    return [];
  }
  return releases;
}
