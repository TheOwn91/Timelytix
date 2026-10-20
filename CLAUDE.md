# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Timelytix – Hinweise für Claude

Offline-fähige PWA zur Arbeitszeiterfassung (React 19 + TypeScript + Vite), zugleich Android-App (Capacitor).
UI-Sprache und Code-Kommentare: Deutsch.

## Befehle

- `npm run dev` – Entwicklungsserver; `npm run build` – Typprüfung (`tsc -b`) und Web-App nach `dist/`
- `TZ=Europe/Berlin npm test` – alle Tests (vitest, reine Logik in `src/**/*.test.ts`, kein DOM). Die App rechnet
  in Ortszeit (Sommer-/Winterzeit, Mitternacht); mit `TZ=Europe/Berlin` laufen die Tests wie bei den Nutzern.
- Einzelner Test: `TZ=Europe/Berlin npx vitest run src/lib/calc.test.ts` bzw. zusätzlich `-t "Teil des Testnamens"`
- `npm run build:demo -- <ziel.html>` – Demo als einzelne HTML-Datei (siehe „Demo“)
- Kein Linter/Formatter im Repo. Stil: einfache Anführungszeichen, Zeilen bis ca. 130 Zeichen. Nie
  `npx prettier --write` mit Standardeinstellungen laufen lassen (formatiert ganze Dateien um).

## Aufbau

- **Zustand:** Alle Daten stecken in einem `AppState` (`lib/types.ts`: Arbeitgeber `projects`, Buchungen `sessions`
  mit Pausen, Abwesenheiten `absences`, `settings`), gespeichert als JSON in localStorage (`lib/store.tsx`,
  Schlüssel `timetrack.v1`). Eine laufende Zeit ist eine Buchung ohne `end`, eine laufende Pause eine Pause ohne
  `end`. Einstellungen, die nur das Gerät betreffen (Anzeigegröße, Benachrichtigungen, Beta-Updates …), liegen
  als eigene `timetrack.*`-Schlüssel außerhalb des Zustands und nicht in der Datensicherung.
- **Rechnen** (`lib/calc.ts` → `lib/year.ts`): `buildIndex` ordnet Buchungen den Tagen zu → `daySummary`
  (Ist, Soll, Pausen, gesetzliche Pause `placeAutoBreaks`, Zulagen `surchargeMinutes`) → `monthSummary` →
  `yearOverview` (Urlaub und Überstundenkonto mit Übertrag ins Folgejahr). Werte mit „gültig ab“ (Lohn, Soll,
  Arbeitstage, Zuschläge) kommen aus `lib/terms.ts` (`termsAt`/`projectAt`); Nachtschichten, die zum Folgetag
  zählen, aus `lib/shift.ts` (`sessionDay`). Für beendete Tage trägt `materializeAutoBreaks` (`lib/autobreak.ts`)
  die gesetzlichen Pausen als echte Pausen ein (passiert in `update()`/`replace()`).
- **Oberfläche:** `App.tsx` mit vier Reitern ohne Router (Start `Home`, `MonthView`, `YearView`, Einstellungen
  `Projects` mit den Karten `*Card.tsx`), Fenster über `Modal`, Rückfragen über `ask()` (`lib/confirm.ts`).
- **Web und Android:** `NATIVE` (`lib/native.ts`) trennt die Wege; `lib/native.ts` kapselt Capacitor-Plugins und
  die eigenen Java-Erweiterungen in `android/app/src/main/java/de/timelytix/app/` (`RunningNotice*`, `Widget*`,
  `TimeWidgetProvider`, `DisplayPlugin`). Updates: Web über `sw.js`/`version.json` (`lib/update.ts`), Android über
  APKs aus den GitHub-Releases (`lib/apk-update.ts`).
- **`src/lib/changelog.json`** ist die einzige Quelle für Versionstexte: „Was ist neu?“ in der App, `version.json`,
  GitHub-Releases (`scripts/create-releases.mjs`) und Beta-Texte (`.github/workflows/android.yml`).

## Prüfen vor jedem Push / jeder Veröffentlichung

- `npx tsc -p .`, `TZ=Europe/Berlin npm test`, `npm run build`
- **UI-Änderungen immer in hell UND dunkel ansehen** (Screenshots im Handy-Viewport, z. B. Playwright
  mit `colorScheme: 'dark'` und zusätzlich `data-theme="dark"` am `<html>`-Element bei hellem System).
  Auf Kontrast achten: Texte, Chips, Tags, Rahmen, Modals, Hervorhebungen.
