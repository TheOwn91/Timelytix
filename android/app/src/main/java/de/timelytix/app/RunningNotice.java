package de.timelytix.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Anzeige „Zeit läuft“ in der Benachrichtigungsleiste. Seit Android 14 lässt sich jede Benachrichtigung
 * wegwischen – deshalb wird sie dann sofort (still) wieder gezeigt, bis die Zeit gestoppt ist. Titel und
 * Text liegen in den SharedPreferences, damit das auch bei geschlossener App und nach einem Neustart klappt.
 */
final class RunningNotice {
    static final int ID = 1;
    static final String ALERT_CHANNEL = "running-start";
    /**
     * Still, aber mit normaler Wichtigkeit: Symbol in der Statusleiste und nicht im Bereich „Lautlos“.
     * (Ersetzt den Kanal „running“ mit niedriger Wichtigkeit – die lässt sich nachträglich nicht ändern.)
     */
    static final String QUIET_CHANNEL = "running-silent";
    private static final String OLD_QUIET_CHANNEL = "running";
    private static final String PREFS = "running-notice";

    private RunningNotice() {}

    /** `paused`: Knopf „Weiter“ statt „Pause“. */
    static void show(Context context, String title, String body, boolean quiet, boolean paused) {
        prefs(context).edit().putString("title", title).putString("body", body).putBoolean("paused", paused).apply();
        post(context, title, body, quiet, paused);
    }

    static void hide(Context context) {
        prefs(context).edit().clear().apply();
        NotificationManagerCompat.from(context).cancel(ID);
    }

    /** Wieder anzeigen, wenn die Zeit noch läuft (nach Wegwischen oder Neustart). */
    static void restore(Context context) {
        SharedPreferences p = prefs(context);
        String title = p.getString("title", null);
        if (title != null) post(context, title, p.getString("body", ""), true, p.getBoolean("paused", false));
    }

    static boolean isShown(Context context) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        for (StatusBarNotification n : nm.getActiveNotifications()) {
            if (n.getId() == ID && n.getTag() == null) return true;
        }
        return false;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void post(Context context, String title, String body, boolean quiet, boolean paused) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(context);
        if (!nm.areNotificationsEnabled()) return;
        createChannels(context);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        Intent dismissed = new Intent(context, RunningNoticeReceiver.class).setAction(RunningNoticeReceiver.ACTION_DISMISSED);
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, quiet ? QUIET_CHANNEL : ALERT_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_timelytix)
            .setContentTitle(title)
            .setContentText(body)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(PendingIntent.getActivity(context, 0, open, flags))
            .setDeleteIntent(PendingIntent.getBroadcast(context, 0, dismissed, flags));
        // Knöpfe: Pause/Weiter und Beenden (wirken sofort, siehe WidgetActions)
        String toggle = paused ? WidgetActions.RESUME : WidgetActions.PAUSE;
        b.addAction(0, paused ? "Weiter" : "Pause", WidgetActionReceiver.pending(context, toggle));
        b.addAction(0, "Beenden", WidgetActionReceiver.pending(context, WidgetActions.STOP));
        try {
            nm.notify(ID, b.build());
        } catch (SecurityException e) {
            // Berechtigung zurückgezogen
        }
    }

    private static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        // „Zeit gestartet“ wie bisher (src/lib/native.ts) – bestehende Einstellungen bleiben erhalten
        NotificationChannel alert = new NotificationChannel(ALERT_CHANNEL, "Zeit gestartet", NotificationManager.IMPORTANCE_DEFAULT);
        alert.enableVibration(false);
        alert.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        NotificationChannel quiet = new NotificationChannel(QUIET_CHANNEL, "Zeit läuft", NotificationManager.IMPORTANCE_DEFAULT);
        quiet.setSound(null, null);
        quiet.enableVibration(false);
        quiet.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(alert);
        nm.createNotificationChannel(quiet);
        nm.deleteNotificationChannel(OLD_QUIET_CHANNEL);
    }
}
