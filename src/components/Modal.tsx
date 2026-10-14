import { useEffect, useRef, type ReactNode } from 'react';

/** Anzahl offener Fenster – der Hintergrund bleibt gesperrt, bis das letzte geschlossen ist. */
let openCount = 0;

export function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  // Aktuelles onClose merken, damit der Effekt nicht bei jeder Anzeige (z. B. Timer-Takt) neu läuft
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    openCount++;
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      if (--openCount === 0) document.body.classList.remove('no-scroll');
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
