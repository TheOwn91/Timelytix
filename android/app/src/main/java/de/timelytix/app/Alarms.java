package de.timelytix.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.os.Build;

/**
 * Wecker für Widget und Erinnerungen: genau, wenn erlaubt (Android 12+: Einstellungen → Apps → Timelytix →
 * „Wecker und Erinnerungen“; vorher immer), sonst ungenau – dann kann Android bis zu etwa 10 Minuten später wecken.
 */
final class Alarms {
    private Alarms() {}

    static boolean exactAllowed(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager am = context.getSystemService(AlarmManager.class);
        return am != null && am.canScheduleExactAlarms();
    }

    /** Widget neu zeichnen (Beginn/Ende der gesetzlichen Pause): weckt das Handy nicht – nur sichtbar, wenn es wach ist. */
    static void redraw(Context context, long at, PendingIntent pi) {
        AlarmManager am = context.getSystemService(AlarmManager.class);
        if (am == null) return;
        if (exactAllowed(context)) {
            try {
                am.setExact(AlarmManager.RTC, at, pi);
                return;
            } catch (SecurityException e) {
                // gerade wieder entzogen – ungenau
            }
        }
        am.setWindow(AlarmManager.RTC, at, 60_000, pi);
    }

    /** Erinnerung zeigen: weckt das Handy, auch im Ruhezustand. */
    static void remind(Context context, long at, PendingIntent pi) {
        AlarmManager am = context.getSystemService(AlarmManager.class);
        if (am == null) return;
        if (exactAllowed(context)) {
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                return;
            } catch (SecurityException e) {
                // gerade wieder entzogen – ungenau
            }
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
    }
}
