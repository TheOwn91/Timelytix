import { addDays, dateKey, parseHM } from './time';
import type { DateKey, Project, Session, Weekday } from './types';

/**
 * Option „Nachtschicht dem Folgetag zuordnen“: Eine Schicht, die über 0:00 Uhr geht, steht beim
 * Folgetag (Anstempeln Sonntag 21:30, Ende Montag 06:00 → steht beim Montag). Endet sie vor
 * Mitternacht, bleibt sie an ihrem Tag. Zulagen werden weiter nach den echten Uhrzeiten berechnet.
 */

type ShiftProject = Pick<Project, 'shiftToNextDay'>;

/** Ist die Zuordnung zum Folgetag für diesen Arbeitgeber aktiv? */
export function shiftsToNextDay(p: ShiftProject): boolean {
  return !!p.shiftToNextDay;
}

/** Geht eine Buchung über 0:00 Uhr? Eine laufende Zeit erst, wenn Mitternacht vorbei ist. */
export function crossesMidnight(s: Pick<Session, 'start' | 'end'>, now = Date.now()): boolean {
  // Ende genau um 0:00 zählt noch zum Vortag
  return dateKey((s.end ?? now) - 1) > dateKey(s.start);
}

/** Tag, bei dem eine Buchung angezeigt und gezählt wird. */
export function sessionDay(p: ShiftProject, s: Pick<Session, 'start' | 'end'>, now = Date.now()): DateKey {
  const day = dateKey(s.start);
  return shiftsToNextDay(p) && crossesMidnight(s, now) ? addDays(day, 1) : day;
}

/**
 * Kalendertag des Beginns einer Buchung, die am Tag `shownDate` steht: bei aktiver Option und einer
 * Schicht über Mitternacht (Beginn später als Ende, z. B. 21:30–06:00) der Vortag, sonst der Tag selbst.
 */
export function workDate(p: ShiftProject, shownDate: DateKey, startHm: string, endHm: string): DateKey {
  return shiftsToNextDay(p) && parseHM(startHm) > parseHM(endHm) ? addDays(shownDate, -1) : shownDate;
}

/** Arbeitstage um `delta` Tage verschieben (z. B. So–Do → Mo–Fr). */
export function shiftWeekdays(days: Weekday[], delta: number): Weekday[] {
  return days.map((d) => (((d + delta) % 7) + 7) % 7 as Weekday).sort((a, b) => a - b);
}

/**
 * Option ein-/ausschalten (ändert `p`). Die Arbeitstage – auch in allen „gültig ab“-Zeiträumen –
 * wandern mit, damit das Soll an den angezeigten Tagen gezählt wird.
 */
export function setShiftToNextDay(p: Project, on: boolean) {
  if (!!p.shiftToNextDay === on) return;
  const delta = on ? 1 : -1;
  p.shiftToNextDay = on;
  p.workdays = shiftWeekdays(p.workdays, delta);
  if (p.terms) p.terms = p.terms.map((t) => ({ ...t, workdays: shiftWeekdays(t.workdays, delta) }));
}
