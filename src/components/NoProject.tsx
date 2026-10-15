import { useStore } from '../lib/store';

/** Monat/Jahr ohne aktiven Arbeitgeber: noch keiner angelegt oder alle archiviert. */
export function NoProject() {
  const { state } = useStore();
  return (
    <div className="page">
      <p className="card muted">
        {state.projects.length
          ? 'Alle Arbeitgeber sind archiviert – in den Einstellungen wiederherstellen.'
          : 'Bitte zuerst einen Arbeitgeber anlegen.'}
      </p>
    </div>
  );
}
