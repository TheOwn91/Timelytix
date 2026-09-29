import { describe, expect, it } from 'vitest';
import { demoState } from './demo';
import { validateState } from './validate';

const json = (v: unknown) => JSON.parse(JSON.stringify(v));

describe('Daten prüfen (Speicher und Datensicherung)', () => {
  it('lässt gültige Daten unverändert', () => {
    const state = demoState();
    expect(json(validateState(json(state)))).toEqual(json(state));
  });

  it('lehnt Dateien ohne Arbeitgeber und Buchungen ab', () => {
    expect(() => validateState(null)).toThrow();
    expect(() => validateState({ projects: 'x', sessions: [] })).toThrow();
  });

  it('lässt kaputte Einträge weg und setzt Standardwerte', () => {
    const s = validateState({
      projects: [
        { id: 'p', name: 'A', color: 'red;background:url(https://example.com)', hourlyRate: '20', workdays: [1, 9, 'x'], surcharges: [{ id: 's', kind: 'bogus' }] },
        { name: 'ohne id' },
      ],
      sessions: [
        { id: 'ok', projectId: 'p', start: 1000, end: 500, pauses: [{ start: 'x' }, { start: 700 }] },
        { id: 'kaputt', projectId: 'p', start: 'gestern' },
      ],
      absences: [
        { id: 'a', projectId: 'p', date: '2026-09-01', type: 'urlaub' },
        { id: 'b', projectId: 'p', date: '1.9.2026', type: 'urlaub' },
        { id: 'c', projectId: 'p', date: '2026-09-02', type: 'toString' },
      ],
    });
    expect(s.projects).toHaveLength(1);
    expect(s.projects[0].color).toBe('#2563eb');
    expect(s.projects[0].hourlyRate).toBe(0);
    expect(s.projects[0].workdays).toEqual([1]);
    expect(s.projects[0].surcharges).toEqual([]);
    expect(s.sessions.map((x) => x.id)).toEqual(['ok']);
    // Ende vor dem Beginn → 0 Minuten statt negativer Zeit
    expect(s.sessions[0].end).toBe(1000);
    expect(s.sessions[0].pauses).toEqual([{ start: 700 }]);
    expect(s.absences.map((a) => a.id)).toEqual(['a']);
  });
});

describe('Schlüssel ausblenden', () => {
  it('übernimmt nur bekannte Schlüssel', () => {
    const s = validateState({ projects: [{ id: 'p', hiddenAbsences: ['kurzarbeit', 'toString', 5] }], sessions: [] });
    expect(s.projects[0].hiddenAbsences).toEqual(['kurzarbeit']);
  });
});
