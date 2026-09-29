import { useEffect, useRef, useState } from 'react';
import {
  BACKUP_INTERVALS,
  autoBackupEnabled,
  backupBlob,
  backupFileName,
  backupIntervalDays,
  lastBackup,
  markBackedUp,
} from '../lib/backup';
import { ask } from '../lib/confirm';
import { notify } from '../lib/demo';
import { isIOS, requestPersistentStorage, shareOrDownload, storagePersisted } from '../lib/device';
import { useStore, validateState } from '../lib/store';
import { fmtDate } from '../lib/time';
import { DeleteAllData } from './DeleteAllData';

/** Datensicherung: automatisch in den Download-Ordner, von Hand exportieren/importieren, dauerhafter Speicher. */
export function BackupCard() {
  const { state, update, replace } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [last, setLast] = useState(lastBackup);
  const [persisted, setPersisted] = useState<boolean | undefined>(undefined);
  const auto = autoBackupEnabled(state);
  const days = backupIntervalDays(state);

  useEffect(() => {
    void storagePersisted().then(setPersisted);
    // Nach einer automatischen Sicherung (sie meldet sich mit einem Hinweis) das Datum neu anzeigen
    window.addEventListener('timetrack-notice', refreshLast);
    return () => window.removeEventListener('timetrack-notice', refreshLast);
  }, []);

  function refreshLast() {
    setLast(lastBackup());
  }

  const setSettings = (patch: { autoBackup?: boolean; backupIntervalDays?: number }) =>
    update((d) => {
      d.settings = { ...d.settings, ...patch };
    });

  const exportBackup = async () => {
    if (await shareOrDownload(backupBlob(state), backupFileName())) {
      markBackedUp();
      refreshLast();
    }
  };

  const importBackup = async (file: File) => {
    try {
      const data = validateState(JSON.parse(await file.text()));
      if (!(await ask('Alle aktuellen Daten durch die Sicherung ersetzen?', { confirmLabel: 'Ersetzen', danger: true }))) return;
      replace(data);
    } catch (e) {
      notify(`Import fehlgeschlagen: ${(e as Error).message}`);
    }
  };

  return (
    <section className="card">
      <h2>Datensicherung</h2>
      <p className="muted small">
        Alle Daten werden nur lokal auf diesem Gerät gespeichert – nichts wird hochgeladen. Eine Sicherung außerhalb der
        App schützt vor Datenverlust (z. B. beim Löschen der Browserdaten oder bei einem neuen Handy).
      </p>

      <label className="checkbox toggle-row">
        <input id="auto-backup" type="checkbox" checked={auto} onChange={(e) => setSettings({ autoBackup: e.target.checked })} />
        Automatisch sichern (Download-Ordner)
      </label>
      {auto && (
        <div className="field-list">
          <label className="select-row">
            <span>Abstand</span>
            <select value={days} onChange={(e) => setSettings({ backupIntervalDays: Number(e.target.value) })}>
              {BACKUP_INTERVALS.map((i) => (
                <option key={i.days} value={i.days}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <p className="muted small">
        {auto
          ? isIOS()
            ? 'Auf dem iPhone sind automatische Downloads nicht möglich – bitte „Sicherung exportieren“ nutzen.'
            : 'Beim Öffnen der App wird die Sicherung abgelegt, sobald sie fällig ist (Datei „timelytix-backup-Datum.json“). Tipp: Den Download-Ordner mit Google Drive sichern.'
          : 'Ohne automatische Sicherung bitte regelmäßig „Sicherung exportieren“ nutzen.'}
        {' '}
        Letzte Sicherung: {last ? fmtDate(last) : 'noch keine'}.
      </p>

      <div className="row">
        <button className="btn secondary grow" onClick={() => void exportBackup()}>
          Sicherung exportieren
        </button>
        <button className="btn secondary grow" onClick={() => fileRef.current?.click()}>
          Sicherung importieren
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importBackup(f);
            e.target.value = '';
          }}
        />
      </div>

      {persisted !== undefined && (
        <p className="muted small storage-state">
          {persisted ? (
            '✓ Dauerhafter Speicher: Der Browser löscht die Daten nicht von selbst, auch nicht bei wenig Speicherplatz.'
          ) : (
            <>
              Dauerhafter Speicher noch nicht freigegeben – bei sehr wenig Speicherplatz dürfte der Browser die Daten
              löschen. Das klappt meist, sobald die App auf dem Homescreen installiert ist.{' '}
              <button
                className="link"
                onClick={() => void requestPersistentStorage().then(() => storagePersisted().then(setPersisted))}
              >
                Erneut anfragen
              </button>
            </>
          )}
        </p>
      )}

      <DeleteAllData onExportBackup={() => void exportBackup()} />
    </section>
  );
}
