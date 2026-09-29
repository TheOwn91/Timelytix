import { DEMO, notify } from './demo';
import { downloadBlob, isIOS } from './device';
import { addDays, dateKey } from './time';
import type { AppState } from './types';

/**
 * Automatische Sicherung: In festem Abstand legt die App eine Sicherungsdatei im Download-Ordner ab.
 * Dort bleibt sie auch, wenn die Browserdaten gelöscht oder die App deinstalliert wird.
 */

/** Zuletzt gesichert (Datum, nur auf diesem Gerät). */
const LAST_KEY = 'timetrack.lastBackup';

export const BACKUP_INTERVALS: { days: number; label: string }[] = [
  { days: 1, label: 'täglich' },
  { days: 3, label: 'alle 3 Tage' },
  { days: 7, label: 'wöchentlich' },
  { days: 14, label: 'alle 2 Wochen' },
  { days: 30, label: 'monatlich' },
];

export const DEFAULT_BACKUP_DAYS = 7;

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

/** Nach jeder Sicherung (auch „Sicherung exportieren“) – der Abstand zählt ab hier. */
export function markBackedUp(date = new Date()) {
  try {
    localStorage.setItem(LAST_KEY, dateKey(date));
  } catch {
    /* ignorieren */
  }
}

/** Ist eine automatische Sicherung fällig? (Nur mit Daten; beim ersten Mal sofort.) */
export function autoBackupDue(state: AppState, today = dateKey(new Date()), last = lastBackup()): boolean {
  if (!autoBackupEnabled(state) || state.projects.length === 0) return false;
  return !last || addDays(last, backupIntervalDays(state)) <= today;
}

/** Beim Start und beim Zurückholen der App aufrufen. */
export function runAutoBackup(state: AppState) {
  // Demo ohne Downloads; auf dem iPhone würde ein Download die App mit einer Vorschau unterbrechen
  if (DEMO || isIOS() || !autoBackupDue(state)) return;
  const name = backupFileName();
  downloadBlob(backupBlob(state), name);
  markBackedUp();
  notify(`Automatische Sicherung gespeichert: Downloads/${name}`);
}
