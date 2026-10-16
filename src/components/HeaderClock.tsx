import { useEffect, useState } from 'react';

const FORMAT = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Aktuelle Uhrzeit mit Sekunden im Kopf der App (eigene Komponente: nur sie zeichnet sich jede Sekunde neu).
 * Zählt genau zum Sekundenwechsel weiter und ruht, solange die App im Hintergrund ist (spart Akku).
 */
export function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') tick();
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return (
    <time className="header-clock" dateTime={now.toISOString()}>
      {FORMAT.format(now)}
    </time>
  );
}
