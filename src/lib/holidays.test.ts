import { describe, expect, it } from 'vitest';
import { holidayName } from './holidays';

describe('Feiertage', () => {
  it('Reformationstag: 2017 bundesweit, in Norddeutschland erst ab 2018', () => {
    expect(holidayName('2017-10-31', 'NW')).toBe('Reformationstag');
    expect(holidayName('2016-10-31', 'NI')).toBeUndefined();
    expect(holidayName('2016-10-31', 'SN')).toBe('Reformationstag');
    expect(holidayName('2018-10-31', 'HH')).toBe('Reformationstag');
    expect(holidayName('2018-10-31', 'NW')).toBeUndefined();
  });
  it('8. Mai nur 2020 und 2025 in Berlin', () => {
    expect(holidayName('2025-05-08', 'BE')).toBe('Tag der Befreiung');
    expect(holidayName('2020-05-08', 'BE')).toBe('Tag der Befreiung');
    expect(holidayName('2026-05-08', 'BE')).toBeUndefined();
    expect(holidayName('2025-05-08', 'BB')).toBeUndefined();
  });
  it('bewegliche Feiertage', () => {
    expect(holidayName('2026-04-03', 'NW')).toBe('Karfreitag');
    expect(holidayName('2026-06-04', 'NW')).toBe('Fronleichnam');
    expect(holidayName('2026-11-18', 'SN')).toBe('Buß- und Bettag');
  });
});
