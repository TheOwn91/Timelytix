import { useEffect, useState } from 'react';
import { NATIVE } from '../lib/native';
import { FORGOT_OPTIONS, forgotStopHours, syncReminders, weekReminderEnabled, weekReminderTime } from '../lib/reminders';
import {
  notifyEnabled,
  notifyOnWatch,
  notifySupport,
  refreshNotifySupport,
  requestNotifyPermission,
  setNotifyEnabled,
  setNotifyOnWatch,
  showTestNotification,
  syncRunningStatus,
} from '../lib/status';
import { useStore } from '../lib/store';

/** Hinweis nur, wenn etwas fehlt (bei „erlaubt“ keiner). */
const HINTS = {
  ok: '',
  ask: '',
  denied: NATIVE
    ? 'Blockiert – in den Handy-Einstellungen unter Apps → Timelytix erlauben.'
    : 'Blockiert – in den Website-Einstellungen des Browsers erlauben.',
  install: 'Auf dem iPhone erst nach „Zum Home-Bildschirm“ (ab iOS 16.4).',
  unsupported: 'Hier nicht verfügbar.',
} as const;

/** Einstellung: Anzeige „Zeit läuft“ in der Statusleiste und Erinnerungen. */
export function NotifyCard() {
  const { state, update } = useStore();
  const [enabled, setEnabled] = useState(notifyEnabled);
  const [watch, setWatch] = useState(notifyOnWatch);
  const [support, setSupport] = useState(notifySupport);
  const week = weekReminderEnabled(state);
  const weekTime = weekReminderTime(state);
  const forgot = forgotStopHours(state);
  const off = support === 'unsupported' || support === 'install';

  // Zurück aus den Handy-Einstellungen (dort erlaubt oder blockiert): Stand neu lesen
  useEffect(() => {
    const refresh = () => void refreshNotifySupport().then(setSupport);
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);

  const allow = async () => {
    await requestNotifyPermission();
    const s = notifySupport();
    setSupport(s);
    return s;
  };

  const toggle = async (on: boolean) => {
    setNotifyEnabled(on);
    setEnabled(on);
    if (on) await allow();
    await syncRunningStatus(state, true);
  };

  const setReminders = async (patch: { weekReminder?: boolean; weekReminderTime?: string; forgotStopHours?: number }) => {
    update((d) => {
      d.settings = { ...d.settings, ...patch };
    });
    // Beim Einschalten gleich um Erlaubnis fragen (muss direkt aus dem Tipp heraus geschehen)
    if ((patch.weekReminder || patch.forgotStopHours) && support === 'ask') await allow();
  };

  return (
    <section className="card">
      <h2>Benachrichtigungen</h2>
      <label className="checkbox toggle-row">
        <input id="notify-running" type="checkbox" checked={enabled} disabled={off} onChange={(e) => void toggle(e.target.checked)} />
        „Zeit läuft“ in der Statusleiste
      </label>
      {NATIVE && (
        <label className="checkbox toggle-row">
          <input
            id="notify-watch"
            type="checkbox"
            checked={watch}
            disabled={off || !enabled}
            onChange={(e) => {
              setWatch(e.target.checked);
              void setNotifyOnWatch(e.target.checked);
            }}
          />
          „Zeit läuft“ auch auf der Uhr (mit Pause/Beenden)
        </label>
      )}
      <label className="checkbox toggle-row">
        <input
          id="notify-week"
          type="checkbox"
          checked={week}
          disabled={off}
          onChange={(e) => void setReminders({ weekReminder: e.target.checked })}
        />
        Samstags an fehlende Einträge erinnern
      </label>
      <div className="field-list">
        {week && (
          <label className="select-row">
            <span>Uhrzeit</span>
            <input
              id="notify-week-time"
              type="time"
              value={weekTime}
              disabled={off}
              onChange={(e) => e.target.value && void setReminders({ weekReminderTime: e.target.value })}
            />
          </label>
        )}
        <label className="select-row">
          <span>Abstempeln vergessen?</span>
          <select
            id="notify-forgot"
            value={forgot}
            disabled={off}
            onChange={(e) => void setReminders({ forgotStopHours: Number(e.target.value) })}
          >
            {(FORGOT_OPTIONS.includes(forgot) ? FORGOT_OPTIONS : [...FORGOT_OPTIONS, forgot].sort((a, b) => a - b)).map((h) => (
              <option key={h} value={h}>
                {h ? `nach ${h} Std.` : 'nie'}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(HINTS[support] || (support === 'ok' && !NATIVE)) && (
        <p className="muted small">{HINTS[support] || 'Erinnerungen nur, solange Timelytix geöffnet ist.'}</p>
      )}
      {support === 'ask' && (
        <button
          className="btn secondary full"
          onClick={() =>
            void allow().then((s) => {
              void syncReminders(state, s === 'ok');
              // Läuft die Zeit schon, gleich „Zeit läuft“ zeigen
              void syncRunningStatus(state, true);
            })
          }
        >
          Benachrichtigungen erlauben
        </button>
      )}
      {enabled && support === 'ok' && (
        <button className="btn secondary full" onClick={() => void showTestNotification()}>
          Probe-Benachrichtigung senden
        </button>
      )}
    </section>
  );
}
