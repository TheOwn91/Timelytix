package de.timelytix.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Erinnerung „Abstempeln vergessen?“, wenn Widget oder Benachrichtigung die Zeit starten bzw. beenden, ohne dass die
 * App läuft. Sonst plant die App sie (src/lib/reminders.ts: forgotReminder, Kennung 4) über @capacitor/local-notifications.
 * - Start im Widget: eigener Wecker. Übernimmt die App den Start, plant sie ihre Erinnerung und hebt diesen auf
 *   (RunningNoticePlugin.cancelForgot); beim Auslösen wird zur Sicherheit noch einmal geprüft.
 * - Beenden im Widget: eigenen Wecker und den der App aufheben.
 */
final class ForgotReminder {
    static final String ACTION = "de.timelytix.app.FORGOT_REMINDER";
    /** Dieselbe Kennung wie in der App: höchstens eine Erinnerung sichtbar. */
    static final int ID = 4;
    private static final int REQUEST = 14;
    private static final String CHANNEL = "reminders";
    /** Empfänger und Speicher der geplanten Erinnerungen im Plugin @capacitor/local-notifications. */
    private static final String PLUGIN_PUBLISHER = "com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher";
    private static final String PLUGIN_STORE = "NOTIFICATION_STORE";
    private static final long HOUR = 3_600_000L;

    private ForgotReminder() {}

    private static PendingIntent own(Context context, Intent extras, int flags) {
        Intent i = new Intent(context, RunningNoticeReceiver.class).setAction(ACTION);
        if (extras != null) i.putExtras(extras);
        return PendingIntent.getBroadcast(context, REQUEST, i, flags | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent plugin(Context context) {
        int flags = PendingIntent.FLAG_NO_CREATE;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
        return PendingIntent.getBroadcast(context, ID, new Intent().setClassName(context, PLUGIN_PUBLISHER), flags);
    }

    /** Laufende Zeit im Widget gestartet (bzw. nach einem Neustart des Handys): Erinnerung einplanen. */
    static void schedule(Context context, WidgetState s) {
        if (s == null || s.running == null || s.forgotHours <= 0) return;
        long at = s.running.start + s.forgotHours * HOUR;
        if (at <= System.currentTimeMillis()) return;
        WidgetState.Project p = s.project(s.running.projectId);
        Intent extras = new Intent()
            .putExtra("start", s.running.start)
            .putExtra("title", "⏰ Seit " + s.forgotHours + " Stunden eingestempelt – " + (p != null ? p.name : "Timelytix"))
            .putExtra("body", "Zeit läuft seit " + WidgetState.fmtTime(s.running.start) + ". Vergessen abzustempeln?");
        Alarms.remind(context, at, own(context, extras, PendingIntent.FLAG_UPDATE_CURRENT));
    }

    /** „Wecker und Erinnerungen“ erlaubt: eine schon geplante eigene Erinnerung genau neu stellen. */
    static void reschedule(Context context) {
        if (own(context, null, PendingIntent.FLAG_NO_CREATE) != null) schedule(context, WidgetState.load(context));
    }

    /** Nur den eigenen Wecker aufheben (die App hat übernommen). */
    static void cancelOwn(Context context) {
        PendingIntent pi = own(context, null, PendingIntent.FLAG_NO_CREATE);
        if (pi == null) return;
        AlarmManager am = context.getSystemService(AlarmManager.class);
        if (am != null) am.cancel(pi);
        pi.cancel();
    }

    /**
     * Zeit im Widget beendet: eigenen Wecker und den der App aufheben (gleiche Kennung und gleicher Empfänger wie im
     * Plugin), den Eintrag fürs Wiederherstellen nach einem Neustart löschen und eine gezeigte Erinnerung entfernen.
     */
    static void cancelAll(Context context) {
        cancelOwn(context);
        PendingIntent pi = plugin(context);
        if (pi != null) {
            AlarmManager am = context.getSystemService(AlarmManager.class);
            if (am != null) am.cancel(pi);
            pi.cancel();
        }
        context.getSharedPreferences(PLUGIN_STORE, Context.MODE_PRIVATE).edit().remove(String.valueOf(ID)).apply();
        NotificationManagerCompat.from(context).cancel(ID);
    }

    /** Eigener Wecker ausgelöst: zeigen, wenn dieselbe Zeit noch läuft und die App nicht selbst erinnert. */
    static void onAlarm(Context context, Intent intent) {
        WidgetState s = WidgetState.load(context);
        long start = intent.getLongExtra("start", 0);
        if (s == null || s.running == null || s.running.start != start) return;
        if (plugin(context) != null || shown(context)) return;
        NotificationManagerCompat nm = NotificationManagerCompat.from(context);
        if (!nm.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Wie in der App (src/lib/native.ts: ensureChannels) – besteht er schon, ändert das nichts
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Erinnerungen", NotificationManager.IMPORTANCE_HIGH);
            context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        PendingIntent open = PendingIntent.getActivity(context, 15, WidgetActions.openApp(context),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_timelytix)
            .setContentTitle(intent.getStringExtra("title"))
            .setContentText(intent.getStringExtra("body"))
            .setAutoCancel(true)
            .setContentIntent(open);
        try {
            nm.notify(ID, b.build());
        } catch (SecurityException e) {
            // Berechtigung zurückgezogen
        }
    }

    private static boolean shown(Context context) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return false;
        for (StatusBarNotification n : nm.getActiveNotifications()) if (n.getId() == ID) return true;
        return false;
    }
}
