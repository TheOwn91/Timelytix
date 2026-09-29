import type { AbsenceType, DateKey, Project } from './types';

/**
 * credit       – Tag zählt mit Sollstunden als gearbeitet (Urlaub, Krank, Feiertag)
 * noTarget     – Tag hat kein Soll (frei)
 * debit        – Soll bleibt bestehen, wird aus dem Überstundenkonto genommen
 * debitCapped  – wie debit, aber nur so weit das Konto Plusstunden hat; der Rest des Solls
 *                entfällt, es entstehen keine Minusstunden (Kurzarbeit)
 */
export type AbsenceMode = 'credit' | 'noTarget' | 'debit' | 'debitCapped';

export const ABSENCE_TYPES: Record<
  AbsenceType,
  { label: string; short: string; color: string; mode: AbsenceMode }
> = {
  urlaub: { label: 'Urlaub', short: 'U', color: 'var(--c-urlaub)', mode: 'credit' },
  krank: { label: 'Krank', short: 'K', color: 'var(--c-krank)', mode: 'credit' },
  ueberstunden: { label: 'Überstundenausgleich', short: 'ÜA', color: 'var(--c-ueberstunden)', mode: 'debit' },
  kurzarbeit: { label: 'Kurzarbeit', short: 'KA', color: 'var(--c-kurzarbeit)', mode: 'debitCapped' },
  feiertag: { label: 'Feiertag', short: 'F', color: 'var(--c-feiertag)', mode: 'credit' },
  frei: { label: 'Frei / kein Arbeitstag', short: 'X', color: 'var(--c-frei)', mode: 'noTarget' },
  sonstiges: { label: 'Sonstiges (bezahlt)', short: 'S', color: 'var(--c-sonstiges)', mode: 'credit' },
};

export const ABSENCE_ORDER: AbsenceType[] = [
  'urlaub',
  'krank',
  'ueberstunden',
  'kurzarbeit',
  'feiertag',
  'frei',
  'sonstiges',
];

/** Heiligabend und Silvester kosten nur einen halben Urlaubstag. */
export function vacationDayValue(date: DateKey): number {
  return date.endsWith('-12-24') || date.endsWith('-12-31') ? 0.5 : 1;
}

/**
 * Schlüssel zur Auswahl, ohne die in den Einstellungen ausgeblendeten. `keep` bleibt immer sichtbar
 * (der bereits eingetragene Schlüssel eines Tages, damit er sich ändern oder entfernen lässt).
 */
export function visibleAbsences(p: Pick<Project, 'hiddenAbsences'>, list: AbsenceType[] = ABSENCE_ORDER, keep?: AbsenceType): AbsenceType[] {
  const hidden = new Set(p.hiddenAbsences ?? []);
  return list.filter((t) => t === keep || !hidden.has(t));
}
