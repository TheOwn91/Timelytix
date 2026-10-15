import { useId } from 'react';
import type { SurchargeMode } from '../lib/types';

/** Auswahl, wie zeitgleich geltende Zulagen verrechnet werden. */
export function SurchargeModeField({ value, onChange }: { value: SurchargeMode; onChange: (m: SurchargeMode) => void }) {
  // Eindeutig, auch wenn das Feld zweimal auf der Seite steht (Einstellungen und Assistent)
  const id = useId();
  return (
    <div className="choice-field">
      <p id={id} className="choice-label">
        Gelten mehrere Zulagen gleichzeitig (z. B. Sonntag und Nacht)?
      </p>
      <div className="choice-group" role="radiogroup" aria-labelledby={id}>
        <label className="choice">
          <input type="radio" name={id} checked={value === 'max'} onChange={() => onChange('max')} />
          <span>
            <strong>Nur die höchste zählt</strong>
            <span className="muted small">Sonntagnacht: nur 50 %</span>
          </span>
        </label>
        <label className="choice">
          <input type="radio" name={id} checked={value === 'stack'} onChange={() => onChange('stack')} />
          <span>
            <strong>Alle werden addiert</strong>
            <span className="muted small">Sonntagnacht: 50 % + 25 %</span>
          </span>
        </label>
      </div>
    </div>
  );
}