- Auch bei **320 px Breite** prüfen: `document.documentElement.scrollWidth` darf nie größer als die
  Bildschirmbreite sein (sonst zoomt das Handy heraus und Fenster ragen über den Rand).
- Die Demo als Artifact immer **mit dem Grundgerüst der Artifact-Seite** testen: Es setzt am `body`
  eine eigene Schrift und Farbe (`font:14px …; color:#141413; background:#faf9f5`). Die App muss Farbe
  und Schrift deshalb selbst am `body` setzen; nur `:root` reicht nicht.

## Farben / Dark Mode

- Alle Farben ausschließlich über die Tokens in `src/styles.css` (`:root`), nie feste Hex-Werte in
  Komponenten oder CSS-Regeln.
- Dark Mode wird dreifach definiert: `:root` (hell), `@media (prefers-color-scheme: dark)` mit
  `:root:not([data-theme='light'])` und `:root[data-theme='dark']`. Neue Tokens in allen drei Blöcken setzen.
- Textfarben (`--link`, `--danger`, `--success`, `--c-*`) sind im Dark Mode hellere Varianten;
  Button-Hintergründe haben eigene Tokens (`--primary`, `--danger-bg`, `--warning-bg`).
- **Größen in rem, nicht px:** Die Anzeigegröße (`lib/uiScale.ts`, Einstellungen → Anzeige) skaliert die Grundschrift
  (`--ui-scale` am `html`), alles in rem wächst mit. In der Android-App ist der Text-Zoom der WebView abgeschaltet
  (MainActivity.java) – „Wie Handy“ übernimmt stattdessen die Schriftgröße von Android. Prüfen auch mit „Groß“.

## Demo

`npm run build:demo -- <ziel.html>` erzeugt eine einzelne HTML-Datei mit Beispieldaten
(`src/lib/demo.ts`). In der Demo gibt es keine Downloads oder Service Worker.
Umfangreichere Testdaten (z. B. ein ganzes Jahr) nur lokal zum Testen verwenden – nicht ins
Repository und nicht in den Changelog.

## Service Worker / Offline

- Die App läuft lokal: Startseite und Dateien kommen aus dem eigenen Speicher `timelytix-<hash>`
  (in `vite.config.ts` erzeugter `sw.js`), das Netz nur, wenn etwas fehlt. Nach Updates sucht die App
  automatisch höchstens alle 12 Stunden (`lib/update.ts`), per Knopf jederzeit.
- Nie `caches.match()` über alle Speicher verwenden, immer nur den eigenen Speicher öffnen: Unter derselben
  Domain liegt die alte App (…/TimeTrack/, Speicher `timetrack-…`); fremde Kopien führten zu einer weißen Seite.
- Updates nur von Hand (kein automatisches Installieren): `sw.js` lehnt jede Installation im Hintergrund ab
  (sonst aktiviert der Browser sie beim Schließen der App). Nur „Jetzt installieren“ gibt sie kurz frei
  (`allowUntil` im Speicher `timelytix-settings`). Beim Test: App ganz schließen, neu öffnen, alte Version muss bleiben.
- Laufender Timer: Summen (Monat, Jahr, fehlende Tage) nur einmal pro Minute rechnen (`useMemo` mit
  minutengenauem `now`), nicht bei jedem Sekundentakt.

## Android-App (Play Store)

- Capacitor (`capacitor.config.ts`, Ordner `android/`), Anleitung und Play-Store-Schritte in `docs/android.md`.
- Unterschiede zur Web-App nur über `NATIVE` aus `src/lib/native.ts` (Dateien, Teilen, Benachrichtigung; kein
  Service Worker, Updates über den Play Store). Capacitor-Plugins nur dynamisch importieren (`await import(…)`).
- Gebaut wird im Workflow `.github/workflows/android.yml` (hier gibt es kein Android-SDK). Nach Änderungen am
  Web-Code genügt ein Push; nach neuen Plugins `npx cap sync android` und die Änderungen in `android/` committen.
- **Betas:** Jeder Push auf `claude/…` veröffentlicht (mit Schlüssel) eine Beta `vX.Y.Z-beta.N` (N je Version ab 1) als Pre-Release;
  nur Geräte mit „Beta-Versionen testen“ bekommen sie (`apk-update.ts`). Für den Nutzer zum Testen also einfach
  pushen und auf den grünen Workflow warten. Version des Builds: `BUILD_VERSION` (changelog.ts), nicht `APP_VERSION`.
