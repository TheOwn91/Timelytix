import { registerPlugin } from '@capacitor/core';
import { NATIVE } from './native';

/**
 * Anzeigegröße: Die ganze Oberfläche wächst gleichmäßig (Schrift, Abstände, Knöpfe), indem die
 * Grundschriftgröße skaliert wird (`--ui-scale` in styles.css; Größen deshalb in rem statt px).
 * Android-App: Die WebView würde bei großer Systemschrift sonst nur den Text vergrößern (Kästen bleiben gleich,
 * alles wirkt gequetscht) – das ist in MainActivity.java abgeschaltet, stattdessen gilt hier „Wie Handy“.
 * Die Wahl gilt je Gerät (localStorage), nicht in der Datensicherung.
 */

export type UiScaleChoice = 'auto' | 'small' | 'normal' | 'large';

export const UI_SCALE_OPTIONS: { value: UiScaleChoice; label: string; hint: string }[] = [
  {
    value: 'auto',
    label: NATIVE ? 'Wie Handy' : 'Automatisch',
    hint: NATIVE ? 'folgt der Schriftgröße in den Android-Einstellungen' : '100 %, Zoom des Browsers',
  },
  { value: 'small', label: 'Klein', hint: '90 % – mehr passt auf den Bildschirm' },
  { value: 'normal', label: 'Normal', hint: '100 %' },
  { value: 'large', label: 'Groß', hint: '115 %' },
];

const FACTORS: Record<Exclude<UiScaleChoice, 'auto'>, number> = { small: 0.9, normal: 1, large: 1.15 };
const CHOICE_KEY = 'timetrack.uiScale';
/** Zuletzt bekannte Schriftgröße von Android – damit die App gleich in der richtigen Größe startet. */
const FONT_KEY = 'timetrack.fontScale';
/** Ab dieser Breite (bei 100 %) ist alles erprobt; größer wird nur, solange sie übrig bleibt. */
const MIN_LAYOUT_WIDTH = 340;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignorieren */
  }
}

export function uiScaleChoice(): UiScaleChoice {
  const v = read(CHOICE_KEY);
  return v === 'small' || v === 'normal' || v === 'large' ? v : 'auto';
}

/**
 * Faktor für die Oberfläche: gewählte Stufe bzw. bei „auto“ die Schriftgröße von Android (Web: 1).
 * Begrenzt auf 85–130 % und so, dass auf schmalen Handys keine Seite über den Rand ragt.
 */
export function uiScaleFactor(choice: UiScaleChoice, fontScale: number, width: number): number {
  const wanted = choice === 'auto' ? (Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1) : FACTORS[choice];
  const max = Math.min(1.3, Math.max(1, width / MIN_LAYOUT_WIDTH));
  return Math.round(Math.min(max, Math.max(0.85, wanted)) * 100) / 100;
}

function apply() {
  const factor = uiScaleFactor(uiScaleChoice(), Number(read(FONT_KEY) ?? 1), window.innerWidth);
  document.documentElement.style.setProperty('--ui-scale', String(factor));
}

export function setUiScaleChoice(choice: UiScaleChoice) {
  write(CHOICE_KEY, choice);
  apply();
}

interface DisplayPlugin {
  fontScale(): Promise<{ fontScale: number }>;
}

/** Beim Start: sofort mit der zuletzt bekannten Größe, dann (Android-App) mit der aktuellen Schriftgröße. */
export function initUiScale() {
  apply();
  window.addEventListener('resize', apply);
  if (!NATIVE) return;
  void registerPlugin<DisplayPlugin>('TimelytixDisplay')
    .fontScale()
    .then(({ fontScale }) => {
      write(FONT_KEY, String(fontScale));
      apply();
    })
    .catch(() => undefined);
}
