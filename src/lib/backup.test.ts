import { describe, expect, it } from 'vitest';
import { autoBackupDue } from './backup';
import type { AppState } from './types';

const state = (settings?: AppState['settings'], projects = 1): AppState => ({
  version: 1,
  projects: Array.from({ length: projects }, (_, i) => ({ id: `p${i}` }) as AppState['projects'][number]),
  sessions: [],
  absences: [],
  settings,
});

describe('Automatische Sicherung', () => {
  it('ist beim ersten Mal sofort fällig, danach nach dem eingestellten Abstand', () => {
    expect(autoBackupDue(state(), '2026-09-29', undefined)).toBe(true);
    // Standard: wöchentlich
    expect(autoBackupDue(state(), '2026-10-05', '2026-09-29')).toBe(false);
    expect(autoBackupDue(state(), '2026-10-06', '2026-09-29')).toBe(true);
    expect(autoBackupDue(state({ backupIntervalDays: 1 }), '2026-09-30', '2026-09-29')).toBe(true);
    expect(autoBackupDue(state({ backupIntervalDays: 30 }), '2026-10-28', '2026-09-29')).toBe(false);
  });

  it('nicht, wenn ausgeschaltet oder noch keine Daten da sind', () => {
    expect(autoBackupDue(state({ autoBackup: false }), '2026-09-29', undefined)).toBe(false);
    expect(autoBackupDue(state(undefined, 0), '2026-09-29', undefined)).toBe(false);
  });
});
