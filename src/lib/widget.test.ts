import { describe, expect, it } from 'vitest';
import { combine } from './time';
import type { AppState, Project } from './types';
import { androidColor, applyWidgetActions, parseWidgetActions, widgetSnapshot } from './widget';

const project = (id: string, extra: Partial<Project> = {}): Project => ({
  id, name: id.toUpperCase(), color: '#2563eb', hourlyRate: 0, dailyTargetHours: 8, workdays: [1, 2, 3, 4, 5],
  autoBreak: true, state: '', surcharges: [], startDate: '2026-10-01', ...extra,
});
const state = (extra: Partial<AppState> = {}): AppState => ({
  version: 1, projects: [project('a'), project('b'), project('c', { archived: true })], sessions: [], absences: [], ...extra,
});
const t = (hm: string) => combine('2026-10-14', hm);

describe('Aktionen aus Widget und Benachrichtigung', () => {
  it('übernimmt Start, Pause, Weiter und Beenden mit ihren Uhrzeiten', () => {
    const s = state();
    applyWidgetActions(s, [
      { type: 'select', at: t('07:59'), projectId: 'b' },
      { type: 'start', at: t('08:00'), projectId: 'b' },
      { type: 'pause', at: t('12:00') },
      { type: 'resume', at: t('12:30') },
      { type: 'stop', at: t('16:30') },
    ]);
    expect(s.selectedProjectId).toBe('b');
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0]).toMatchObject({ projectId: 'b', start: t('08:00'), end: t('16:30'), pauses: [{ start: t('12:00'), end: t('12:30') }] });
  });

  it('überspringt, was nicht passt', () => {
    const running = { id: 'r', projectId: 'a', start: t('08:00'), pauses: [] };
    const s = state({ sessions: [running] });
    applyWidgetActions(s, [
      { type: 'start', at: t('09:00'), projectId: 'b' }, // läuft schon
      { type: 'select', at: t('09:01'), projectId: 'b' }, // während die Zeit läuft
      { type: 'resume', at: t('09:02') }, // keine Pause offen
    ]);
    expect(s.sessions).toHaveLength(1);
    expect(s.selectedProjectId).toBeUndefined();
    expect(s.sessions[0].pauses).toEqual([]);
    applyWidgetActions(s, [{ type: 'stop', at: t('07:00') }]); // vor dem Beginn: gehört zu einer früheren Zeit
    expect(s.sessions[0].end).toBeUndefined();
  });

  it('startet auch für einen archivierten Arbeitgeber (das Widget bot ihn an)', () => {
    const s = state();
    applyWidgetActions(s, [{ type: 'start', at: t('10:00'), projectId: 'c' }]);
    expect(s.sessions).toMatchObject([{ projectId: 'c', start: t('10:00') }]);
    applyWidgetActions(s, [{ type: 'stop', at: t('11:00') }, { type: 'start', at: t('12:00'), projectId: 'gibt-es-nicht' }]);
    expect(s.sessions).toHaveLength(1);
  });

  it('übernimmt dieselben Aktionen nur einmal (Android löscht sie erst nach dem Speichern)', () => {
    const s = state();
    const batch = [
      { type: 'start', at: t('08:00'), projectId: 'a' },
      { type: 'pause', at: t('12:00') },
      { type: 'resume', at: t('12:30') },
      { type: 'stop', at: t('16:30') },
    ] as const;
    applyWidgetActions(s, [...batch]);
    const once = structuredClone(s.sessions);
    applyWidgetActions(s, [...batch]);
    expect(s.sessions).toEqual(once);
    // Auch wenn danach in der App schon eine neue Zeit läuft
    s.sessions.push({ id: 'neu', projectId: 'a', start: t('17:00'), pauses: [] });
    applyWidgetActions(s, [...batch]);
    expect(s.sessions).toHaveLength(2);
    expect(s.sessions[1]).toMatchObject({ start: t('17:00'), pauses: [] });
    expect(s.sessions[1].end).toBeUndefined();
  });

  it('Weiter vor Beginn der Pause lässt die Pause weg; Beenden kürzt spätere Pausen', () => {
    const s = state({ sessions: [{ id: 'r', projectId: 'a', start: t('08:00'), pauses: [{ start: t('12:00') }] }] });
    applyWidgetActions(s, [{ type: 'resume', at: t('11:59') }]);
    expect(s.sessions[0].pauses).toEqual([]);
    s.sessions[0].pauses.push({ start: t('13:00'), end: t('13:30') }, { start: t('15:00') });
    applyWidgetActions(s, [{ type: 'stop', at: t('13:10') }]);
    expect(s.sessions[0]).toMatchObject({ end: t('13:10'), pauses: [{ start: t('13:00'), end: t('13:10') }] });
  });

  it('beendet eine offene Pause mit', () => {
    const s = state({ sessions: [{ id: 'r', projectId: 'a', start: t('08:00'), pauses: [{ start: t('12:00') }] }] });
    applyWidgetActions(s, [{ type: 'stop', at: t('12:10') }]);
    expect(s.sessions[0]).toMatchObject({ end: t('12:10'), pauses: [{ start: t('12:00'), end: t('12:10') }] });
  });

  it('liest nur gültige Aktionen, in der Reihenfolge der Tipps (auch wenn die Uhr zurückgestellt wurde)', () => {
    const raw = JSON.stringify([
      { type: 'stop', at: 2, seq: 7 },
      { type: 'start', at: 1, projectId: 'a', seq: 8 },
      { type: 'hack', at: 3 },
      { type: 'pause', at: 'x' },
      { type: 'pause', at: 4, seq: 'y' },
    ]);
    expect(parseWidgetActions(raw)).toEqual([
      { type: 'stop', at: 2, seq: 7 },
      { type: 'start', at: 1, projectId: 'a', seq: 8 },
    ]);
    expect(parseWidgetActions('kaputt')).toEqual([]);
  });
});

