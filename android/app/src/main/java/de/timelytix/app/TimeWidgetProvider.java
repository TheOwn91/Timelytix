package de.timelytix.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.SystemClock;
import android.text.format.DateUtils;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Widget für den Startbildschirm (3×1): Arbeitgeber wählen und laufende Zeit (zählt von selbst weiter),
 * darunter Start bzw. Pause/Weiter und Beenden.
 */
public class TimeWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "de.timelytix.app.WIDGET_REFRESH";

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TimeWidgetProvider.class));
        WidgetState s = WidgetState.load(context);
        long now = System.currentTimeMillis();
        for (int id : ids) {
            try {
                manager.updateAppWidget(id, build(context, s, now));
            } catch (RuntimeException e) {
                // ein Widget, das gerade entfernt wird
            }
        }
        scheduleRefresh(context, ids.length > 0 ? s : null, now);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        updateAll(context);
    }

    @Override
    public void onDisabled(Context context) {
        scheduleRefresh(context, null, 0);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) updateAll(context);
    }

    private static RemoteViews build(Context context, WidgetState s, long now) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(context, 12, WidgetActions.openApp(context), flags);
        v.setOnClickPendingIntent(R.id.widget_clock, open);
        WidgetState.Project p = s == null ? null : s.shown();
        if (p == null) {
            // Noch keine Daten: App einmal öffnen
            v.setTextViewText(R.id.widget_name, "Timelytix öffnen");
            v.setTextColor(R.id.widget_dot, context.getColor(R.color.widget_primary));
            v.setViewVisibility(R.id.widget_chevron, View.GONE);
            v.setOnClickPendingIntent(R.id.widget_name_row, open);
            v.setChronometer(R.id.widget_clock, SystemClock.elapsedRealtime(), fixed(0), false);
            v.setViewVisibility(R.id.widget_start, View.GONE);
            v.setViewVisibility(R.id.widget_pause, View.GONE);
            v.setViewVisibility(R.id.widget_stop, View.GONE);
            return v;
        }
        boolean running = s.running != null;
        boolean paused = s.paused();
        boolean auto = !paused && s.inAutoBreak(now);

        v.setTextViewText(R.id.widget_name, p.name.isEmpty() ? "Ohne Namen" : p.name);
        v.setTextColor(R.id.widget_dot, parseColor(p.color, context.getColor(R.color.widget_primary)));
        // Wechsel nur, solange keine Zeit läuft (wie in der App)
        boolean canPick = !running && s.projects.size() > 1;
        v.setViewVisibility(R.id.widget_chevron, canPick ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(R.id.widget_name_row, canPick ? PickProjectActivity.pending(context) : open);

        // Steht während einer Pause (auch der automatischen nach 6 h) – dann mit festem Text, sonst zählte die Uhr
        // beim erneuten Anzeigen durch den Startbildschirm von selbst weiter
        long net = s.netMs(now);
        boolean ticking = running && !paused && !auto;
        v.setChronometer(R.id.widget_clock, SystemClock.elapsedRealtime() - net, ticking ? null : fixed(net), ticking);

        v.setViewVisibility(R.id.widget_start, running ? View.GONE : View.VISIBLE);
        v.setOnClickPendingIntent(R.id.widget_start, WidgetActionReceiver.pending(context, WidgetActions.START));
        v.setViewVisibility(R.id.widget_pause, running ? View.VISIBLE : View.GONE);
        v.setImageViewResource(R.id.widget_pause_icon, paused ? R.drawable.ic_widget_play : R.drawable.ic_widget_pause);
        v.setTextViewText(R.id.widget_pause_label, paused ? "Weiter" : "Pause");
        v.setContentDescription(R.id.widget_pause, paused ? "Weiter" : "Pause");
        v.setInt(R.id.widget_pause, "setBackgroundResource", paused ? R.drawable.widget_btn_primary : R.drawable.widget_btn_warning);
        v.setOnClickPendingIntent(R.id.widget_pause, WidgetActionReceiver.pending(context, paused ? WidgetActions.RESUME : WidgetActions.PAUSE));
        v.setViewVisibility(R.id.widget_stop, running ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(R.id.widget_stop, WidgetActionReceiver.pending(context, WidgetActions.STOP));
        return v;
    }

    /** Zu Beginn und Ende einer automatischen Pause neu zeichnen (Uhr anhalten bzw. weiterlaufen lassen). */
    private static void scheduleRefresh(Context context, WidgetState s, long now) {
        AlarmManager am = context.getSystemService(AlarmManager.class);
        Intent i = new Intent(context, TimeWidgetProvider.class).setAction(ACTION_REFRESH);
        PendingIntent pi = PendingIntent.getBroadcast(context, 13, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (am == null) return;
        long next = s == null || s.running == null || s.paused() ? 0 : s.nextAutoBreakChange(now);
        if (next == 0) {
            am.cancel(pi);
            return;
        }
        // Ungenauer Wecker mit kurzem Zeitfenster (keine Berechtigung nötig); bei ausgeschaltetem Bildschirm wartet Android
        am.setWindow(AlarmManager.RTC, next, 60_000, pi);
    }

    /** Angehaltene Uhr als fester Text (Format wie die laufende Uhr). */
    private static String fixed(long ms) {
        return DateUtils.formatElapsedTime(Math.max(0, ms) / 1000);
    }

    private static int parseColor(String color, int fallback) {
        try {
            return Color.parseColor(color);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }
}
