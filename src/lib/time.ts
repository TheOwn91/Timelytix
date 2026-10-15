import type { DateKey } from './types';

export const pad = (n: number) => String(n).padStart(2, '0');

export const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

export const MINUTE = 60_000;

export function dateKey(d: Date | number): DateKey {
  const date = typeof d === 'number' ? new Date(d) : d;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Alle Tage eines Monats (month0 = 0 … 11). */
export function daysOfMonth(year: number, month0: number): DateKey[] {
  const days: DateKey[] = [];
  const d = new Date(year, month0, 1);
  while (d.getMonth() === month0) {
    days.push(dateKey(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Minuten als "7:05". Negative Werte mit Vorzeichen. */
export function fmtDuration(minutes: number, withSign = false): string {
  const rounded = Math.round(minutes);
  const sign = rounded < 0 ? '−' : withSign && rounded > 0 ? '+' : '';
  const abs = Math.abs(rounded);
  return `${sign}${Math.floor(abs / 60)}:${pad(abs % 60)}`;
}

/**
 * Summen von Stunden: als „156:44“ oder – wenn in den Einstellungen gewählt – dezimal „156,73“.
 * Negative Werte mit Vorzeichen, `withSign` zeigt auch „+“.
 */
export function fmtHours(minutes: number, decimal: boolean, withSign = false): string {
  if (!decimal) return fmtDuration(minutes, withSign);
  const h = Math.round(minutes / 0.6) / 100; // auf 0,01 h gerundet
  const sign = h < 0 ? '−' : withSign && h > 0 ? '+' : '';
  return sign + Math.abs(h).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Minuten als Dezimalstunden "7,08". */
export function fmtHoursDecimal(minutes: number): string {
  return (minutes / 60).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDate(key: DateKey, withWeekday = true): string {
  const d = parseDateKey(key);
  const s = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
  return withWeekday ? `${WEEKDAYS_SHORT[d.getDay()]}, ${s}` : s;
}

export function fmtMoney(value: number): string {
  return value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/** "HH:MM" → Minuten seit Mitternacht. */
export function parseHM(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** Datum + "HH:MM" → Zeitstempel. */
export function combine(key: DateKey, hm: string): number {
  const d = parseDateKey(key);
  const [h, m] = hm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
