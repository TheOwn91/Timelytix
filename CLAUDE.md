# Timelytix – Hinweise für Claude

Offline-fähige PWA zur Arbeitszeiterfassung (React + TypeScript + Vite). UI-Sprache: Deutsch.

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

## Versionen / „Was ist neu?“

**Neue Versionsnummer erst direkt vor dem Erstellen eines PR** – nicht bei jeder einzelnen Änderung.
Dann in `src/lib/changelog.json` oben einen Eintrag ergänzen (neue Versionsnummer, Datum, alle für
Nutzer sichtbaren Änderungen des PR in einfachen Worten) und `version` in `package.json` angleichen.
Die Version bleibt bei 0.x (neue Funktionen: 0.x → 0.x+1, Korrekturen: 0.x.y → 0.x.y+1);
1.0.0 erst nach Absprache mit dem Nutzer zum offiziellen Start.
Nach einem Update zeigt die App diese Einträge einmalig beim Start (abschaltbar).
Sobald die Version auf `main` ankommt, legt `.github/workflows/release.yml` Tag `vX.Y.Z` und
GitHub-Release an (0.x als Pre-release). Aus dieser Umgebung lassen sich keine Tags pushen.
