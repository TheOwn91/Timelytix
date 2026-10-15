import { describe, expect, it } from 'vitest';
import { uiScaleFactor } from './uiScale';

describe('Anzeigegröße', () => {
  it('nimmt die gewählte Stufe', () => {
    expect(uiScaleFactor('small', 1.3, 412)).toBe(0.9);
    expect(uiScaleFactor('normal', 1.3, 412)).toBe(1);
    expect(uiScaleFactor('large', 1, 412)).toBe(1.15);
  });
  it('folgt bei „Wie Handy“ der Schriftgröße von Android, begrenzt auf 85–130 %', () => {
    expect(uiScaleFactor('auto', 1.1, 412)).toBe(1.1);
    expect(uiScaleFactor('auto', 2, 600)).toBe(1.3);
    expect(uiScaleFactor('auto', 0.5, 412)).toBe(0.85);
    expect(uiScaleFactor('auto', NaN, 412)).toBe(1);
  });
  it('vergrößert nur, solange die Seite auf schmalen Handys nicht über den Rand ragt', () => {
    // 360 px breit: höchstens 360 / 340 ≈ 105,9 % – abgerundet auf 105 %
    expect(uiScaleFactor('large', 1, 360)).toBe(1.05);
    // 320 px: nicht größer als 100 %, kleiner geht
    expect(uiScaleFactor('large', 1, 320)).toBe(1);
    expect(uiScaleFactor('small', 1, 320)).toBe(0.9);
  });
  it('ragt bei keiner Breite über den Rand', () => {
    for (let w = 300; w <= 460; w++) {
      for (const c of ['large', 'auto'] as const) expect(uiScaleFactor(c, 1.3, w) * 340).toBeLessThanOrEqual(Math.max(w, 340) + 1e-9);
    }
  });
});
