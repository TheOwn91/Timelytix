import { useEffect, useRef, useState } from 'react';
import {
  BACKUP_INTERVALS,
  autoBackupEnabled,
  backupBlob,
  backupFileName,
  backupIntervalDays,
  lastBackup,
  markBackedUp,
  nextAutoBackup,
} from '../lib/backup';
import { ask } from '../lib/confirm';
import { notify } from '../lib/demo';
import { NATIVE, NATIVE_BACKUP_FOLDER } from '../lib/native';
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

  // Auf dem iPhone kann die Web-App nicht von selbst speichern
  const autoPossible = NATIVE || !isIOS();
  return (
    <section className="card">
      <h2>Datensicherung</h2>
      <p className="muted small">Alle Daten liegen nur auf diesem Gerät.</p>

      <label className="checkbox toggle-row">
        <input id="auto-backup" type="checkbox" checked={auto} onChange={(e) => setSettings({ autoBackup: e.target.checked })} />
        Automatisch sichern
      </label>
      {auto && autoPossible && (
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
        {auto && !autoPossible && 'Auf dem iPhone nicht möglich – bitte von Hand exportieren. '}
        {auto && autoPossible ? (
          <>
            Ordner: {NATIVE ? `Dokumente/${NATIVE_BACKUP_FOLDER}` : 'Download'}
            <br />
            Zuletzt: {last ? fmtDate(last) : 'noch nie'} · nächste: {fmtDate(nextAutoBackup(state))}
          </>
        ) : (
          <>Zuletzt gesichert: {last ? fmtDate(last) : 'noch nie'}</>
        )}
      </p>

      <div className="button-row">
        <button className="btn secondary" onClick={() => void exportBackup()}>
          Sicherung exportieren
        </button>
        <button className="btn secondary" onClick={() => fileRef.current?.click()}>
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

      {/* Nur wenn der Browser die Daten bei Platzmangel löschen dürfte */}
      {persisted === false && (
        <p className="muted small storage-state">
          Der Browser darf die Daten bei Platzmangel löschen.{' '}
          <button className="link" onClick={() => void requestPersistentStorage().then(() => storagePersisted().then(setPersisted))}>
            Dauerhaft speichern
          </button>
        </p>
      )}

      <DeleteAllData onExportBackup={() => void exportBackup()} />
    </section>
  );
}