- Die Anzeige „Zeit läuft“ zeigt die eigene Erweiterung `RunningNotice` (android/…/RunningNotice.java), Erinnerungen
  `@capacitor/local-notifications` (`lib/reminders.ts`).
- Widget (`TimeWidgetProvider.java`) und die Knöpfe der Benachrichtigung ändern nichts an den Daten: Sie zeigen
  den neuen Stand sofort selbst an und merken sich jede Aktion mit Uhrzeit und laufender Nummer (`WidgetActions.java`,
  SharedPreferences); die App übernimmt sie beim Öffnen bzw. sofort (`lib/widget.ts`) und bestätigt sie erst nach dem
  Speichern (`ack`, erst dann löscht Android sie) – `applyWidgetActions` muss deshalb doppelt übernommene Aktionen
  überspringen. Danach legt die App einen Auszug fürs Widget ab. Alle Knöpfe wirken sofort (keine Rückfrage).
  Die gesetzlichen Pausen rechnet das Widget selbst (`WidgetState.placeBreaks` = `placeAutoBreaks` in calc.ts –
  bei Änderungen beide anpassen). Alle Zugriffe auf Auszug und Aktionen nur unter der Sperre `WidgetState.class`.
  Die Erinnerung „Abstempeln vergessen?“ (Kennung 4) planen Start/Beenden im Widget selbst (`ForgotReminder.java`),
  bis die App übernimmt (`reminders.ts` hebt die des Widgets dann auf). Wecker immer über `Alarms.java`: genau, wenn
  „Wecker und Erinnerungen“ erlaubt ist (`SCHEDULE_EXACT_ALARM`, ab Android 14 vom Nutzer einzuschalten), sonst ungenau.
- App-Symbole: Quellen in `assets/`, erzeugen mit `npx @capacitor/assets generate --android --assetPath assets`.

## Berechnung / Daten

- Den Zustand (`AppState`) nie direkt verändern, nur über `update()`/`replace()` im Store (legt eine Kopie an).
  `buildIndex`, `monthSummary` (calc.ts) und `yearOverview` (year.ts) speichern Ergebnisse je Zustand zwischen –
  zurückgegebene Ergebnisse deshalb nie verändern, und `now` beim Aufruf auf die Minute runden (sonst greift der
  Zwischenspeicher nicht).
- Gespeicherte Daten und Datensicherungen laufen durch `validateState` (validate.ts); neue Felder dort ergänzen.
- Zulagen werden abschnittsweise berechnet (`surchargeMinutes`); `surcharge.test.ts` vergleicht mit der
  Minute-für-Minute-Rechnung.

## Versionen / „Was ist neu?“

**PRs mergt Claude selbst**, wenn der Nutzer einen PR möchte („mach bitte einen PR“): PR erstellen, warten bis der
Workflow „Android-App bauen“ auf dem Branch grün ist, dann mergen und Veröffentlichung, Release und APK prüfen.
Nie ungefragt mergen; bei „PR, aber nicht mergen“ nur den PR erstellen.

**Neue Versionsnummer gleich mit der ersten Änderung nach einem Release** (nicht erst vor dem PR): Die Betas
heißen nach der Version in `package.json`, solange es dazu noch kein Release gibt (sonst `x.y.z+1-beta.N`), und
sollen schon die kommende Versionsnummer tragen. Also beim ersten Push `version` in `package.json` setzen und in
`src/lib/changelog.json` oben einen Eintrag anlegen (Versionsnummer, Datum, nur die wichtigen Änderungen – kurz und
in einfachen Worten, Kleinigkeiten weglassen); mit jeder weiteren Änderung den Eintrag ergänzen, vor dem PR Datum und Text prüfen. Kommt
zu Korrekturen eine neue Funktion dazu, die Nummer entsprechend anheben (z. B. 1.1.1 → 1.2.0).
Seit 1.0.0 (offizieller Start) gilt: neue Funktionen 1.x → 1.x+1, Korrekturen 1.x.y → 1.x.y+1;
2.0.0 nur nach Absprache mit dem Nutzer.
Nach einem Update zeigt die Web-App diese Einträge einmalig beim Start (abschaltbar); die Android-App zeigt sie
vor der Installation (Text der GitHub-Releases bzw. Betas, erzeugt aus `changelog.json`), beim Start nicht.
Sobald die Version auf `main` ankommt, legt `.github/workflows/release.yml` Tag `vX.Y.Z` und
GitHub-Release an (Versionen 0.x waren Pre-releases, ab 1.0.0 richtige Releases). Aus dieser Umgebung lassen sich keine Tags pushen.