describe('Auszug fürs Widget', () => {
  it('lässt archivierte Arbeitgeber weg und nimmt den gewählten', () => {
    const snap = widgetSnapshot(state({ selectedProjectId: 'b' }), t('10:00'));
    expect(snap.projects.map((p) => p.id)).toEqual(['a', 'b']);
    expect(snap.selected).toBe('b');
    expect(snap.running).toBeNull();
  });

  it('beschreibt die laufende Zeit samt Pausen und der übrigen Arbeit des Tages', () => {
    const s = state({
      sessions: [
        { id: 'früh', projectId: 'a', start: t('05:00'), end: t('06:00'), pauses: [{ start: t('05:20'), end: t('05:30') }] },
        { id: 'r', projectId: 'a', start: t('07:00'), pauses: [{ start: t('09:00'), end: t('09:10') }, { start: t('13:00') }] },
        { id: 'b', projectId: 'b', start: t('06:00'), end: t('06:30'), pauses: [] },
      ],
    });
    const snap = widgetSnapshot(s, t('13:05'));
    expect(snap.selected).toBe('a');
    expect(snap.running).toEqual({
      projectId: 'a',
      start: t('07:00'),
      pauses: [
        [t('09:00'), t('09:10')],
        [t('13:00'), null],
      ],
      dayWork: [
        [t('05:00'), t('05:20')],
        [t('05:30'), t('06:00')],
      ],
    });
    expect(snap.projects.find((p) => p.id === 'b')!.today).toEqual([[t('06:00'), t('06:30')]]);
    expect(snap.projects[0].autoBreak).toBe(30);
    expect(snap.dayEnd - snap.dayStart).toBe(24 * 3600_000);
  });

  it('wandelt Farben für Android um', () => {
    expect(androidColor('#abc')).toBe('#aabbcc');
    expect(androidColor('#11223344')).toBe('#44112233');
    expect(androidColor('#2563eb')).toBe('#2563eb');
  });
});
