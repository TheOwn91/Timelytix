import { describe, expect, it } from 'vitest';
import { notifyOnWatch, runningNotice, setNotifyOnWatch } from './status';
import { combine } from './time';
import type { AppState } from './types';

const base = (sessions: AppState['sessions']): AppState => ({
  version: 1,
  projects: [{ id: 'p', name: 'Muster GmbH' } as AppState['projects'][number]],
  sessions,
  absences: [],
});

describe('runningNotice', () => {
  const start = combine('2026-09-25', '07:02');
  it('ohne laufende Zeit keine Anzeige', () => {
    expect(runningNotice(base([{ id: 'a', projectId: 'p', start, end: start + 1000, pauses: [] }]))).toBeNull();
  });
  it('zeigt Arbeitgeber und Beginn', () => {
    const n = runningNotice(base([{ id: 'a', projectId: 'p', start, pauses: [] }]));
    expect(n?.title).toBe('⏱ Zeit läuft – Muster GmbH');
    expect(n?.body).toContain('Seit 07:02');
  });
  it('zeigt die laufende Pause', () => {
    const p = combine('2026-09-25', '11:30');
    const n = runningNotice(base([{ id: 'a', projectId: 'p', start, pauses: [{ start: p }] }]));
    expect(n?.title).toBe('‖ Pause – Muster GmbH');
    expect(n?.body).toBe('Pause seit 11:30 · Arbeitsbeginn 07:02');
  });
});

describe('„Zeit läuft“ auch auf der Uhr', () => {
  it('ist standardmäßig aus und merkt sich die Wahl', async () => {
    const store = new Map<string, string>();
    const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true });
    expect(notifyOnWatch()).toBe(false);
    await setNotifyOnWatch(true);
    expect(notifyOnWatch()).toBe(true);
    await setNotifyOnWatch(false);
    expect(notifyOnWatch()).toBe(false);
  });
});
