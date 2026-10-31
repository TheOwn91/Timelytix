/**
 * Symbole als Grafik in einer einheitlichen, gefüllten Bildsprache (wie SF Symbols) – Zeichen wie ⏸ oder 📅 zeigen
 * manche Handys (z. B. Samsung) als buntes Emoji. Farbe und Größe kommen vom umgebenden Text.
 */
const PATHS = {
  play: 'M8 5v14l11-7z',
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  stop: 'M6 6h12v12H6z',
  // Reiter: Uhr, Kalender, Balken, Zahnrad (Ausschnitte über evenodd)
  clock: 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20zM11 6.5h2v5.1l3.4 3.4-1.4 1.4-4-4z',
  calendar:
    'M7 2h2v2h6V2h2v2h1.5A2.5 2.5 0 0 1 21 6.5v12a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5v-12A2.5 2.5 0 0 1 5.5 4H7zM5 9v9.5a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5V9zm2 2h3v3H7z',
  chart: 'M3.5 13h4.5v8H3.5zM9.75 8h4.5v13h-4.5zM16 3h4.5v18H16z',
  gear:
    'M19.90 9.81L22.46 10.29L22.46 13.71L19.90 14.19L19.13 16.04L20.61 18.19L18.19 20.61L16.04 19.13L14.19 19.90L13.71 22.46L10.29 22.46L9.81 19.90L7.96 19.13L5.81 20.61L3.39 18.19L4.87 16.04L4.10 14.19L1.54 13.71L1.54 10.29L4.10 9.81L4.87 7.96L3.39 5.81L5.81 3.39L7.96 4.87L9.81 4.10L10.29 1.54L13.71 1.54L14.19 4.10L16.04 4.87L18.19 3.39L20.61 5.81L19.13 7.96Z M8.6 12a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0-6.8 0Z',
  // Bedienelemente
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z',
  back: 'M15.4 4.6 16.8 6l-6 6 6 6-1.4 1.4L8 12z',
  forward: 'M8.6 4.6 7.2 6l6 6-6 6 1.4 1.4L16 12z',
  share: 'M11 3.8 7.7 7.1 6.3 5.7 12 0l5.7 5.7-1.4 1.4L13 3.8V15h-2zM5 9h3v2H6v10h12V11h-2V9h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fillRule="evenodd" />
    </svg>
  );
}
