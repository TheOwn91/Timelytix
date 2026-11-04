import { useRef, type ReactNode } from 'react';
import { useHelp } from './Help';

/**
 * Aufklappbare Gruppe in den Einstellungen: Titel und eine Zeile Zusammenfassung, Inhalt erst nach Antippen.
 * Mit `help` steht rechts ein „?“; die Erklärung erscheint oben in der (dann aufgeklappten) Gruppe.
 */
export function SettingsGroup({
  title,
  summary,
  help,
  children,
}: {
  title: string;
  summary?: ReactNode;
  help?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // „?“ bei zugeklappter Gruppe: Gruppe aufklappen, damit die Erklärung zu sehen ist
  const { button, panel } = useHelp(title, help, () => {
    if (ref.current) ref.current.open = true;
  });
  return (
    <details ref={ref} className="settings-group">
      <summary>
        <span className="settings-group-title">{title}</span>
        {summary && <span className="settings-group-summary">{summary}</span>}
        {button}
      </summary>
      <div className="settings-group-body">
        {panel}
        {children}
      </div>
    </details>
  );
}
