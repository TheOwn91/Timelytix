import { describe, expect, it } from 'vitest';
import { releasesForUpdate, releasesSince, type Release } from './changelog';

const log: Release[] = [
  { version: '1.2.0', date: '', changes: ['c'] },
  { version: '1.1.0', date: '', changes: ['b'] },
  { version: '1.0.0', date: '', changes: ['a'] },
];

describe('releasesSince', () => {
  it('zeigt bei Erstinstallation nichts', () => expect(releasesSince(null, log)).toEqual([]));
  it('zeigt nichts, wenn die Version schon gesehen wurde', () => expect(releasesSince('1.2.0', log)).toEqual([]));
  it('zeigt alle Versionen seit der zuletzt gesehenen', () =>
    expect(releasesSince('1.0.0', log).map((r) => r.version)).toEqual(['1.2.0', '1.1.0']));
  it('zeigt bei unbekannter Version nur die neueste', () =>
    expect(releasesSince('0.9', log).map((r) => r.version)).toEqual(['1.2.0']));
});

describe('releasesForUpdate', () => {
  const r = (version: string): Release => ({ version, date: '', changes: [version] });
  const latest = { ...r('0.12.0'), history: [r('0.12.0'), r('0.11.2'), r('0.11.1'), r('0.11.0')] };
  it('zeigt alle Versionen seit der installierten', () =>
    expect(releasesForUpdate(latest, '0.11.1').map((x) => x.version)).toEqual(['0.12.0', '0.11.2']));
  it('nichts, wenn schon aktuell', () => expect(releasesForUpdate(latest, '0.12.0')).toEqual([]));
  it('unbekannte Version: alle bekannten Einträge', () => expect(releasesForUpdate(latest, '0.1.0')).toHaveLength(4));
  it('von einer Beta: nur die Versionen danach', () =>
    expect(releasesForUpdate(latest, '0.12.0-beta.5').map((x) => x.version)).toEqual(['0.12.0']));
  it('ältere version.json ohne Verlauf: nur die neueste', () =>
    expect(releasesForUpdate(r('0.12.0'), '0.11.1').map((x) => x.version)).toEqual(['0.12.0']));
});
