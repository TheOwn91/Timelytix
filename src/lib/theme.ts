import { registerPlugin } from '@capacitor/core';
import { NATIVE } from './native';

/**
 * Android-App ab Android 12: Farben vom Hintergrundbild (Material You). Android liefert seine Farbpaletten
 * (android/…/ThemePlugin.java), hier werden daraus die Farb-Tokens aus styles.css für hell und dunkel.
 * Signalfarben (Pause, Beenden, Abwesenheiten, Saldo) bleiben unverändert. Die Web-App bleibt beim Blau.
 */

/** z. B. { accent1_600: '#3f5f90', neutral1_50: '#f1f0f4', … } */
export type SystemPalette = Record<string, string>;

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

/** Zwischenton: `t` = 0 → a, 1 → b (Android liefert nur feste Stufen). */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [hex(a), hex(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

const NEEDED = ['accent1_0', 'accent1_100', 'accent1_200', 'accent1_600', 'accent1_700', 'accent1_800',
  'neutral1_10', 'neutral1_50', 'neutral1_800', 'neutral1_900', 'neutral1_1000',
  'neutral2_50', 'neutral2_100', 'neutral2_200', 'neutral2_700'];

/** Tokens für hell und dunkel – null, wenn die Palette unvollständig ist. */
export function dynamicTokens(p: SystemPalette): { light: Record<string, string>; dark: Record<string, string> } | null {
  if (!NEEDED.every((k) => /^#[0-9a-f]{6}$/i.test(p[k] ?? ''))) return null;
  return {
    light: {
      '--bg': p.neutral1_50,
      '--card': p.neutral1_10,
      '--raised': p.neutral1_10,
      '--off': p.neutral2_50,
      '--border': p.neutral2_100,
      '--text': mix(p.neutral1_900, p.neutral1_1000, 0.3),
      '--muted': p.neutral2_700,
      '--primary': p.accent1_600,
      '--on-primary': p.accent1_0,
      '--link': p.accent1_700,
      '--primary-soft': p.accent1_100,
    },
    dark: {
      '--bg': mix(p.neutral1_900, p.neutral1_1000, 0.45),
      '--card': mix(p.neutral1_900, p.neutral1_800, 0.2),
      '--raised': mix(p.neutral1_900, p.neutral1_800, 0.5),
      '--off': mix(p.neutral1_900, p.neutral1_1000, 0.2),
      '--border': p.neutral2_700,
      '--text': p.neutral1_50,
      '--muted': p.neutral2_200,
      '--primary': p.accent1_200,
      '--on-primary': p.accent1_800,
      '--link': p.accent1_200,
      '--primary-soft': p.accent1_700,
    },
  };
}

/** CSS mit denselben drei Blöcken wie styles.css (hell, dunkel per System, dunkel per data-theme). */
export function dynamicCss(p: SystemPalette): string | null {
  const t = dynamicTokens(p);
  if (!t) return null;
  const block = (vars: Record<string, string>) =>
    Object.entries(vars)
      .map(([k, v]) => `${k}:${v};`)
      .join('');
  return (
    `:root{${block(t.light)}}` +
    `@media (prefers-color-scheme: dark){:root:not([data-theme='light']){${block(t.dark)}}}` +
    `:root[data-theme='dark']{${block(t.dark)}}`
  );
}

interface ThemePlugin {
  colors(): Promise<SystemPalette & { available?: boolean }>;
}

const Theme = NATIVE ? registerPlugin<ThemePlugin>('TimelytixTheme') : undefined;
const STYLE_ID = 'dynamic-colors';

/** Farben vom Hintergrundbild übernehmen (beim Start und beim Zurückholen der App – das Bild kann sich ändern). */
export async function applyDynamicColors() {
  if (!Theme) return;
  const palette = await Theme.colors().catch(() => null);
  const css = palette?.available ? dynamicCss(palette) : null;
  let el = document.getElementById(STYLE_ID);
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    // Nach styles.css, damit diese Werte gelten
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;
}
