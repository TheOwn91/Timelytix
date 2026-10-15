package de.timelytix.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Zustand für Widget und Benachrichtigungs-Knöpfe. Die Web-App legt einen Auszug ab (src/lib/widget.ts:
 * Arbeitgeber, laufende Zeit); Widget und Benachrichtigung ändern ihn sofort selbst und merken
 * sich jede Aktion mit Uhrzeit. Die App übernimmt die Aktionen beim nächsten Öffnen in ihre Daten.
 */
final class WidgetState {
    private static final String PREFS = "widget";
    private static final String SNAPSHOT = "snapshot";
    private static final String ACTIONS = "actions";

    static final class Project {
        String id;
        String name;
        String color;
        /** Länge der automatischen Pause nach 6 h (Minuten), 0 = aus. */
        int autoBreak;
    }

    static final class Running {
        String projectId;
        long start;
        long closedPauseMs;
        /** Beginn der offenen Pause, 0 = keine. */
        long pauseStart;
        /** Automatische Pausen als Zeitfenster [Beginn, Ende]. */
        List<long[]> autoBreaks = new ArrayList<>();
    }

    long at;
    boolean notify = true;
    String selected;
    List<Project> projects = new ArrayList<>();
    Running running;

    private WidgetState() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** null: Die App wurde noch nie geöffnet (oder es gibt keine Arbeitgeber). */
    static WidgetState load(Context context) {
        String raw = prefs(context).getString(SNAPSHOT, null);
        if (raw == null) return null;
        try {
            return parse(new JSONObject(raw));
        } catch (JSONException e) {
            return null;
        }
    }

    /** Auszug der App übernehmen – außer es warten noch Aktionen (die App holt sie gleich ab). */
    static boolean saveFromApp(Context context, String json) {
        if (hasActions(context)) return false;
        try {
            parse(new JSONObject(json));
        } catch (JSONException e) {
            return false;
        }
        prefs(context).edit().putString(SNAPSHOT, json).apply();
        return true;
    }

    void save(Context context) {
        try {
            prefs(context).edit().putString(SNAPSHOT, toJson().toString()).apply();
        } catch (JSONException e) {
            // nicht speicherbar – Anzeige bleibt beim alten Stand
        }
    }

    static void addAction(Context context, String type, long at, String projectId) {
        SharedPreferences p = prefs(context);
        try {
            JSONArray list = new JSONArray(p.getString(ACTIONS, "[]"));
            JSONObject a = new JSONObject().put("type", type).put("at", at);
            if (projectId != null) a.put("projectId", projectId);
            list.put(a);
            p.edit().putString(ACTIONS, list.toString()).commit();
        } catch (JSONException e) {
            // ignorieren
        }
    }

    static boolean hasActions(Context context) {
        String raw = prefs(context).getString(ACTIONS, "[]");
        return raw != null && !raw.equals("[]");
    }

    /** Gemerkte Aktionen abholen und leeren (für die App). */
    static synchronized String takeActions(Context context) {
        SharedPreferences p = prefs(context);
        String raw = p.getString(ACTIONS, "[]");
        p.edit().remove(ACTIONS).commit();
        return raw;
    }

    Project project(String id) {
        if (id == null) return null;
        for (Project p : projects) if (p.id.equals(id)) return p;
        return null;
    }

    /** Arbeitgeber, der im Widget angezeigt wird (läuft die Zeit, deren Arbeitgeber). */
    Project shown() {
        Project p = running != null ? project(running.projectId) : project(selected);
        return p != null ? p : (projects.isEmpty() ? null : projects.get(0));
    }

    boolean paused() {
        return running != null && running.pauseStart > 0;
    }

    /** Netto-Arbeitszeit der laufenden Buchung bis `t` (ms) – ohne Pausen und automatische Pausen. */
    long netMs(long t) {
        if (running == null || t <= running.start) return 0;
        long pause = running.closedPauseMs + (running.pauseStart > 0 ? Math.max(0, t - running.pauseStart) : 0);
        long auto = 0;
        for (long[] b : running.autoBreaks) {
            long from = Math.max(b[0], running.start);
            long to = Math.min(b[1], t);
            if (to > from) auto += to - from;
        }
        return Math.max(0, t - running.start - pause - auto);
    }

    /** Liegt `t` in einer automatischen Pause? */
    boolean inAutoBreak(long t) {
        if (running == null) return false;
        for (long[] b : running.autoBreaks) if (t >= b[0] && t < b[1]) return true;
        return false;
    }

    /** Nächster Zeitpunkt nach `t`, an dem eine automatische Pause beginnt oder endet (0 = keiner). */
    long nextAutoBreakChange(long t) {
        long next = 0;
        if (running == null) return 0;
        for (long[] b : running.autoBreaks) {
            for (long x : b) if (x > t && (next == 0 || x < next)) next = x;
        }
        return next;
    }

    static String fmtTime(long ts) {
        return new SimpleDateFormat("HH:mm", Locale.GERMANY).format(new Date(ts));
    }

    private static WidgetState parse(JSONObject o) throws JSONException {
        WidgetState s = new WidgetState();
        s.at = o.getLong("at");
        s.notify = o.optBoolean("notify", true);
        s.selected = o.isNull("selected") ? null : o.optString("selected", null);
        JSONArray list = o.getJSONArray("projects");
        for (int i = 0; i < list.length(); i++) {
            JSONObject j = list.getJSONObject(i);
            Project p = new Project();
            p.id = j.getString("id");
            p.name = j.optString("name", "");
            p.color = j.optString("color", "#2563eb");
            p.autoBreak = j.optInt("autoBreak", 0);
            s.projects.add(p);
        }
        JSONObject r = o.optJSONObject("running");
        if (r != null) {
            Running run = new Running();
            run.projectId = r.getString("projectId");
            run.start = r.getLong("start");
            run.closedPauseMs = r.optLong("closedPauseMs", 0);
            run.pauseStart = r.isNull("pauseStart") ? 0 : r.optLong("pauseStart", 0);
            JSONArray breaks = r.optJSONArray("autoBreaks");
            if (breaks != null) {
                for (int i = 0; i < breaks.length(); i++) {
                    JSONArray b = breaks.getJSONArray(i);
                    run.autoBreaks.add(new long[] { b.getLong(0), b.getLong(1) });
                }
            }
            s.running = run;
        }
        return s;
    }

    private JSONObject toJson() throws JSONException {
        JSONObject o = new JSONObject()
            .put("at", at)
            .put("notify", notify)
            .put("selected", selected == null ? JSONObject.NULL : selected);
        JSONArray list = new JSONArray();
        for (Project p : projects) {
            list.put(new JSONObject()
                .put("id", p.id)
                .put("name", p.name)
                .put("color", p.color)
                .put("autoBreak", p.autoBreak));
        }
        o.put("projects", list);
        if (running != null) {
            JSONArray breaks = new JSONArray();
            for (long[] b : running.autoBreaks) breaks.put(new JSONArray().put(b[0]).put(b[1]));
            o.put("running", new JSONObject()
                .put("projectId", running.projectId)
                .put("start", running.start)
                .put("closedPauseMs", running.closedPauseMs)
                .put("pauseStart", running.pauseStart > 0 ? running.pauseStart : JSONObject.NULL)
                .put("autoBreaks", breaks));
        } else {
            o.put("running", JSONObject.NULL);
        }
        return o;
    }
}
