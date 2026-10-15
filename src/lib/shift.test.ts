import { describe, expect, it } from 'vitest';
import { buildIndex, daySummary, monthSummary } from './calc';
import { sessionDay, setShiftToNextDay, shiftsToNextDay, workDate, suggestedStart } from './shift';
import { combine } from './time';
import type { AppState, Project } from './types';

const hahn = (): Project => ({
  id: 'p',
  name: 'Hahn Automation Group',
  color: '#000',
  hourlyRate: 20,
  dailyTargetHours: 7.75,
  workdays: [0, 1, 2, 3, 4], // So–Do (Tag des Anstempelns)
  autoBreak: false,
  state: 'RP',
  surcharges: [
    { id: 'night', name: 'Nacht', kind: 'time', from: '20:00', to: '06:00', percent: 25, enabled: true },
    { id: 'sun', name: 'Sonntag', kind: 'weekday', weekdays: [0], percent: 50, enabled: true },
    { id: 'hol', name: 'Feiertag', kind: 'holiday', percent: 50, enabled: true },
  ],
  startDate: '2026-09-01',
});

// So 27.09.2026 21:30 bis Mo 28.09. 06:15, Pause 02:00–02:30
const state = (p: Project): AppState => ({
  version: 1,
  projects: [p],
  sessions: [
    {
      id: 's',
      projectId: 'p',
      start: combine('2026-09-27', '21:30'),
      end: combine('2026-09-28', '06:15'),
      pauses: [{ start: combine('2026-09-28', '02:00'), end: combine('2026-09-28', '02:30') }],
    },
  ],
  absences: [],
});
const now = combine('2026-09-30', '12:00');

describe('Nachtschicht dem Folgetag zuordnen', () => {
  it('Option gibt es für jeden Arbeitgeber', () => {
    expect(shiftsToNextDay({ shiftToNextDay: true })).toBe(true);
    expect(shiftsToNextDay({})).toBe(false);
    const p: Project = { ...hahn(), name: 'Muster GmbH' };
    setShiftToNextDay(p, true);
    expect(sessionDay(p, { start: combine('2026-09-27', '21:30'), end: combine('2026-09-28', '06:00') })).toBe('2026-09-28');
  });

  it('nur Schichten über Mitternacht wandern', () => {
    const p = { shiftToNextDay: true };
    const at = (d: string, t: string) => combine(d, t);
    expect(sessionDay(p, { start: at('2026-09-27', '21:30'), end: at('2026-09-28', '06:00') })).toBe('2026-09-28');
    // Spätschicht bis vor Mitternacht bleibt am Tag
    expect(sessionDay(p, { start: at('2026-09-27', '18:00'), end: at('2026-09-27', '23:30') })).toBe('2026-09-27');
    // Ende genau um 0:00 zählt noch zum Tag des Beginns
    expect(sessionDay(p, { start: at('2026-09-27', '16:00'), end: at('2026-09-28', '00:00') })).toBe('2026-09-27');
    // Auch ein früher Beginn wandert, wenn die Schicht über Mitternacht geht
    expect(sessionDay(p, { start: at('2026-09-27', '15:00'), end: at('2026-09-28', '00:30') })).toBe('2026-09-28');
    expect(sessionDay(p, { start: at('2026-09-28', '06:00'), end: at('2026-09-28', '14:00') })).toBe('2026-09-28');
  });

  it('laufende Zeit wechselt erst nach Mitternacht zum Folgetag', () => {
    const p = { shiftToNextDay: true };
    const s = { start: combine('2026-09-27', '21:30') };
    expect(sessionDay(p, s, combine('2026-09-27', '23:59'))).toBe('2026-09-27');
    expect(sessionDay(p, s, combine('2026-09-28', '00:10'))).toBe('2026-09-28');
  });

  it('Frühschicht steht mit Option beim eigenen Tag', () => {
    const p = hahn();
    setShiftToNextDay(p, true);
    const st: AppState = {
      ...state(p),
      sessions: [{ id: 'f', projectId: 'p', start: combine('2026-09-28', '06:00'), end: combine('2026-09-28', '14:15'), pauses: [] }],
    };
    const idx = buildIndex(st, 'p');
    expect(daySummary(p, '2026-09-28', idx, now).sessions).toHaveLength(1);
    expect(daySummary(p, '2026-09-29', idx, now).sessions).toHaveLength(0);
  });

  it('ohne Option steht die Schicht beim Sonntag', () => {
    const p = hahn();
    const idx = buildIndex(state(p), 'p');
    expect(daySummary(p, '2026-09-27', idx, now).sessions).toHaveLength(1);
    expect(daySummary(p, '2026-09-28', idx, now).sessions).toHaveLength(0);
  });

  it('mit Option steht sie beim Montag, Zulagen nach echter Uhrzeit', () => {
    const p = hahn();
    setShiftToNextDay(p, true);
    const idx = buildIndex(state(p), 'p');
    expect(daySummary(p, '2026-09-27', idx, now).sessions).toHaveLength(0);
    const mon = daySummary(p, '2026-09-28', idx, now);
    expect(mon.sessions).toHaveLength(1);
    expect(mon.worked).toBe(495); // 8:45 − 0:30
    expect(mon.surcharges.sun).toBe(150); // So 21:30–24:00: Sonntag (höher als Nacht)
    expect(mon.surcharges.night).toBe(330); // Mo 0–6 Uhr ohne Pause
    expect(mon.target).toBe(465); // Montag ist jetzt Arbeitstag (7:45)
  });

  it('Arbeitstage wandern beim Ein- und Ausschalten mit', () => {
    const p = hahn();
    setShiftToNextDay(p, true);
    expect(p.workdays).toEqual([1, 2, 3, 4, 5]);
    setShiftToNextDay(p, false);
    expect(p.workdays).toEqual([0, 1, 2, 3, 4]);
  });

  it('Beginn im Tages-Editor: über Mitternacht am Vortag, sonst am angezeigten Tag', () => {
    const p = hahn();
    expect(workDate(p, '2026-09-28', '21:30', '06:00')).toBe('2026-09-28');
    setShiftToNextDay(p, true);
    expect(workDate(p, '2026-09-28', '21:30', '06:00')).toBe('2026-09-27');
    expect(workDate(p, '2026-09-28', '18:00', '23:00')).toBe('2026-09-28');
    expect(workDate(p, '2026-09-28', '06:00', '14:00')).toBe('2026-09-28');
  });

  it('Spätschicht bis 23 Uhr steht mit Option an ihrem Tag', () => {
    const p = hahn();
    setShiftToNextDay(p, true);
    const st: AppState = {
      ...state(p),
      sessions: [{ id: 'sp', projectId: 'p', start: combine('2026-09-29', '15:00'), end: combine('2026-09-29', '23:00'), pauses: [] }],
    };
    const idx = buildIndex(st, 'p');
    expect(daySummary(p, '2026-09-29', idx, now).sessions).toHaveLength(1);
    expect(daySummary(p, '2026-09-30', idx, now).sessions).toHaveLength(0);
  });

  it('Monatsgrenze: Schicht ab 30.09. zählt im Oktober', () => {
    const p = hahn();
    setShiftToNextDay(p, true);
    const st: AppState = {
      ...state(p),
      sessions: [{ id: 'x', projectId: 'p', start: combine('2026-09-30', '21:30'), end: combine('2026-10-01', '06:00'), pauses: [] }],
    };
    const later = combine('2026-10-05', '12:00');
    expect(monthSummary(st, p, 2026, 8, later).worked).toBe(0);
    expect(monthSummary(st, p, 2026, 9, later).worked).toBe(510);
  });
});

