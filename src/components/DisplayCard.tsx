import { useState } from 'react';
import { useStore } from '../lib/store';
import { UI_SCALE_OPTIONS, setUiScaleChoice, uiScaleChoice, type UiScaleChoice } from '../lib/uiScale';

/** Anzeige-Einstellungen der App. */
export function DisplayCard() {
  const { state, update } = useStore();
  const decimal = !!state.settings?.decimalHours;
  // Anzeigegröße gilt je Gerät (nicht in der Datensicherung)
  const [scale, setScale] = useState<UiScaleChoice>(uiScaleChoice);
  const chooseScale = (c: UiScaleChoice) => {
    setUiScaleChoice(c);
    setScale(c);
  };
  return (
    <section className="card">
      <h2>Anzeige</h2>
      <div className="choice-field">
        <p id="ui-scale-label" className="choice-label">
          Anzeigegröße
        </p>
        <div className="choice-group" role="radiogroup" aria-labelledby="ui-scale-label">
          {UI_SCALE_OPTIONS.map((o) => (
            <label key={o.value} className="choice">
              <input type="radio" name="ui-scale" checked={scale === o.value} onChange={() => chooseScale(o.value)} />
              <span>
                <strong>{o.label}</strong>
                <span className="muted small">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="muted small">Schrift, Abstände und Knöpfe wachsen gleichmäßig mit. Gilt nur auf diesem Gerät.</p>
      </div>
      <label className="checkbox toggle-row">
        <input
          id="decimal-hours"
          type="checkbox"
          checked={decimal}
          onChange={(e) =>
            update((d) => {
              d.settings = { ...d.settings, decimalHours: e.target.checked };
            })
          }
        />
        Summen als Dezimalzahl anzeigen
      </label>
      <p className="muted small">
        Monats- und Jahressummen (Ist, Soll, Saldo, Zulagen, Überstunden) z. B. als 156,73 h statt 156:44 h.
        Einzelne Schichten bleiben als Uhrzeit.
      </p>
    </section>
  );
}
