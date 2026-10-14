import type { DateKey } from './types';
import { addDays, dateKey, pad } from './time';

export const STATES: Record<string, string> = {
  '': 'Keine Feiertage',
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
};

/** Ostersonntag nach der Gaußschen Osterformel (gregorianisch). */
export function easterSunday(year: number): DateKey {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const cache = new Map<string, Map<DateKey, string>>();

/** Gesetzliche Feiertage eines Jahres für ein Bundesland. */
export function holidays(year: number, state: string): Map<DateKey, string> {
  const cacheKey = `${year}-${state}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const map = new Map<DateKey, string>();
  if (!state) {
    cache.set(cacheKey, map);
    return map;
  }
  const easter = easterSunday(year);
  const fixed = (m: number, d: number) => `${year}-${pad(m)}-${pad(d)}`;
  const add = (key: DateKey, name: string, states?: string[]) => {
    if (!states || states.includes(state)) map.set(key, name);
  };

  add(fixed(1, 1), 'Neujahr');
  add(fixed(1, 6), 'Heilige Drei Könige', ['BW', 'BY', 'ST']);
  if (year >= 2019) add(fixed(3, 8), 'Internationaler Frauentag', year >= 2023 ? ['BE', 'MV'] : ['BE']);
  add(addDays(easter, -2), 'Karfreitag');
  add(easter, 'Ostersonntag', ['BB']);
  add(addDays(easter, 1), 'Ostermontag');
  add(fixed(5, 1), 'Tag der Arbeit');
  // Einmalig in Berlin: 75. und 80. Jahrestag des Kriegsendes
  if (year === 2020 || year === 2025) add(fixed(5, 8), 'Tag der Befreiung', ['BE']);
  add(addDays(easter, 39), 'Christi Himmelfahrt');
  add(addDays(easter, 49), 'Pfingstsonntag', ['BB']);
  add(addDays(easter, 50), 'Pfingstmontag');
  add(addDays(easter, 60), 'Fronleichnam', ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']);
  add(fixed(8, 15), 'Mariä Himmelfahrt', ['SL']);
  if (year >= 2019) add(fixed(9, 20), 'Weltkindertag', ['TH']);
  add(fixed(10, 3), 'Tag der Deutschen Einheit');
  // 2017 (500 Jahre Reformation) bundesweit; in HB, HH, NI und SH erst seit 2018
  if (year === 2017) add(fixed(10, 31), 'Reformationstag');
  else add(fixed(10, 31), 'Reformationstag', year >= 2018 ? ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'] : ['BB', 'MV', 'SN', 'ST', 'TH']);
  add(fixed(11, 1), 'Allerheiligen', ['BW', 'BY', 'NW', 'RP', 'SL']);
  if (state === 'SN') {
    // Buß- und Bettag: Mittwoch vor dem 23. November
    const d = new Date(year, 10, 22);
    while (d.getDay() !== 3) d.setDate(d.getDate() - 1);
    add(dateKey(d), 'Buß- und Bettag');
  }
  add(fixed(12, 25), '1. Weihnachtstag');
  add(fixed(12, 26), '2. Weihnachtstag');

  cache.set(cacheKey, map);
  return map;
}

export function holidayName(key: DateKey, state: string): string | undefined {
  return holidays(Number(key.slice(0, 4)), state).get(key);
}
