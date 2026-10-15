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
    applyWidgetActions(s, [{ type: 'stop', at: t('07:00') }]);
    expect(s.sessions[0].end).toBe(t('08:00')); // nie vor dem Beginn
    applyWidgetActions(s, [{ type: 'start', at: t('10:00'), projectId: 'c' }]); // archiviert
    expect(s.sessions).toHaveLength(1);
  });

  it('beendet eine offene Pause mit', () => {
    const s = state({ sessions: [{ id: 'r', projectId: 'a', start: t('08:00'), pauses: [{ start: t('12:00') }] }] });
    applyWidgetActions(s, [{ type: 'stop', at: t('12:10') }]);
    expect(s.sessions[0]).toMatchObject({ end: t('12:10'), pauses: [{ start: t('12:00'), end: t('12:10') }] });
  });

  it('liest nur gültige Aktionen, sortiert nach Uhrzeit', () => {
    const raw = JSON.stringify([
      { type: 'stop', at: 2 },
      { type: 'start', at: 1, projectId: 'a' },
      { type: 'hack', at: 3 },
      { type: 'pause', at: 'x' },
    ]);
    expect(parseWidgetActions(raw)).toEqual([{ type: 'start', at: 1, projectId: 'a' }, { type: 'stop', at: 2 }]);
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

  it('beschreibt die laufende Zeit samt Pausen und automatischer Pause', () => {
    const s = state({
      sessions: [{ id: 'r', projectId: 'a', start: t('06:00'), pauses: [{ start: t('09:00'), end: t('09:10') }, { start: t('13:00') }] }],
    });
    const snap = widgetSnapshot(s, t('13:05'));
    expect(snap.selected).toBe('a');
    expect(snap.running).toMatchObject({ projectId: 'a', start: t('06:00'), closedPauseMs: 10 * 60_000, pauseStart: t('13:00') });
    // 6 h Arbeit um 12:10 erreicht → 20 min fehlen noch bis 30 min Pause
    expect(snap.running!.autoBreaks).toEqual([[t('12:10'), t('12:30')]]);
  });

  it('wandelt Farben für Android um', () => {
    expect(androidColor('#abc')).toBe('#aabbcc');
    expect(androidColor('#11223344')).toBe('#44112233');
    expect(androidColor('#2563eb')).toBe('#2563eb');
  });
});
