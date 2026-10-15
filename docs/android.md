# Timelytix als Android-App (Google Play Store)

Die Android-App ist dieselbe Web-App, verpackt mit [Capacitor](https://capacitorjs.com). Der Code in
`src/` gilt für beide; Unterschiede stecken in `src/lib/native.ts` (`NATIVE`).

| | Web-App (GitHub Pages) | Android-App |
|---|---|---|
| Daten | Speicher des Browsers | Speicher der App (Android-Sicherung über Google) |
| Automatische Sicherung | Download-Ordner | `Dokumente/Timelytix` |
| PDF / Sicherung teilen | Teilen-Menü des Browsers | Android-Teilen-Menü |
| „Zeit läuft“ | Benachrichtigung über den Service Worker | dauerhafte Android-Benachrichtigung mit Knöpfen Pause/Weiter und Beenden |
| Widget | – | Startbildschirm: Arbeitgeber wählen, Start/Pause/Beenden, Saldo des Monats |
| Updates | „Jetzt aktualisieren“ in der App | Google Play Store |

App-Kennung: `de.timelytix.app` (lässt sich nach dem ersten Hochladen in den Play Store nicht mehr ändern).
Version: kommt aus `package.json` (`0.21.0` → versionName `0.21.0`, versionCode `21000`).

## Verteilung über GitHub (ohne Play Store)

- Auf `main` hängt der Workflow die signierte `Timelytix-X.Y.Z.apk` an das GitHub-Release `vX.Y.Z`.
- Download-Seite: `https://theown91.github.io/Timelytix/android.html` (zeigt immer die neueste APK).
- Die App sucht höchstens alle 12 Stunden bei GitHub nach einer neueren APK (`src/lib/apk-update.ts`) und zeigt
  „Update verfügbar“; „Jetzt installieren“ öffnet den Download im Browser, Android fragt dann „Diese App aktualisieren?“.
- Updates funktionieren nur, wenn jede APK mit **demselben Schlüssel** signiert ist (Secrets unten).
- **Betas:** Jeder Push auf einen `claude/…`-Branch veröffentlicht zusätzlich eine Beta als Pre-Release
  `vX.Y.Z-beta.N` (X.Y.Z = nächste Version, N = Laufnummer des Workflows). Angeboten wird sie nur auf Geräten mit
  „Einstellungen → App-Version & Updates → Beta-Versionen testen“. versionCode = der der richtigen Version − 1, damit
  sich die richtige Version später darüber installieren lässt. Es bleibt immer nur die neueste Beta stehen; mit der
  richtigen Version auf `main` werden alle Betas entfernt. Die Download-Seite zeigt nie eine Beta.
- Kommt später der Play Store dazu: Dort installierte Apps aktualisiert Google; die GitHub-Update-Suche sollte dann
  für die Play-Store-Version abgeschaltet werden.

## Bauen

Der Workflow **„Android-App bauen“** (`.github/workflows/android.yml`) baut bei jedem Push auf `main`
(und auf `claude/…`-Branches) und lässt sich unter *Actions → Android-App bauen → Run workflow* auch von Hand
starten. Ergebnis (unter *Artifacts* des Laufs):

- **timelytix-apk** – APK zum direkten Installieren (mit Signaturschlüssel signiert und updatefähig, ohne Schlüssel nur eine Test-App)
- **timelytix-aab** – App-Paket für den Play Store (nur, wenn der Signaturschlüssel hinterlegt ist)

Lokal (mit Android Studio / Android-SDK): `npm run android`, danach `android/` in Android Studio öffnen.

## Test-App auf dem Handy installieren

1. Im Workflow-Lauf das Artefakt **timelytix-apk** herunterladen und entpacken (`app-debug.apk`).
2. Datei aufs Handy kopieren und öffnen; Android fragt einmal, ob Apps aus dieser Quelle installiert werden dürfen.
3. Die Test-App hat eigene Daten – zum Übernehmen in der Web-App „Sicherung exportieren“ und in der
   Android-App „Sicherung importieren“.

## Signaturschlüssel (einmalig, sehr wichtig)

Jedes Update im Play Store muss mit demselben Schlüssel signiert sein. **Schlüssel und Passwörter nie
verlieren und nie ins Repository legen.** (Mit „Play App Signing“ verwaltet Google den eigentlichen
App-Schlüssel; dieser hier ist der Upload-Schlüssel – geht er verloren, lässt er sich über den Play-Support
ersetzen, das dauert aber.)

1. Schlüssel erzeugen (auf dem eigenen Rechner, Java nötig):

   ```sh
   keytool -genkeypair -v -keystore timelytix-upload.jks -alias timelytix -keyalg RSA -keysize 2048 -validity 10000
   ```

   Passwort und Angaben (Name, Ort) eingeben. Die Datei `timelytix-upload.jks` sicher aufbewahren
   (z. B. Passwort-Manager + zweite Kopie offline).

2. Datei für GitHub umwandeln:

   ```sh
   base64 -w0 timelytix-upload.jks > timelytix-upload.txt     # macOS: base64 -i timelytix-upload.jks -o timelytix-upload.txt
   ```

3. Im Repository unter *Settings → Secrets and variables → Actions → New repository secret* anlegen:

   | Name | Inhalt |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | Inhalt von `timelytix-upload.txt` |
   | `ANDROID_KEYSTORE_PASSWORD` | Passwort des Keystores |
   | `ANDROID_KEY_ALIAS` | `timelytix` |
   | `ANDROID_KEY_PASSWORD` | Passwort des Schlüssels (meist dasselbe) |

   `timelytix-upload.txt` danach löschen.

## Play Store – Schritt für Schritt

1. **Entwicklerkonto** anlegen: <https://play.google.com/console> (einmalig 25 $, Identitätsprüfung).
2. **App erstellen**: Name „Timelytix“, Sprache Deutsch, App (nicht Spiel), kostenlos.
3. **App-Inhalte** ausfüllen (Texte und Antworten: [playstore.md](playstore.md)):
   Datenschutzerklärung (URL: `https://theown91.github.io/Timelytix/datenschutz.html`), Datensicherheit,
   Werbung (keine), Zielgruppe, Inhaltsbewertung, App-Zugriff (keine Anmeldung nötig).
4. **Store-Eintrag**: Kurz- und Langbeschreibung, App-Symbol 512 × 512 (`public/icon-512.png`),
   Vorstellungsgrafik 1024 × 500, mindestens 2 Screenshots vom Handy.
5. **Geschlossener Test**: Release anlegen, `app-release.aab` (Artefakt **timelytix-aab**) hochladen,
   Tester per E-Mail-Liste einladen. Neue private Konten müssen laut Google-Regeln mindestens
   **12 Tester über 14 Tage** testen lassen, bevor „Produktion“ freigeschaltet wird (aktuelle Regeln in der
   Play Console prüfen).
6. **Produktion**: Zugriff beantragen, danach Release veröffentlichen. Prüfung durch Google dauert meist
   wenige Tage.

### Neue Version veröffentlichen

1. Wie gewohnt Version in `package.json` und `src/lib/changelog.json` erhöhen und mergen.
2. Workflow-Lauf auf `main` abwarten, Artefakt **timelytix-aab** herunterladen.
3. Play Console → Release → neues Release → AAB hochladen → Versionshinweise (aus dem Changelog) → veröffentlichen.