describe('„Zeit nachtragen“: Beginn der neuen Buchung', () => {
  const plain = { shiftToNextDay: false };
  const d = '2026-10-14';
  const at = (hm: string, day = d) => combine(day, hm);

  it('beginnt zur aktuellen Uhrzeit, wenn noch nichts erfasst ist', () => {
    expect(suggestedStart(plain, d, [], 480, '08:15')).toBe(at('08:15'));
  });
  it('setzt eine weitere Buchung 30 min nach die letzte', () => {
    expect(suggestedStart(plain, d, [{ start: at('06:00'), end: at('10:00') }], 240, '09:00')).toBe(at('10:30'));
  });
  it('stünde sie dann beim Folgetag, kommt sie vor die erste Buchung', () => {
    // Spätschicht bis 23:47 – danach wäre schon der 15.10.
    expect(suggestedStart(plain, d, [{ start: at('15:17'), end: at('23:47') }], 480, '15:17')).toBe(at('06:47'));
  });
  it('passt nichts, bleibt sie am Tag (lieber sichtbar überschneiden als verschwinden)', () => {
    const existing = [
      { start: at('06:00'), end: at('14:00') },
      { start: at('14:30'), end: at('23:50') },
    ];
    expect(suggestedStart(plain, d, existing, 480, '09:00')).toBe(at('09:00'));
  });
  it('bleibt bei Nachtschichten (Folgetag) am angezeigten Tag', () => {
    const night = { shiftToNextDay: true };
    // Angezeigt am 14.10.: Schicht 13.10. 22:00 – 14.10. 06:00; die neue Buchung muss ebenfalls beim 14.10. stehen
    const start = suggestedStart(night, d, [{ start: at('22:00', '2026-10-13'), end: at('06:00') }], 240, '07:00');
    expect(sessionDay(night, { start, end: start + 240 * 60_000 })).toBe(d);
  });
});
