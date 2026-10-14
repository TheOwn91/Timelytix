import { describe, expect, it } from 'vitest';
import { buildMonthReport } from './pdf';
import { combine } from './time';
import type { AppState, Project } from './types';

const project: Project = {
  id: 'p', name: 'Test', color: '#000', hourlyRate: 15, dailyTargetHours: 8, workdays: [1, 2, 3, 4, 5],
  autoBreak: true, state: 'NW', surcharges: [], startDate: '2026-03-01', overtimeSurchargePercent: 25,
};
const state: AppState = {
  version: 1,
  projects: [project],
  sessions: [{ id: 's', projectId: 'p', start: combine('2026-03-02', '08:00'), end: combine('2026-03-02', '17:00'), pauses: [] }],
  absences: [],
};
const now = combine('2026-10-14', '12:00');

describe('PDF-Monatsbericht', () => {
  it('erstellt einen Bericht für einen Monat mit Daten', () => {
    const { fileName } = buildMonthReport(state, project, 2026, 2, now);
    expect(fileName).toBe('Monatsbericht_Test_2026-03.pdf');
  });
  it('stürzt für Monate vor dem Jahr des Erfassungsbeginns nicht ab', () => {
    expect(() => buildMonthReport(state, project, 2025, 5, now)).not.toThrow();
  });
});
