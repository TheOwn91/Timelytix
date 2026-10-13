import { useEffect, useState } from 'react';
import type { Release } from '../lib/changelog';
import { BUILD_VERSION } from '../lib/changelog';
import { UPDATE_PREVIEW_EVENT, applyUpdate, fetchUpdateNotes } from '../lib/update';
import { Modal } from './Modal';
import { ReleaseList } from './WhatsNew';

/** „Jetzt aktualisieren“: zeigt zuerst, was neu ist; installiert wird erst nach dem Bestätigen. */
export function UpdatePreview() {
  const [open, setOpen] = useState(false);
  const [releases, setReleases] = useState<Release[] | null>(null);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
      setReleases(null);
      void fetchUpdateNotes().then(setReleases);
    };
    window.addEventListener(UPDATE_PREVIEW_EVENT, onOpen);
    return () => window.removeEventListener(UPDATE_PREVIEW_EVENT, onOpen);
  }, []);

  if (!open) return null;
  const target = releases?.[0]?.version;
  return (
    <Modal title={target ? `Update auf Version ${target}` : 'Update verfügbar'} onClose={() => setOpen(false)}>
      <p className="muted small">Installiert ist Version {BUILD_VERSION}. Das ist neu:</p>
      {releases === null ? (
        <p className="muted">Änderungen werden geladen …</p>
      ) : releases.length ? (
        <ReleaseList releases={releases} />
      ) : (
        <p className="muted">Die Änderungen konnten nicht geladen werden.</p>
      )}
      <p className="muted small">Deine Daten bleiben beim Update erhalten. Die App startet danach kurz neu.</p>
      <div className="confirm-actions">
        <button className="btn secondary" onClick={() => setOpen(false)}>
          Später
        </button>
        <button
          className="btn primary"
          disabled={releases === null}
          onClick={() => {
            setOpen(false);
            void applyUpdate();
          }}
        >
          Jetzt installieren
        </button>
      </div>
    </Modal>
  );
}
