import { expect, it } from 'vitest';
import { surchargeMinutes } from './calc';
import { holidayName } from './holidays';
import { MINUTE, dateKey, parseHM } from './time';
import type { SurchargeRule } from './types';

// Einfache Vergleichsrechnung Minute für Minute (so hat die App früher gerechnet)
function reference(intervals: [number, number][], rules: SurchargeRule[], state: string, mode: 'max' | 'stack') {
  const active = rules.filter((r) => r.enabled);
  const result: Record<string, number> = Object.fromEntries(active.map((r) => [r.id, 0]));
  const matches = (r: SurchargeRule, ts: number) => {
    const d = new Date(ts);
    if (r.kind === 'weekday') return !!r.weekdays?.includes(d.getDay() as never);
    if (r.kind === 'holiday') return !!holidayName(dateKey(d), state);
    if (r.weekdays?.length && !r.weekdays.includes(d.getDay() as never)) return false;
    const m = d.getHours() * 60 + d.getMinutes();
    const from = parseHM(r.from!);
    const to = parseHM(r.to!);
    return from <= to ? m >= from && m < to : m >= from || m < to;
  };
  for (const [start, end] of intervals)
    for (let cur = start; cur < end; ) {
      const next = Math.min(end, Math.floor(cur / MINUTE) * MINUTE + MINUTE);
      const hit = active.filter((r) => matches(r, cur));
      if (mode === 'stack') for (const r of hit) result[r.id] += (next - cur) / MINUTE;
      else if (hit.length) result[hit.reduce((a, b) => (b.percent > a.percent ? b : a)).id] += (next - cur) / MINUTE;
      cur = next;
    }
  return result;
}

const rules: SurchargeRule[] = [
  { id: 'spaet', name: 'Spät', kind: 'time', from: '18:00', to: '22:00', percent: 10, enabled: true },
  { id: 'nacht', name: 'Nacht', kind: 'time', from: '22:00', to: '06:00', percent: 25, enabled: true },
  { id: 'krumm', name: 'Krumm', kind: 'time', from: '02:30', to: '03:17', percent: 30, enabled: true, weekdays: [0, 3] },
  { id: 'sa', name: 'Samstag', kind: 'weekday', weekdays: [6], percent: 20, enabled: true },
  { id: 'so', name: 'Sonntag', kind: 'weekday', weekdays: [0], percent: 50, enabled: true },
  { id: 'ft', name: 'Feiertag', kind: 'holiday', percent: 125, enabled: true },
];

it('Zulagen abschnittsweise = Minute für Minute (auch bei Zeitumstellung und Feiertagen)', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  // Zeitumstellung Okt./März, Weihnachten, 1. Mai
  const bases = ['2026-10-24T20:00:00+02:00', '2026-03-28T20:00:00+01:00', '2026-12-24T12:00:00+01:00', '2026-04-30T12:00:00+02:00'].map(Date.parse);
  for (let i = 0; i < 120; i++) {
    const s = bases[i % 4] + Math.floor(rnd() * 2 * 86_400_000) + Math.floor(rnd() * 60_000);
    const iv: [number, number][] = [[s, s + Math.floor(rnd() * 12 * 3_600_000)]];
    for (const mode of ['max', 'stack'] as const) {
      const got = surchargeMinutes(iv, rules, 'BY', mode);
      const want = reference(iv, rules, 'BY', mode);
      for (const k of Object.keys(want)) expect(got[k]).toBeCloseTo(want[k], 6);
    }
  }
});
