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
      <div className="field-list">
        <label className="select-row">
          <span>Größe</span>
          <select id="ui-scale" value={scale} onChange={(e) => chooseScale(e.target.value as UiScaleChoice)}>
            {UI_SCALE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
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
        Summen als Dezimalzahl (156,73 h statt 156:44 h)
      </label>
    </section>
  );
}
