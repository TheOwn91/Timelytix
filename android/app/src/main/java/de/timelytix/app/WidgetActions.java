package de.timelytix.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;

/**
 * Start, Pause, Weiter, Beenden und Arbeitgeber wählen aus Widget und Benachrichtigung: sofort anzeigen,
 * die Aktion mit Uhrzeit merken (die App übernimmt sie in ihre Daten, siehe src/lib/widget.ts).
 */
final class WidgetActions {
    static final String START = "start";
    static final String PAUSE = "pause";
    static final String RESUME = "resume";
    static final String STOP = "stop";
    static final String SELECT = "select";

    /** Kennung der Erinnerung „Abstempeln vergessen?“ – wie in src/lib/reminders.ts (forgotReminder, id 4). */
    static final int FORGOT_REMINDER_ID = 4;
    /** Empfänger und Speicher der geplanten Erinnerungen im Plugin @capacitor/local-notifications. */
    private static final String REMINDER_PUBLISHER = "com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher";
    private static final String REMINDER_STORE = "NOTIFICATION_STORE";

    private WidgetActions() {}

    /** `false`, wenn nichts zu tun war (z. B. Pause ohne laufende Zeit). */
    static boolean perform(Context context, String type, String projectId) {
        WidgetState s;
        // Dieselbe Sperre wie beim Abholen durch die App (WidgetPlugin): keine Aktion geht verloren
        synchronized (WidgetState.class) {
            s = WidgetState.load(context);
            if (s == null) return false;
            long now = System.currentTimeMillis();
            switch (type) {
                case START: {
                    WidgetState.Project shown = s.shown();
                    if (s.running != null || shown == null) return false;
                    s.start(shown, now);
                    projectId = shown.id;
                    break;
                }
                case PAUSE:
                    if (s.running == null || s.paused()) return false;
                    s.pause(now);
                    projectId = s.running.projectId;
                    break;
                case RESUME:
                    if (!s.paused()) return false;
                    s.resume(now);
                    projectId = s.running.projectId;
                    break;
                case STOP:
                    if (s.running == null) return false;
                    projectId = s.running.projectId;
                    s.stop(now);
                    break;
                case SELECT:
                    if (s.running != null || s.project(projectId) == null) return false;
                    s.selected = projectId;
                    break;
                default:
                    return false;
            }
            WidgetState.addAction(context, type, now, projectId);
            s.save(context);
        }
        updateNotice(context, s, type);
        if (STOP.equals(type)) cancelForgotReminder(context);
        TimeWidgetProvider.updateAll(context);
        WidgetPlugin.onNativeAction();
        return true;
    }

    /**
     * Beendet im Widget oder in der Benachrichtigung: Die App hat beim Start die Erinnerung „Abstempeln vergessen?“
     * eingeplant und löscht sie erst, wenn sie das Beenden übernimmt – bei geschlossener App wäre das zu spät. Deshalb
     * hier denselben Wecker wie das Plugin aufheben (gleiche Kennung und gleicher Empfänger), den Eintrag fürs
     * Wiederherstellen nach einem Neustart löschen und eine schon gezeigte Erinnerung entfernen.
     */
    static void cancelForgotReminder(Context context) {
        Intent intent = new Intent().setClassName(context, REMINDER_PUBLISHER);
        int flags = PendingIntent.FLAG_NO_CREATE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(context, FORGOT_REMINDER_ID, intent, flags);
        if (pi != null) {
            AlarmManager am = context.getSystemService(AlarmManager.class);
            if (am != null) am.cancel(pi);
            pi.cancel();
        }
        context.getSharedPreferences(REMINDER_STORE, Context.MODE_PRIVATE)
            .edit()
            .remove(String.valueOf(FORGOT_REMINDER_ID))
            .apply();
        NotificationManagerCompat.from(context).cancel(FORGOT_REMINDER_ID);
    }

    /** Anzeige „Zeit läuft“ wie in der App (src/lib/status.ts: runningNotice). */
    private static void updateNotice(Context context, WidgetState s, String type) {
        if (s.running == null) {
            RunningNotice.hide(context);
            return;
        }
        if (!s.notify || SELECT.equals(type)) return;
        WidgetState.Project p = s.project(s.running.projectId);
        String name = p != null ? p.name : "Timelytix";
        if (s.paused()) {
            RunningNotice.show(context, "‖ Pause – " + name,
                "Pause seit " + WidgetState.fmtTime(s.pauseStart()) + " · Arbeitsbeginn " + WidgetState.fmtTime(s.running.start),
                true, true);
        } else {
            RunningNotice.show(context, "⏱ Zeit läuft – " + name,
                "Seit " + WidgetState.fmtTime(s.running.start) + " · Tippen zum Öffnen",
                !START.equals(type), false);
        }
    }

    /** App öffnen (Tipp auf die Uhr, oder wenn das Widget noch keine Daten hat). */
    static Intent openApp(Context context) {
        return new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }
}
