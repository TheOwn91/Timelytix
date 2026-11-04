import { useEffect, useState } from 'react';
import { betaUpdatesEnabled, setBetaUpdatesEnabled } from '../lib/apk-update';
import { BUILD_VERSION, IN_DEVELOPMENT, IS_BETA } from '../lib/changelog';
import { NATIVE } from '../lib/native';
import { checkForUpdates, getUpdateStatus, onUpdateStatus, openUpdatePreview, updateSupported, type UpdateStatus } from '../lib/update';
import { CardTitle } from './Help';

function statusText(s: UpdateStatus): string | null {
  switch (s.state) {
    case 'checking':
      return 'Suche nach Updates …';
    case 'current':
      return '✔ Du hast die neueste Version.';
    case 'available':
      return s.release ? `Version ${s.release.version} ist verfügbar.` : 'Ein Update ist verfügbar.';
    case 'installing':
      return 'Update wird installiert – die App startet gleich neu …';
    case 'offline':
      return 'Keine Verbindung – bitte später erneut prüfen.';
    case 'unsupported':
      return 'Updates gibt es nur in der installierten App.';
    default:
      return null;
  }
}

/**
 * App-Version, Updates und „Was ist neu?“. Updates kommen nur von Hand („Jetzt aktualisieren“ zeigt vorher die
 * Änderungen); gesucht wird höchstens alle 12 Stunden (lib/update.ts).
 */
export function VersionCard({ onShowWhatsNew }: { onShowWhatsNew: () => void }) {
  const [status, setStatus] = useState(getUpdateStatus);
  useEffect(() => onUpdateStatus(setStatus), []);
  const supported = updateSupported();
  const text = supported ? statusText(status) : 'In der Demo gibt es keine Updates.';
  const busy = status.state === 'checking' || status.state === 'installing';
  const [beta, setBeta] = useState(betaUpdatesEnabled);

  const toggleBeta = (on: boolean) => {
    setBetaUpdatesEnabled(on);
    setBeta(on);
    void checkForUpdates();
  };

  return (
    <section className="card">
      <CardTitle
        title="App-Version"
        help={
          <>
            <p>
              Updates installierst du selbst: „Auf Updates prüfen“ sucht nach einer neuen Version. Vor dem Installieren siehst du,
              was neu ist.
            </p>
            {NATIVE && (
              <p>
                <strong>Beta-Versionen:</strong> neue Funktionen schon vorab testen. Sie können noch Fehler enthalten.
              </p>
            )}
          </>
        }
      />
      <p className="muted small">
        Timelytix {BUILD_VERSION}
        {IS_BETA ? ' · Beta' : IN_DEVELOPMENT && ' · in Entwicklung'}
      </p>
      <div className="update-actions">
        <button className="btn secondary" disabled={!supported || busy} onClick={() => void checkForUpdates()}>
          Auf Updates prüfen
        </button>
        {status.state === 'available' && (
          <button className="btn primary" onClick={openUpdatePreview}>
            Jetzt aktualisieren
          </button>
        )}
        <button className="btn secondary" onClick={onShowWhatsNew}>
          Was ist neu?
        </button>
      </div>
      {text && (
        <p className={`small update-status ${status.state === 'available' ? 'highlight' : 'muted'}`} role="status">
          {text}
        </p>
      )}
      {NATIVE && (
        <label className="checkbox toggle-row">
          <input id="beta-updates" type="checkbox" checked={beta} disabled={busy} onChange={(e) => toggleBeta(e.target.checked)} />
          {/* Text und Zusatz in einem Block, sonst stehen sie im Schalter-Eintrag nebeneinander */}
          <span className="toggle-text">
            Beta-Versionen testen
            {beta && <span className="muted small">Können noch Fehler enthalten</span>}
          </span>
        </label>
      )}
    </section>
  );
}
