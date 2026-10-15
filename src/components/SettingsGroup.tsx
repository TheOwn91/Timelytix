import type { ReactNode } from 'react';

/** Aufklappbare Gruppe in den Einstellungen: Titel und eine Zeile Zusammenfassung, Inhalt erst nach Antippen. */
export function SettingsGroup({ title, summary, children }: { title: string; summary?: ReactNode; children: ReactNode }) {
  return (
    <details className="settings-group">
      <summary>
        <span className="settings-group-title">{title}</span>
        {summary && <span className="settings-group-summary">{summary}</span>}
      </summary>
      <div className="settings-group-body">{children}</div>
    </details>
  );
}
