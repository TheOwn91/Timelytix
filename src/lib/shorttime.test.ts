import { describe, expect, it } from 'vitest';
import { combine } from './time';
import type { AppState, Project } from './types';
import { yearOverview } from './year';

const project: Project = {
  id: 'p', name: 'T', color: '#000', hourlyRate: 0, dailyTargetHours: 8, workdays: [1, 2, 3, 4, 5],
  autoBreak: false, state: '', surcharges: [], startDate: '2026-09-01', overtimeSurchargePercent: 25,
};

// 1.9. von 06:00 bis `end` gearbeitet, 2.9. Kurzarbeit, Rest des Monats frei
function september(p: Project, end: string) {
  const st: AppState = {
    version: 1,
    projects: [p],
    sessions: [{ id: 'a', projectId: 'p', start: combine('2026-09-01', '06:00'), end: combine('2026-09-01', end), pauses: [] }],
    absences: [
      { id: 'k', projectId: 'p', date: '2026-09-02', type: 'kurzarbeit' },
      ...Array.from({ length: 28 }, (_, i) => ({ id: `f${i}`, projectId: 'p', date: `2026-09-${String(i + 3).padStart(2, '0')}`, type: 'frei' as const })),
    ],
  };
  return yearOverview(st, p, 2026, combine('2026-10-05', '12:00')).overtime.months[8];
}

describe('Überstundenzuschlag bei Kurzarbeit', () => {
  it('Plus des Monats wird verrechnet, auch wenn das Konto aus dem Vormonat im Minus steht', () => {
    // Übertrag −3 h, 1.9. +5 h → die 5 h gehen von der Kurzarbeit ab, im Monat bleibt kein Plus
    const m = september({ ...project, overtimeAtStartHours: -3 }, '19:00');
    expect(m.summary.shortTime).toEqual({ fromAccount: 300, uncovered: 180 });
    expect(m.balance).toBe(0);
    expect(m.surcharge).toBe(0);
    expect(m.total).toBe(-180);
  });

  it('kein Zuschlag auf Überstunden, die für Kurzarbeit verbraucht wurden', () => {
    // 1.9. +5 h, Kurzarbeit nimmt alle 5 h
    const m = september(project, '19:00');
    expect(m.balance).toBe(0);
    expect(m.surcharge).toBe(0);
  });

  it('in Monaten mit Kurzarbeit entfällt der Zuschlag', () => {
    // 1.9. 06:00–24:00 = +10 h, Kurzarbeit nimmt 8 h → 2 h bleiben auf dem Konto, ohne Zuschlag
    const m = september(project, '24:00');
    expect(m.summary.shortTime).toEqual({ fromAccount: 480, uncovered: 0 });
    expect(m.surcharge).toBe(0);
    expect(m.total).toBe(120);
  });

  it('ohne Kurzarbeit Zuschlag auf das Plus des Monats', () => {
    // Übertrag −3 h, +5 h im Monat → 25 % von 5 h = 75 min
    const st: AppState = {
      version: 1,
      projects: [project],
      sessions: [{ id: 'a', projectId: 'p', start: combine('2026-09-01', '06:00'), end: combine('2026-09-01', '19:00'), pauses: [] }],
      absences: Array.from({ length: 29 }, (_, i) => ({ id: `f${i}`, projectId: 'p', date: `2026-09-${String(i + 2).padStart(2, '0')}`, type: 'frei' as const })),
    };
    const p = { ...project, overtimeAtStartHours: -3 };
    const m = yearOverview({ ...st, projects: [p] }, p, 2026, combine('2026-10-05', '12:00')).overtime.months[8];
    expect(m.balance).toBe(300);
    expect(m.surcharge).toBe(75);
  });
});
