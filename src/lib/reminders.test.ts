import { afterEach, describe, expect, it } from 'vitest';
import { applyReminders, reminders, weekGaps, type Reminder, type ReminderDriver } from './reminders';
import { combine } from './time';
import type { AppState, Project } from './types';

const project: Project = {
  id: 'p',
  name: 'Test',
  color: '#000',
  hourlyRate: 0,
  dailyTargetHours: 8,
  workdays: [1, 2, 3, 4, 5],
  autoBreak: false,
  state: 'NW',
  surcharges: [],
  startDate: '2026-09-01',
};

const day = (date: string, id = date) => ({ id, projectId: 'p', start: combine(date, '08:00'), end: combine(date, '16:00'), pauses: [] });

const state = (partial: Partial<AppState> = {}): AppState => ({ version: 1, projects: [project], sessions: [], absences: [], ...partial });

// Woche Mo 5.10. – Fr 9.10.2026, Samstag 10.10.
const SAT = combine('2026-10-10', '10:00');

class FakeDriver implements ReminderDriver {
  shown: Reminder[] = [];
  removed: number[] = [];
  constructor(private web = false) {}
  async show(r: Reminder, now: number) {
    if (this.web && r.at > now) return false;
    this.shown.push(r);
    return true;
  }
  async remove(id: number) {
    this.removed.push(id);
  }
}

// Test-Umgebung ohne Browser: einfacher Ersatz für localStorage
const mem = new Map<string, string>();
globalThis.localStorage ??= {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

afterEach(() => localStorage.clear());

describe('Erinnerung bei fehlenden Tagen', () => {
  it('findet fehlende Arbeitstage Montag–Freitag', () => {
    const st = state({ sessions: [day('2026-10-05'), day('2026-10-06'), day('2026-10-08')], absences: [{ id: 'a', projectId: 'p', date: '2026-10-09', type: 'urlaub' }] });
    expect(weekGaps(st, SAT)).toEqual([{ name: 'Test', dates: ['2026-10-07'] }]);
  });

  it('plant für den nächsten Samstag 10 Uhr, auch für noch kommende Tage', () => {
    const now = combine('2026-10-07', '12:00');
    const r = reminders(state({ sessions: [day('2026-10-05'), day('2026-10-06')] }), now);
    expect(r.next?.at).toBe(SAT);
    expect(r.next?.body.split(', ')).toHaveLength(3);
    expect(r.current).toBeNull();
  });

  it('keine Erinnerung, wenn alles eingetragen ist oder sie ausgeschaltet ist', () => {
    const full = state({ sessions: ['05', '06', '07', '08', '09'].map((d) => day(`2026-10-${d}`)) });
    expect(reminders(full, combine('2026-10-09', '18:00')).next).toBeNull();
    const off = state({ settings: { weekReminder: false } });
    expect(reminders(off, combine('2026-10-09', '18:00')).next).toBeNull();
  });

  it('Feiertage und Tage vor Erfassungsbeginn fehlen nicht', () => {
    // Ostermontag 6.4.2026 ist Feiertag
    const p = { ...project, startDate: '2026-04-01' };
    const st = state({ projects: [p], sessions: ['07', '08', '09', '10'].map((d) => day(`2026-04-${d}`)) });
    expect(weekGaps(st, combine('2026-04-11', '10:00'))).toEqual([]);
    expect(weekGaps(state({ projects: [{ ...project, startDate: '2026-10-08' }], sessions: [day('2026-10-08'), day('2026-10-09')] }), SAT)).toEqual([]);
  });
});

describe('Planen und Entfernen', () => {
  it('Android: plant einmal, ändert nur bei neuem Inhalt und entfernt, wenn alles eingetragen ist', async () => {
    const d = new FakeDriver();
    const st = state({ sessions: [day('2026-10-05')] });
    await applyReminders(st, combine('2026-10-08', '18:00'), d, true);
    expect(d.shown.map((r) => r.at)).toEqual([SAT]);
    await applyReminders(st, combine('2026-10-08', '19:00'), d, true);
    expect(d.shown).toHaveLength(1);
    const full = state({ sessions: ['05', '06', '07', '08', '09'].map((x) => day(`2026-10-${x}`)) });
    await applyReminders(full, combine('2026-10-09', '18:00'), d, true);
    expect(d.removed).toHaveLength(1);
  });

  it('am Wochenende bleibt die gemeldete Erinnerung stehen, die nächste Woche wird geplant', async () => {
    const d = new FakeDriver();
    const st = state({ sessions: [day('2026-10-05')] });
    await applyReminders(st, combine('2026-10-09', '18:00'), d, true);
    await applyReminders(st, combine('2026-10-10', '12:00'), d, true);
    // Kein zweites Melden für diesen Samstag, aber die Erinnerung für den 17.10. ist geplant
    expect(d.shown.filter((r) => r.at === SAT)).toHaveLength(1);
    expect(d.shown.some((r) => r.at === combine('2026-10-17', '10:00'))).toBe(true);
    expect(d.removed).toEqual([]);
    // Nachgetragen: Die Erinnerung vom Samstag verschwindet
    const full = state({ sessions: ['05', '06', '07', '08', '09'].map((x) => day(`2026-10-${x}`)) });
    const before = d.removed.length;
    await applyReminders(full, combine('2026-10-11', '09:00'), d, true);
    expect(d.removed.length).toBeGreaterThan(before);
  });

  it('Web: zeigt erst, wenn fällig, und nur einmal', async () => {
    const d = new FakeDriver(true);
    const st = state({ sessions: [day('2026-10-05')] });
    await applyReminders(st, combine('2026-10-09', '18:00'), d, true);
    expect(d.shown).toHaveLength(0);
    await applyReminders(st, combine('2026-10-10', '10:01'), d, true);
    await applyReminders(st, combine('2026-10-10', '10:02'), d, true);
    expect(d.shown.filter((r) => r.at === SAT)).toHaveLength(1);
  });
});

describe('Vergessen abzustempeln', () => {
  const running = (start: string) => ({ id: 'run', projectId: 'p', start: combine('2026-10-08', start), pauses: [] });

  it('nach der eingestellten Zeit (Standard 10 Stunden)', () => {
    const r = reminders(state({ sessions: [running('07:00')] }), combine('2026-10-08', '08:00'));
    expect(r.forgot?.at).toBe(combine('2026-10-08', '17:00'));
    const r12 = reminders(state({ sessions: [running('07:00')], settings: { forgotStopHours: 12 } }), combine('2026-10-08', '08:00'));
    expect(r12.forgot?.at).toBe(combine('2026-10-08', '19:00'));
    expect(reminders(state({ sessions: [running('07:00')], settings: { forgotStopHours: 0 } }), 0).forgot).toBeNull();
  });

  it('wird nach dem Stoppen entfernt und ohne Erlaubnis nicht geplant', async () => {
    const d = new FakeDriver();
    await applyReminders(state({ sessions: [running('07:00')] }), combine('2026-10-08', '08:00'), d, true);
    expect(d.shown.map((r) => r.id)).toContain(4);
    await applyReminders(state({ sessions: [{ ...running('07:00'), end: combine('2026-10-08', '15:00') }] }), combine('2026-10-08', '15:00'), d, true);
    expect(d.removed).toContain(4);
    const d2 = new FakeDriver();
    localStorage.clear();
    await applyReminders(state({ sessions: [running('07:00')] }), combine('2026-10-08', '08:00'), d2, false);
    expect(d2.shown).toEqual([]);
  });
});
