import { useEffect, useState } from 'react';
import { APP_VERSION, IN_DEVELOPMENT } from '../lib/changelog';
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

  return (
    <section className="card">
      <h2>App-Version &amp; Updates</h2>
      <p className="muted small">
        Timelytix {APP_VERSION}
        {IN_DEVELOPMENT && ' · in Entwicklung'}
      </p>

      <p className="muted small">
        Neue Versionen werden nur installiert, wenn du auf „Jetzt aktualisieren“ tippst – vorher siehst du, was neu
        ist. Die App schaut höchstens alle 12 Stunden nach, ob es eine neue Version gibt.
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

      <button className="btn secondary full" onClick={onShowWhatsNew}>
        Was ist neu?
      </button>
    </section>
  );
}
