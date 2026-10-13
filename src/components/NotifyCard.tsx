import { useState } from 'react';
import { NATIVE } from '../lib/native';
import { FORGOT_OPTIONS, WEEK_REMINDER_HOUR, forgotStopHours, syncReminders, weekReminderEnabled } from '../lib/reminders';
import {
  notifyEnabled,
  notifySupport,
  requestNotifyPermission,
  setNotifyEnabled,
  showTestNotification,
  syncRunningStatus,
} from '../lib/status';
import { useStore } from '../lib/store';

const HINTS = {
  ok: 'Erlaubt.',
  ask: 'Beim ersten Start fragt das Handy, ob Timelytix Benachrichtigungen zeigen darf.',
  denied:
    'Benachrichtigungen sind blockiert. Erlaube sie in den Handy-Einstellungen unter Apps → Timelytix (bzw. im Browser unter Website-Einstellungen).',
  install: 'Auf dem iPhone gibt es Benachrichtigungen erst, wenn Timelytix auf dem Home-Bildschirm installiert ist (ab iOS 16.4).',
  unsupported: 'Hier nicht verfügbar – in der installierten App auf dem Handy funktioniert es.',
} as const;

/** Einstellung: Anzeige „Zeit läuft“ in der Statusleiste und Erinnerungen. */
export function NotifyCard() {
  const { state, update } = useStore();
  const [enabled, setEnabled] = useState(notifyEnabled);
  const [support, setSupport] = useState(notifySupport);
  const week = weekReminderEnabled(state);
  const forgot = forgotStopHours(state);
  const off = support === 'unsupported' || support === 'install';

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

  const setReminders = async (patch: { weekReminder?: boolean; forgotStopHours?: number }) => {
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
        Anzeige in der Statusleiste, solange die Zeit läuft
      </label>
      <label className="checkbox toggle-row">
        <input
          id="notify-week"
          type="checkbox"
          checked={week}
          disabled={off}
          onChange={(e) => void setReminders({ weekReminder: e.target.checked })}
        />
        Samstags um {WEEK_REMINDER_HOUR} Uhr erinnern, wenn in der Woche Einträge fehlen
      </label>
      <div className="field-list">
        <label className="select-row">
          <span>Erinnern</span>
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
      <p className="muted small">
        Läuft die Zeit länger als eingestellt, fragt Timelytix nach, ob du vergessen hast abzustempeln. {HINTS[support]}
        {support === 'ok' &&
          (NATIVE
            ? ' Erinnerungen kommen auch, wenn die App geschlossen ist.'
            : ' Erinnerungen kann der Browser nur zeigen, solange Timelytix geöffnet ist (oder beim nächsten Öffnen).')}
      </p>
      {support === 'ask' && (
        <button className="btn secondary full" onClick={() => void allow().then((s) => syncReminders(state, s === 'ok'))}>
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
