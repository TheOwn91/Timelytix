import { describe, expect, it } from 'vitest';
import { autoBackupDue, nextAutoBackup } from './backup';
import type { AppState } from './types';

const state = (settings?: AppState['settings'], projects = 1): AppState => ({
  version: 1,
  projects: Array.from({ length: projects }, (_, i) => ({ id: `p${i}` }) as AppState['projects'][number]),
  sessions: [],
  absences: [],
  settings,
});

describe('Automatische Sicherung', () => {
  it('ist erst nach dem eingestellten Abstand fällig – standardmäßig monatlich', () => {
    expect(autoBackupDue(state(), '2026-10-28', '2026-09-29')).toBe(false);
    expect(autoBackupDue(state(), '2026-10-29', '2026-09-29')).toBe(true);
    expect(autoBackupDue(state({ backupIntervalDays: 1 }), '2026-09-30', '2026-09-29')).toBe(true);
    expect(autoBackupDue(state({ backupIntervalDays: 7 }), '2026-10-05', '2026-09-29')).toBe(false);
  });

  it('macht die erste Sicherung nicht gleich nach der Einrichtung, sondern einen Monat später', () => {
    // Noch nie gesichert, Zählung ab der Einrichtung am 15.10.
    expect(autoBackupDue(state(), '2026-10-15', undefined, undefined)).toBe(false);
    expect(autoBackupDue(state(), '2026-11-13', undefined, '2026-10-15')).toBe(false);
    expect(autoBackupDue(state(), '2026-11-14', undefined, '2026-10-15')).toBe(true);
    expect(nextAutoBackup(state(), '2026-10-15', undefined, '2026-10-15')).toBe('2026-11-14');
    // Eine Sicherung von Hand („Sicherung exportieren“) startet die Zählung neu
    expect(nextAutoBackup(state(), '2026-10-20', '2026-10-20', '2026-10-15')).toBe('2026-11-19');
  });

  it('Datum in der Zukunft (Uhr war verstellt) oder überfällig: gleich sichern', () => {
    expect(autoBackupDue(state(), '2026-10-15', '2027-10-01')).toBe(true);
    expect(autoBackupDue(state(), '2026-10-15', undefined, '2027-01-01')).toBe(true);
    expect(nextAutoBackup(state(), '2026-10-15', '2027-10-01')).toBe('2026-10-15');
    // Lange nicht geöffnet: nächste Sicherung ist heute, nicht ein Tag in der Vergangenheit
    expect(nextAutoBackup(state(), '2026-10-15', '2026-01-01')).toBe('2026-10-15');
    // Kürzerer Abstand: sofort fällig
    expect(autoBackupDue(state({ backupIntervalDays: 1 }), '2026-10-15', '2026-10-01')).toBe(true);
  });

  it('nicht, wenn ausgeschaltet oder noch keine Daten da sind', () => {
    expect(autoBackupDue(state({ autoBackup: false }), '2026-09-29', undefined)).toBe(false);
    expect(autoBackupDue(state(undefined, 0), '2026-09-29', undefined)).toBe(false);
  });
});
