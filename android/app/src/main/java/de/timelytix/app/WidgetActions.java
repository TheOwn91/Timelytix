package de.timelytix.app;

import android.content.Context;
import android.content.Intent;

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

    private static final long HOUR = 3_600_000L;
    private static final long MINUTE = 60_000L;

    private WidgetActions() {}

    /** `false`, wenn nichts zu tun war (z. B. Pause ohne laufende Zeit). */
    static synchronized boolean perform(Context context, String type, String projectId) {
        WidgetState s = WidgetState.load(context);
        if (s == null) return false;
        long now = System.currentTimeMillis();
        WidgetState.Project shown = s.shown();
        switch (type) {
            case START: {
                if (s.running != null || shown == null) return false;
                WidgetState.Running r = new WidgetState.Running();
                r.projectId = shown.id;
                r.start = now;
                // Gesetzliche Pause grob wie in der App: nach 6 h, nach 9 h der Rest bis 45 min
                if (shown.autoBreak > 0) {
                    long first = r.start + 6 * HOUR;
                    r.autoBreaks.add(new long[] { first, first + shown.autoBreak * MINUTE });
                    int rest = 45 - shown.autoBreak;
                    if (rest > 0) {
                        long second = first + shown.autoBreak * MINUTE + 3 * HOUR;
                        r.autoBreaks.add(new long[] { second, second + rest * MINUTE });
                    }
                }
                s.running = r;
                projectId = shown.id;
                break;
            }
            case PAUSE:
                if (s.running == null || s.paused()) return false;
                s.running.pauseStart = now;
                projectId = s.running.projectId;
                break;
            case RESUME:
                if (!s.paused()) return false;
                s.running.closedPauseMs += now - s.running.pauseStart;
                s.running.pauseStart = 0;
                projectId = s.running.projectId;
                break;
            case STOP: {
                if (s.running == null) return false;
                projectId = s.running.projectId;
                s.running = null;
                break;
            }
            case SELECT:
                if (s.running != null || s.project(projectId) == null) return false;
                s.selected = projectId;
                break;
            default:
                return false;
        }
        WidgetState.addAction(context, type, now, projectId);
        s.save(context);
        updateNotice(context, s, type);
        TimeWidgetProvider.updateAll(context);
        WidgetPlugin.onNativeAction();
        return true;
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
                "Pause seit " + WidgetState.fmtTime(s.running.pauseStart) + " · Arbeitsbeginn " + WidgetState.fmtTime(s.running.start),
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
