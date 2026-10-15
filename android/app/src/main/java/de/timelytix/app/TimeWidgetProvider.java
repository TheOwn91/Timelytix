package de.timelytix.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Widget für den Startbildschirm: Arbeitgeber wählen, Start / Pause / Weiter / Beenden, laufende Zeit
 * (zählt von selbst weiter) und Saldo des laufenden Monats. Klein (unter 3 Spalten bzw. 2 Zeilen) nur Uhr
 * und Start/Beenden.
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
                manager.updateAppWidget(id, build(context, s, now, isSmall(manager.getAppWidgetOptions(id))));
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
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
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

    private static boolean isSmall(Bundle options) {
        int w = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int h = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110);
        return w < 180 || h < 90;
    }

    private static RemoteViews build(Context context, WidgetState s, long now, boolean small) {
        RemoteViews v = new RemoteViews(context.getPackageName(), small ? R.layout.widget_small : R.layout.widget);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(context, 12, WidgetActions.openApp(context), flags);
        v.setOnClickPendingIntent(R.id.widget_clock_area, open);
        WidgetState.Project p = s == null ? null : s.shown();
        if (p == null) {
            // Noch keine Daten: App einmal öffnen
            v.setTextViewText(R.id.widget_name, "Timelytix");
            v.setTextColor(R.id.widget_dot, context.getColor(R.color.widget_primary));
            v.setOnClickPendingIntent(R.id.widget_name_row, open);
            v.setChronometer(R.id.widget_clock, SystemClock.elapsedRealtime(), null, false);
            v.setTextViewText(R.id.widget_status, "App öffnen und Arbeitgeber anlegen");
            v.setViewVisibility(R.id.widget_status, small ? View.GONE : View.VISIBLE);
            v.setViewVisibility(R.id.widget_start, View.GONE);
            v.setViewVisibility(R.id.widget_pause, View.GONE);
            v.setViewVisibility(R.id.widget_stop, View.GONE);
            v.setViewVisibility(R.id.widget_balance, View.GONE);
            return v;
        }
        boolean running = s.running != null;
        boolean paused = s.paused();
        boolean auto = !paused && s.inAutoBreak(now);

        v.setTextViewText(R.id.widget_name, p.name.isEmpty() ? "Ohne Namen" : p.name);
        v.setTextColor(R.id.widget_dot, parseColor(p.color, context.getColor(R.color.widget_primary)));
        // Wechsel nur, solange keine Zeit läuft (wie in der App)
        v.setViewVisibility(R.id.widget_chevron, running || s.projects.size() < 2 ? View.GONE : View.VISIBLE);
        v.setOnClickPendingIntent(R.id.widget_name_row, running || s.projects.size() < 2 ? open : PickProjectActivity.pending(context));

        long net = s.netMs(now);
        v.setChronometer(R.id.widget_clock, SystemClock.elapsedRealtime() - net, null, running && !paused && !auto);

        String status;
        if (!running) status = "Bereit";
        else if (paused) status = "Pause seit " + WidgetState.fmtTime(s.running.pauseStart);
        else if (auto) status = "Pause (automatisch)";
        else status = "Läuft seit " + WidgetState.fmtTime(s.running.start);
        v.setTextViewText(R.id.widget_status, status);
        v.setViewVisibility(R.id.widget_status, small ? View.GONE : View.VISIBLE);

        v.setViewVisibility(R.id.widget_start, running ? View.GONE : View.VISIBLE);
        v.setOnClickPendingIntent(R.id.widget_start, WidgetActionReceiver.pending(context, WidgetActions.START, null));
        v.setViewVisibility(R.id.widget_stop, running ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(R.id.widget_stop, ConfirmStopActivity.pending(context));
        if (small) {
            v.setViewVisibility(R.id.widget_pause, View.GONE);
            v.setViewVisibility(R.id.widget_balance, View.GONE);
            return v;
        }
        v.setViewVisibility(R.id.widget_pause, running ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.widget_pause, paused ? "▶ Weiter" : "⏸ Pause");
        v.setInt(R.id.widget_pause, "setBackgroundResource", paused ? R.drawable.widget_btn_primary : R.drawable.widget_btn_warning);
        v.setOnClickPendingIntent(R.id.widget_pause, WidgetActionReceiver.pending(context, paused ? WidgetActions.RESUME : WidgetActions.PAUSE, null));

        v.setOnClickPendingIntent(R.id.widget_balance, open);
        double balance = s.balanceNow(p, now);
        if (Double.isNaN(balance)) {
            v.setViewVisibility(R.id.widget_balance, View.GONE);
        } else {
            v.setViewVisibility(R.id.widget_balance, View.VISIBLE);
            v.setTextViewText(R.id.widget_balance, "Saldo Monat: " + s.fmtHours(balance) + " h");
            v.setTextColor(R.id.widget_balance, context.getColor(Math.round(balance) < 0 ? R.color.widget_negative : R.color.widget_positive));
        }
        return v;
    }

    /** Läuft die Zeit, jede Minute neu zeichnen (Saldo) und zu Beginn/Ende einer automatischen Pause. */
    private static void scheduleRefresh(Context context, WidgetState s, long now) {
        AlarmManager am = context.getSystemService(AlarmManager.class);
        Intent i = new Intent(context, TimeWidgetProvider.class).setAction(ACTION_REFRESH);
        PendingIntent pi = PendingIntent.getBroadcast(context, 13, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (am == null) return;
        if (s == null || s.running == null || s.paused()) {
            am.cancel(pi);
            return;
        }
        long next = WidgetState.startOfNextMinute(now);
        long auto = s.nextAutoBreakChange(now);
        if (auto > 0 && auto < next) next = auto;
        // Ungenauer Wecker genügt (keine Berechtigung nötig); bei ausgeschaltetem Bildschirm wartet Android
        am.set(AlarmManager.RTC, next, pi);
    }

    private static int parseColor(String color, int fallback) {
        try {
            return Color.parseColor(color);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }
}
