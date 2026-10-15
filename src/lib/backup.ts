import { DEMO, notify } from './demo';
import { isIOS, saveBackupFile } from './device';
import { NATIVE } from './native';
import { addDays, dateKey } from './time';
import type { AppState } from './types';

/**
 * Automatische Sicherung: In festem Abstand legt die App eine Sicherungsdatei im Download-Ordner ab.
 * Dort bleibt sie auch, wenn die Browserdaten gelöscht oder die App deinstalliert wird.
 */

/** Zuletzt gesichert (Datum, nur auf diesem Gerät). */
const LAST_KEY = 'timetrack.lastBackup';
/** Seit wann gezählt wird, solange es noch keine Sicherung gibt (die erste kommt erst nach dem Abstand). */
const START_KEY = 'timetrack.backupStart';

export const BACKUP_INTERVALS: { days: number; label: string }[] = [
  { days: 1, label: 'täglich' },
  { days: 3, label: 'alle 3 Tage' },
  { days: 7, label: 'wöchentlich' },
  { days: 14, label: 'alle 2 Wochen' },
  { days: 30, label: 'monatlich' },
];

export const DEFAULT_BACKUP_DAYS = 30;

export function autoBackupEnabled(state: AppState): boolean {
  return state.settings?.autoBackup !== false;
}

export function backupIntervalDays(state: AppState): number {
  return state.settings?.backupIntervalDays ?? DEFAULT_BACKUP_DAYS;
}

export function backupFileName(date = new Date()): string {
  return `timelytix-backup-${dateKey(date)}.json`;
}

export function backupBlob(state: AppState): Blob {
  return new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
}

export function lastBackup(): string | undefined {
  try {
    return localStorage.getItem(LAST_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function backupStart(): string | undefined {
  try {
    return localStorage.getItem(START_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Noch nie gesichert: ab heute zählen – die erste automatische Sicherung kommt nach dem Abstand, nicht gleich
 * nach der Einrichtung (Aufruf beim Abschluss des Assistenten und, für ältere Daten, vor jeder Prüfung).
 */
export function startBackupClock(today = dateKey(new Date())) {
  if (lastBackup() || backupStart()) return;
  try {
    localStorage.setItem(START_KEY, today);
  } catch {
    /* ignorieren */
  }
}

/** Nach jeder Sicherung (auch „Sicherung exportieren“) – der Abstand zählt ab hier. */
export function markBackedUp(date = new Date()) {
  try {
    localStorage.setItem(LAST_KEY, dateKey(date));
  } catch {
    /* ignorieren */
  }
}

/**
 * Ist eine automatische Sicherung fällig? Nur mit Daten, und erst nach dem eingestellten Abstand – gezählt ab der
 * letzten Sicherung bzw. ohne Sicherung ab Beginn der Zählung (`start`, gesetzt nach der Einrichtung).
 */
export function autoBackupDue(state: AppState, today = dateKey(new Date()), last = lastBackup(), start = backupStart()): boolean {
  if (!autoBackupEnabled(state) || state.projects.length === 0) return false;
  const from = last ?? start;
  if (!from) return false;
  // Datum in der Zukunft (Uhr war verstellt): gleich sichern, dann stimmt die Zählung wieder
  return from > today || addDays(from, backupIntervalDays(state)) <= today;
}

/** Tag der nächsten automatischen Sicherung (für die Anzeige in den Einstellungen). */
export function nextAutoBackup(state: AppState, today = dateKey(new Date()), last = lastBackup(), start = backupStart()): string {
  const from = last ?? start ?? today;
  const next = addDays(from, backupIntervalDays(state));
  // Überfällig (z. B. App lange nicht geöffnet) oder Datum in der Zukunft: beim nächsten Öffnen
  return next < today || from > today ? today : next;
}

/** Beim Start und beim Zurückholen der App aufrufen. */
export async function runAutoBackup(state: AppState) {
  // Demo ohne Downloads; auf dem iPhone würde ein Download die App mit einer Vorschau unterbrechen
  if (DEMO || (isIOS() && !NATIVE) || saving) return;
  if (state.projects.length > 0) startBackupClock();
  if (!autoBackupDue(state)) return;
  saving = true;
  try {
    const where = await saveBackupFile(backupBlob(state), backupFileName());
    markBackedUp();
    notify(`Automatische Sicherung gespeichert: ${where}`);
  } catch {
    notify('Automatische Sicherung fehlgeschlagen – bitte „Sicherung exportieren“ nutzen.');
  } finally {
    saving = false;
  }
}

/** Eine Sicherung läuft gerade (Android: Schreiben ist asynchron). */
let saving = false;
