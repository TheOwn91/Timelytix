import { useEffect, useState } from 'react';
import { betaUpdatesEnabled, setBetaUpdatesEnabled } from '../lib/apk-update';
import { BUILD_VERSION, IN_DEVELOPMENT, IS_BETA } from '../lib/changelog';
import { NATIVE } from '../lib/native';
import { checkForUpdates, getUpdateStatus, onUpdateStatus, openUpdatePreview, updateSupported, type UpdateStatus } from '../lib/update';

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

/** App-Version, Updates (immer von Hand) und „Was ist neu?“. */
export function VersionCard({ onShowWhatsNew }: { onShowWhatsNew: () => void }) {
  const [status, setStatus] = useState(getUpdateStatus);
  useEffect(() => onUpdateStatus(setStatus), []);
  const supported = updateSupported();
  const text = supported ? statusText(status) : 'In der Demo gibt es keine Updates – nur in der installierten App.';
  const busy = status.state === 'checking' || status.state === 'installing';
  const [beta, setBeta] = useState(betaUpdatesEnabled);

  const toggleBeta = (on: boolean) => {
    setBetaUpdatesEnabled(on);
    setBeta(on);
    void checkForUpdates();
  };

  return (
    <section className="card">
      <h2>App-Version &amp; Updates</h2>
      <p className="muted small">
        Timelytix {BUILD_VERSION}
        {IS_BETA ? ' · Beta' : IN_DEVELOPMENT && ' · in Entwicklung'}
      </p>

      <p className="muted small">
        Neue Versionen werden nur installiert, wenn du auf „Jetzt aktualisieren“ tippst – vorher siehst du, was neu
        ist. Die App schaut höchstens alle 12 Stunden nach, ob es eine neue Version gibt
        {NATIVE ? ' (auf GitHub; die neue Version wird heruntergeladen und von Android installiert).' : '.'}
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
      </div>
      {text && (
        <p className={`small update-status ${status.state === 'available' ? 'highlight' : 'muted'}`} role="status">
          {text}
        </p>
      )}

      {NATIVE && (
        <>
          <label className="checkbox toggle-row">
            <input id="beta-updates" type="checkbox" checked={beta} disabled={busy} onChange={(e) => toggleBeta(e.target.checked)} />
            Beta-Versionen testen
          </label>
          <p className="muted small">
            {beta
              ? 'Du bekommst auch Testversionen mit den neuesten Änderungen – sie können noch Fehler enthalten. Ausgeschaltet bleibt die Beta installiert, bis die nächste richtige Version erscheint.'
              : 'Nur für Tester: Testversionen mit den neuesten Änderungen, noch vor der richtigen Version.'}
          </p>
        </>
      )}

      <button className="btn secondary full" onClick={onShowWhatsNew}>
        Was ist neu?
      </button>
    </section>
  );
}
