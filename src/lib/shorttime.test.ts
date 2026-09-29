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
  it('kein Zuschlag, wenn das Konto nach dem Verrechnen bei 0 steht', () => {
    // Übertrag −3 h, 1.9. +5 h, Kurzarbeit nimmt die übrigen 2 h
    const m = september({ ...project, overtimeAtStartHours: -3 }, '19:00');
    expect(m.summary.shortTime).toEqual({ fromAccount: 120, uncovered: 360 });
    expect(m.balance).toBe(180);
    expect(m.surcharge).toBe(0);
    expect(m.total).toBe(0);
  });

  it('kein Zuschlag auf Überstunden, die für Kurzarbeit verbraucht wurden', () => {
    // 1.9. +5 h, Kurzarbeit nimmt alle 5 h
    const m = september(project, '19:00');
    expect(m.balance).toBe(0);
    expect(m.surcharge).toBe(0);
  });

  it('Zuschlag nur auf das, was nach der Kurzarbeit übrig bleibt', () => {
    // 1.9. 06:00–24:00 = +10 h, Kurzarbeit nimmt 8 h → 2 h bleiben, 25 % = 30 min
    const m = september(project, '24:00');
    expect(m.summary.shortTime).toEqual({ fromAccount: 480, uncovered: 0 });
    expect(m.surcharge).toBe(30);
    expect(m.total).toBe(150);
  });
});
