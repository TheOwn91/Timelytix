import { describe, expect, it } from 'vitest';
import { compareVersions, latestApkRelease } from './apk-update';

const rel = (v: string, apk = true) => ({
  tag_name: `v${v}`,
  draft: false,
  body: `**01.10.2026**\n\n- Neu in ${v}\n- Zweiter Punkt`,
  assets: apk ? [{ name: `Timelytix-${v}.apk`, browser_download_url: `https://example.org/Timelytix-${v}.apk` }] : [],
});

describe('Updates der Android-App über GitHub', () => {
  it('vergleicht Versionsnummern', () => {
    expect(compareVersions('0.22.0', '0.21.9')).toBeGreaterThan(0);
    expect(compareVersions('0.9.0', '0.10.0')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('nimmt die neueste Version mit APK, neuere ohne APK (noch im Bau) nicht', () => {
    const latest = latestApkRelease([rel('0.23.0', false), rel('0.21.0'), rel('0.22.0')]);
    expect(latest?.version).toBe('0.22.0');
    expect(latest?.apkUrl).toBe('https://example.org/Timelytix-0.22.0.apk');
    expect(latest?.changes).toEqual(['Neu in 0.22.0', 'Zweiter Punkt']);
    expect(latest?.date).toBe('01.10.2026');
    expect(latest?.history?.map((r) => r.version)).toEqual(['0.22.0', '0.21.0']);
  });

  it('Beta liegt vor ihrer Version', () => {
    expect(compareVersions('0.25.0-beta.2', '0.24.1')).toBeGreaterThan(0);
    expect(compareVersions('0.25.0-beta.2', '0.25.0')).toBeLessThan(0);
    expect(compareVersions('0.25.0-beta.10', '0.25.0-beta.9')).toBeGreaterThan(0);
    expect(compareVersions('0.25.0-beta.3', '0.25.0-beta.3')).toBe(0);
  });

  it('Betas nur, wenn eingeschaltet', () => {
    const list = [rel('0.25.0-beta.12'), rel('0.24.1'), rel('0.24.0')];
    expect(latestApkRelease(list)?.version).toBe('0.24.1');
    const beta = latestApkRelease(list, true);
    expect(beta?.version).toBe('0.25.0-beta.12');
    expect(beta?.history?.map((r) => r.version)).toEqual(['0.25.0-beta.12', '0.24.1', '0.24.0']);
    // Die richtige Version ist neuer als ihre Beta
    expect(latestApkRelease([rel('0.25.0'), ...list], true)?.version).toBe('0.25.0');
  });

  it('ohne APK kein Update', () => {
    expect(latestApkRelease([rel('0.21.0', false)])).toBeUndefined();
  });
});
