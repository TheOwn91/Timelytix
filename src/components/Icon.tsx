/**
 * Symbole für Start, Pause und Beenden als Grafik – Zeichen wie ⏸ zeigen manche Handys (z. B. Samsung) als
 * buntes Emoji. Farbe und Größe kommen vom umgebenden Text.
 */
const PATHS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  stop: 'M6 6h12v12H6z',
};

export function Icon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
