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
        <label className="select-row">
          <span>Summen</span>
          <select
            id="decimal-hours"
            value={decimal ? 'decimal' : 'hm'}
            onChange={(e) =>
              update((d) => {
                d.settings = { ...d.settings, decimalHours: e.target.value === 'decimal' };
              })
            }
          >
            <option value="hm">156:44 h</option>
            <option value="decimal">156,73 h</option>
          </select>
        </label>
        <label className="select-row">
          <span>Uhrzeit oben</span>
          <select
            id="header-clock"
            value={state.settings?.hideClock ? 'off' : 'on'}
            onChange={(e) =>
              update((d) => {
                d.settings = { ...d.settings, hideClock: e.target.value === 'off' || undefined };
              })
            }
          >
            <option value="on">anzeigen</option>
            <option value="off">ausblenden</option>
          </select>
        </label>
      </div>
    </section>
  );
}
