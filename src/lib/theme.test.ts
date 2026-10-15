import { describe, expect, it } from 'vitest';
import { dynamicCss, dynamicTokens, mix } from './theme';

// Palette wie von Android (Werte nur beispielhaft)
const palette: Record<string, string> = {};
for (const [name, base] of [['accent1', [40, 90, 160]], ['accent2', [80, 90, 110]], ['neutral1', [110, 110, 115]], ['neutral2', [105, 110, 120]]] as const) {
  for (const tone of [0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]) {
    const f = 1 - tone / 1000;
    palette[`${name}_${tone}`] = `#${base.map((v) => Math.round(v * 0.2 + 255 * f * 0.8).toString(16).padStart(2, '0')).join('')}`;
  }
}

describe('Farben vom Hintergrundbild', () => {
  it('mischt Zwischentöne', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#102030', '#102030', 0.3)).toBe('#102030');
  });
  it('setzt die Tokens für hell und dunkel in allen drei Blöcken', () => {
    const css = dynamicCss(palette)!;
    expect(css).toContain(`:root{--bg:${palette.neutral1_50};`);
    expect(css).toContain("@media (prefers-color-scheme: dark){:root:not([data-theme='light']){--bg:");
    expect(css).toContain(":root[data-theme='dark']{--bg:");
    expect(dynamicTokens(palette)!.dark['--primary']).toBe(palette.accent1_200);
  });
  it('ändert nichts bei unvollständiger Palette', () => {
    expect(dynamicCss({ accent1_600: '#123456' })).toBeNull();
  });
});
