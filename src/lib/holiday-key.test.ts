import { describe, expect, it } from 'vitest';
import { buildIndex, daySummary, monthSummary } from './calc';
import { combine } from './time';
import type { AppState, Project } from './types';

const project: Project = {
  id: 'p', name: 'T', color: '#000', hourlyRate: 20, dailyTargetHours: 8, workdays: [1, 2, 3, 4, 5],
  autoBreak: false, state: 'NW', surcharges: [], startDate: '2026-01-01',
};
const state = (p: Project, extra: Partial<AppState> = {}): AppState => ({ version: 1, projects: [p], sessions: [], absences: [], ...extra });
const now = combine('2026-12-31', '12:00');
// 25.12.2026 ist ein Freitag (Arbeitstag), 26.12. ein Samstag
const day = (p: Project, date: string, extra?: Partial<AppState>) => daySummary(p, date, buildIndex(state(p, extra), 'p'), now);

describe('Schlüssel Feiertag automatisch', () => {
  it('trägt ihn an einem Feiertag (Arbeitstag) ein und schreibt das Soll gut', () => {
    const d = day(project, '2026-12-25');
    expect(d.absence).toMatchObject({ type: 'feiertag', auto: true });
    expect(d.target).toBe(480);
    expect(d.credit).toBe(480);
    expect(d.wage).toBe(160);
  });

  it('nicht am Wochenende, nicht bei Arbeit und nicht, wenn der Schlüssel ausgeblendet ist', () => {
    expect(day(project, '2026-12-26').absence).toBeUndefined();
    const worked = day(project, '2026-12-25', {
      sessions: [{ id: 'a', projectId: 'p', start: combine('2026-12-25', '08:00'), end: combine('2026-12-25', '12:00'), pauses: [] }],
    });
    expect(worked.absence).toBeUndefined();
    expect(worked.target).toBe(0);
    const hidden = day({ ...project, hiddenAbsences: ['feiertag'] }, '2026-12-25');
    expect(hidden.absence).toBeUndefined();
    expect(hidden.credit).toBe(0);
  });

  it('ein eingetragener Schlüssel hat Vorrang', () => {
    const d = day(project, '2026-12-25', { absences: [{ id: 'u', projectId: 'p', date: '2026-12-25', type: 'urlaub' }] });
    expect(d.absence?.type).toBe('urlaub');
    expect(d.absence?.auto).toBeUndefined();
  });

  it('Saldo des Monats bleibt gleich, Feiertage zählen als Tage', () => {
    const sum = monthSummary(state(project), project, 2026, 11, now);
    expect(sum.absenceCounts.feiertag).toBe(1);
    // 25.12. gutgeschrieben: Soll und Gutschrift je 8 h
    expect(sum.credit).toBe(480);
  });
});
