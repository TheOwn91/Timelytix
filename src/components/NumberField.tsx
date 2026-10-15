import { useEffect, useState } from 'react';

interface Props {
  value: number;
  onChange: (value: number) => void;
  /** Höchstens so viele Nachkommastellen. */
  decimals?: number;
  /** Mindestens so viele Nachkommastellen in der Anzeige (z. B. 2 für „22,50“). */
  minDecimals?: number;
  min?: number;
  max?: number;
  id?: string;
  className?: string;
}

const format = (n: number, max: number, min: number) =>
  n.toLocaleString('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: false });

/** "22,5" oder "22.5" → 22.5; leer oder ungültig → null. Mit `allowNegative` auch "-3,5". */
export function parseDecimal(text: string, allowNegative = false): number | null {
  const t = text.trim().replace(',', '.');
  const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  if (!pattern.test(t) || !/\d/.test(t)) return null;
  return Number(t);
}

/**
 * Zahlenfeld mit deutschem Komma. Hält den eingegebenen Text selbst, damit ein leeres Feld
 * leer bleibt (keine automatische 0) und Eingaben wie „22,“ nicht verloren gehen.
 */
export function NumberField({ value, onChange, decimals = 0, minDecimals = 0, min = 0, max, id, className }: Props) {
  const [text, setText] = useState(() => format(value, decimals, minDecimals));
  const [focused, setFocused] = useState(false);

  // Wert von außen übernehmen (z. B. anderer Arbeitgeber gewählt), aber nicht während der Eingabe
  useEffect(() => {
    if (!focused) setText(format(value, decimals, minDecimals));
  }, [value, decimals, minDecimals, focused]);

  // Auf die erlaubten Nachkommastellen runden – gespeichert wird, was das Feld anzeigt
  const clamp = (n: number) => Math.min(max ?? Infinity, Math.max(min, Number(n.toFixed(decimals))));
  const negative = min < 0;

  return (
    <input
      id={id}
      className={className}
      type="text"
      // Die Zifferntastatur hat oft kein Minus – bei negativen Werten normale Tastatur
      inputMode={negative ? 'text' : decimals > 0 ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={text}
      onFocus={(e) => {
        setFocused(true);
        // Eine 0 muss man nicht erst löschen
        if (value === 0) setText('');
        else e.currentTarget.select();
      }}
      onChange={(e) => {
        const next = e.target.value.replace(negative ? /[^\d.,-]/g : /[^\d.,]/g, '');
        setText(next);
        const n = parseDecimal(next, negative);
        if (n !== null) onChange(clamp(n));
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseDecimal(text, negative);
        // Leer gelassen: 0 bzw. der kleinste erlaubte Wert
        const final = clamp(n ?? 0);
        if (final !== value) onChange(final);
        setText(format(final, decimals, minDecimals));
      }}
    />
  );
}
