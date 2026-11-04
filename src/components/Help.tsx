import { useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Knopf „?“ und Erklärung darunter (aufklappbar), für Karten und Gruppen in den Einstellungen. */
export function useHelp(topic: string, text?: ReactNode, onOpen?: () => void) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!text) return { button: null, panel: null, setOpen };
  const button = (
    <button
      type="button"
      className={`icon-btn help-btn ${open ? 'open' : ''}`}
      aria-label={`Erklärung zu „${topic}“`}
      aria-expanded={open}
      aria-controls={id}
      onClick={(e) => {
        // In einer Gruppe (<summary>) soll der Knopf nur die Erklärung zeigen, nicht die Gruppe auf- oder zuklappen
        e.preventDefault();
        e.stopPropagation();
        if (!open) onOpen?.();
        setOpen(!open);
      }}
    >
      <Icon name="help" />
    </button>
  );
  const panel = open ? (
    <div id={id} className="help-text" role="note">
      {text}
    </div>
  ) : null;
  return { button, panel, setOpen };
}

/** Überschrift einer Karte, rechts daneben „?“ mit Erklärung. */
export function CardTitle({ title, help }: { title: string; help?: ReactNode }) {
  const { button, panel } = useHelp(title, help);
  return (
    <>
      <div className="card-head">
        <h2>{title}</h2>
        {button}
      </div>
      {panel}
    </>
  );
}
