import { useEffect, useState } from 'react';

const fmt = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Aktuelle Uhrzeit mit Sekunden im Kopf der App (eigene Komponente: nur sie zeichnet sich jede Sekunde neu). */
export function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    // Genau zum Sekundenwechsel weiterzählen
    const tick = () => {
      setNow(new Date());
      timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    timer = setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => clearTimeout(timer);
  }, []);
  return (
    <time className="header-clock" dateTime={now.toISOString()}>
      {fmt(now)}
    </time>
  );
}
