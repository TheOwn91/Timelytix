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
 * sich jede Aktion mit Uhrzeit. Die App übernimmt die Aktionen und bestätigt sie, sobald sie gespeichert sind.
 * Alle Zugriffe auf Auszug und Aktionen laufen über die Sperre `WidgetState.class`.
 */
final class WidgetState {
    private static final String PREFS = "widget";
    private static final String SNAPSHOT = "snapshot";
    private static final String ACTIONS = "actions";
    private static final String SEQ = "seq";
    private static final long MINUTE = 60_000L;
    /** So weit rechnet das Widget die laufende Zeit im Voraus – dann stehen auch die kommenden Pausen fest. */
    private static final long AHEAD = 16 * 60 * MINUTE;

    static final class Project {
        String id;
        String name;
        String color;
        /** Länge der automatischen Pause nach 6 h (Minuten), 0 = aus. */
        int autoBreak;
        /** Übrige Arbeit von heute (ohne Pausen) – zählt für die gesetzlichen Pausen mit. */
        List<long[]> today = new ArrayList<>();
    }

    static final class Running {
        String projectId;
        long start;
        /** Pausen [Beginn, Ende]; Ende 0 = offen. */
        List<long[]> pauses = new ArrayList<>();
        /** Übrige Arbeit desselben Tages (ohne Pausen). */
        List<long[]> dayWork = new ArrayList<>();
    }

    boolean notify = true;
    /** Uhrzeit im Widget (Einstellungen → Anzeige). */
    boolean clock;
    /** Erinnerung „Abstempeln vergessen?“ nach so vielen Stunden (0 = aus). */
    int forgotHours;
    String selected;
    List<Project> projects = new ArrayList<>();
    /** Grenzen des Tages, für den `Project.today` gilt. */
    long dayStart;
    long dayEnd;
    Running running;

    private WidgetState() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** null: Die App wurde noch nie geöffnet (oder es gibt keine Arbeitgeber). */
    static synchronized WidgetState load(Context context) {
        String raw = prefs(context).getString(SNAPSHOT, null);
        if (raw == null) return null;
        try {
            return parse(new JSONObject(raw));
        } catch (JSONException e) {
            return null;
        }
    }

    /**
     * Auszug der App übernehmen – außer es warten noch Aktionen (die App holt sie gleich ab). `true`, wenn sich
     * etwas geändert hat (sonst muss das Widget nicht neu gezeichnet werden).
     */
    static synchronized boolean saveFromApp(Context context, String json) {
        if (hasActions(context) || json.equals(prefs(context).getString(SNAPSHOT, null))) return false;
        try {
            parse(new JSONObject(json));
        } catch (JSONException e) {
            return false;
        }
        prefs(context).edit().putString(SNAPSHOT, json).apply();
        return true;
    }

    void save(Context context) {
        synchronized (WidgetState.class) {
            try {
                prefs(context).edit().putString(SNAPSHOT, toJson().toString()).apply();
            } catch (JSONException e) {
                // nicht speicherbar – Anzeige bleibt beim alten Stand
            }
        }
    }

    /** Aktion mit laufender Nummer anhängen (die App bestätigt bis zu dieser Nummer). */
    static synchronized void addAction(Context context, String type, long at, String projectId) {
        SharedPreferences p = prefs(context);
        try {
            long seq = p.getLong(SEQ, 0) + 1;
            JSONArray list = new JSONArray(p.getString(ACTIONS, "[]"));
            JSONObject a = new JSONObject().put("type", type).put("at", at).put("seq", seq);
            if (projectId != null) a.put("projectId", projectId);
            list.put(a);
            p.edit().putString(ACTIONS, list.toString()).putLong(SEQ, seq).commit();
        } catch (JSONException e) {
            // ignorieren
        }
    }

    static synchronized boolean hasActions(Context context) {
        String raw = prefs(context).getString(ACTIONS, "[]");
        return raw != null && !raw.equals("[]");
    }

    /** Gemerkte Aktionen für die App (sie bleiben, bis die App sie bestätigt). */
    static synchronized String actions(Context context) {
        return prefs(context).getString(ACTIONS, "[]");
    }

    /** Von der App übernommene und gespeicherte Aktionen löschen (alle bis einschließlich Nummer `upTo`). */
    static synchronized void ack(Context context, long upTo) {
        SharedPreferences p = prefs(context);
        try {
            JSONArray list = new JSONArray(p.getString(ACTIONS, "[]"));
            JSONArray rest = new JSONArray();
            for (int i = 0; i < list.length(); i++) {
                JSONObject a = list.getJSONObject(i);
                if (a.optLong("seq", 0) > upTo) rest.put(a);
            }
            p.edit().putString(ACTIONS, rest.toString()).commit();
        } catch (JSONException e) {
            p.edit().remove(ACTIONS).commit();
        }
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

    private long[] openPause() {
        if (running == null) return null;
        for (long[] p : running.pauses) if (p[1] == 0) return p;
        return null;
    }

    boolean paused() {
        return openPause() != null;
    }

    /** Beginn der offenen Pause, 0 = keine. */
    long pauseStart() {
        long[] p = openPause();
        return p == null ? 0 : p[0];
    }

    // --- Aktionen aus Widget und Benachrichtigung (wie applyWidgetActions in src/lib/widget.ts) ---

    void start(Project p, long now) {
        Running r = new Running();
        r.projectId = p.id;
        r.start = now;
        if (now >= dayStart && now < dayEnd) r.dayWork.addAll(p.today);
        running = r;
    }

    void pause(long now) {
        running.pauses.add(new long[] { now, 0 });
    }

    void resume(long now) {
        long[] open = openPause();
        if (open == null) return;
        if (now <= open[0]) running.pauses.remove(open);
        else open[1] = now;
    }

    void stop(long now) {
        // Die Arbeit zählt für einen weiteren Start am selben Tag mit
        Project p = project(running.projectId);
        if (p != null && now >= dayStart && now < dayEnd) p.today.addAll(sessionWork(now));
        running = null;
    }

    // --- Rechnen (wie daySummary und placeAutoBreaks in src/lib/calc.ts) ---

    /** Arbeitsintervalle der laufenden Buchung bis `end` (ohne Pausen; eine offene Pause dauert bis `end`). */
    private List<long[]> sessionWork(long end) {
        List<long[]> pauses = new ArrayList<>();
        for (long[] p : running.pauses) {
            long a = Math.max(p[0], running.start);
            long b = Math.min(p[1] == 0 ? end : p[1], end);
            if (b > a) pauses.add(new long[] { a, b });
        }
        pauses.sort((x, y) -> Long.compare(x[0], y[0]));
        List<long[]> out = new ArrayList<>();
        long cursor = running.start;
        for (long[] p : pauses) {
            if (p[0] > cursor) out.add(new long[] { cursor, p[0] });
            cursor = Math.max(cursor, p[1]);
        }
        if (end > cursor) out.add(new long[] { cursor, end });
        return out;
    }

    static List<long[]> merge(List<long[]> list) {
        List<long[]> sorted = new ArrayList<>();
        for (long[] iv : list) if (iv[1] > iv[0]) sorted.add(new long[] { iv[0], iv[1] });
        sorted.sort((x, y) -> Long.compare(x[0], y[0]));
        List<long[]> out = new ArrayList<>();
        for (long[] iv : sorted) {
            long[] last = out.isEmpty() ? null : out.get(out.size() - 1);
            if (last != null && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
            else out.add(iv);
        }
        return out;
    }

    private static long sum(List<long[]> list) {
        long n = 0;
        for (long[] iv : list) n += iv[1] - iv[0];
        return n;
    }

    private static List<long[]> subtract(List<long[]> list, long ws, long we) {
        List<long[]> out = new ArrayList<>();
        for (long[] iv : list) {
            if (iv[1] <= ws || iv[0] >= we) {
                out.add(iv);
                continue;
            }
            if (iv[0] < ws) out.add(new long[] { iv[0], ws });
            if (iv[1] > we) out.add(new long[] { we, iv[1] });
        }
        return out;
    }

    /** Zeitpunkt, an dem `minutes` Arbeitszeit erreicht sind – nur wenn danach noch gearbeitet wird (sonst -1). */
    private static long timeAtWorked(List<long[]> list, int minutes) {
        long left = minutes * MINUTE;
        for (long[] iv : list) {
            if (iv[1] - iv[0] > left) return iv[0] + left;
            left -= iv[1] - iv[0];
        }
        return -1;
    }

    /**
     * Gesetzliche Pausen einplanen: nach 6 h `firstMinutes`, nach 9 h der Rest bis 45 min; vorher genommene Pausen
     * und Lücken zählen mit. Gibt die Arbeit ohne die Pausen zurück und legt die Pausen in `breaks` ab.
     */
    static List<long[]> placeBreaks(List<long[]> merged, int firstMinutes, List<long[]> breaks) {
        List<long[]> intervals = merged;
        if (intervals.isEmpty()) return intervals;
        long first = intervals.get(0)[0];
        int[][] rules = { { 360, firstMinutes }, { 540, Math.max(45, firstMinutes) } };
        for (int[] rule : rules) {
            long at = timeAtWorked(intervals, rule[0]);
            if (at < 0) continue;
            double taken = (at - first) / (double) MINUTE - rule[0];
            long needed = Math.round(rule[1] - taken);
            if (needed <= 0) continue;
            long end = at + needed * MINUTE;
            long before = sum(intervals);
            intervals = subtract(intervals, at, end);
            if (before > sum(intervals)) breaks.add(new long[] { at, end });
        }
        return intervals;
    }

    /** Netto-Arbeitszeit der laufenden Buchung bis `t` und die gesetzlichen Pausen des Tages. */
    private long calc(long t, List<long[]> breaks) {
        if (running == null) return 0;
        // Ohne offene Pause so gerechnet, als liefe die Zeit weiter (die Pausen hängen nur von der Arbeit davor ab)
        long until = paused() ? Math.max(t, running.start) : Math.max(t, running.start) + AHEAD;
        List<long[]> work = new ArrayList<>(running.dayWork);
        work.addAll(sessionWork(until));
        List<long[]> intervals = merge(work);
        Project p = project(running.projectId);
        if (p != null && p.autoBreak > 0) intervals = placeBreaks(intervals, p.autoBreak, breaks);
        long net = 0;
        for (long[] iv : intervals) {
            long a = Math.max(iv[0], running.start);
            long b = Math.min(iv[1], t);
            if (b > a) net += b - a;
        }
        return net;
    }

    /** Netto-Arbeitszeit der laufenden Buchung bis `t` (ms) – ohne Pausen und automatische Pausen. */
    long netMs(long t) {
        return calc(t, new ArrayList<>());
    }

    /** Liegt `t` in einer automatischen Pause? */
    boolean inAutoBreak(long t) {
        List<long[]> breaks = new ArrayList<>();
        calc(t, breaks);
        for (long[] b : breaks) if (t >= b[0] && t < b[1]) return true;
        return false;
    }

    /** Nächster Zeitpunkt nach `t`, an dem eine automatische Pause beginnt oder endet (0 = keiner). */
    long nextAutoBreakChange(long t) {
        List<long[]> breaks = new ArrayList<>();
        calc(t, breaks);
        long next = 0;
        for (long[] b : breaks) {
            for (long x : b) if (x > t && (next == 0 || x < next)) next = x;
        }
        return next;
    }

    static String fmtTime(long ts) {
        return new SimpleDateFormat("HH:mm", Locale.GERMANY).format(new Date(ts));
    }

    private static List<long[]> parseSpans(JSONArray a) throws JSONException {
        List<long[]> out = new ArrayList<>();
        if (a == null) return out;
        for (int i = 0; i < a.length(); i++) {
            JSONArray b = a.getJSONArray(i);
            out.add(new long[] { b.getLong(0), b.isNull(1) ? 0 : b.getLong(1) });
        }
        return out;
    }

    private static JSONArray spansToJson(List<long[]> list, boolean open) throws JSONException {
        JSONArray a = new JSONArray();
        for (long[] b : list) a.put(new JSONArray().put(b[0]).put(open && b[1] == 0 ? JSONObject.NULL : b[1]));
        return a;
    }

    private static WidgetState parse(JSONObject o) throws JSONException {
        WidgetState s = new WidgetState();
        s.notify = o.optBoolean("notify", true);
        s.clock = o.optBoolean("clock", false);
        s.forgotHours = o.optInt("forgotHours", 0);
        s.selected = o.isNull("selected") ? null : o.optString("selected", null);
        s.dayStart = o.optLong("dayStart", 0);
        s.dayEnd = o.optLong("dayEnd", 0);
        JSONArray list = o.getJSONArray("projects");
        for (int i = 0; i < list.length(); i++) {
            JSONObject j = list.getJSONObject(i);
            Project p = new Project();
            p.id = j.getString("id");
            p.name = j.optString("name", "");
            p.color = j.optString("color", "#2563eb");
            p.autoBreak = j.optInt("autoBreak", 0);
            p.today = parseSpans(j.optJSONArray("today"));
            s.projects.add(p);
        }
        JSONObject r = o.optJSONObject("running");
        if (r != null) {
            Running run = new Running();
            run.projectId = r.getString("projectId");
            run.start = r.getLong("start");
            JSONArray pauses = r.optJSONArray("pauses");
            if (pauses != null) {
                run.pauses = parseSpans(pauses);
            } else {
                // Auszug einer älteren Version (bis die App nach dem Update einmal geöffnet wurde)
                long closed = r.optLong("closedPauseMs", 0);
                if (closed > 0) run.pauses.add(new long[] { run.start, run.start + closed });
                long open = r.isNull("pauseStart") ? 0 : r.optLong("pauseStart", 0);
                if (open > 0) run.pauses.add(new long[] { open, 0 });
            }
            run.dayWork = parseSpans(r.optJSONArray("dayWork"));
            s.running = run;
        }
        return s;
    }

    private JSONObject toJson() throws JSONException {
        JSONObject o = new JSONObject()
            .put("notify", notify)
            .put("clock", clock)
            .put("forgotHours", forgotHours)
            .put("selected", selected == null ? JSONObject.NULL : selected)
            .put("dayStart", dayStart)
            .put("dayEnd", dayEnd);
        JSONArray list = new JSONArray();
        for (Project p : projects) {
            list.put(new JSONObject()
                .put("id", p.id)
                .put("name", p.name)
                .put("color", p.color)
                .put("autoBreak", p.autoBreak)
                .put("today", spansToJson(p.today, false)));
        }
        o.put("projects", list);
        if (running != null) {
            o.put("running", new JSONObject()
                .put("projectId", running.projectId)
                .put("start", running.start)
                .put("pauses", spansToJson(running.pauses, true))
                .put("dayWork", spansToJson(running.dayWork, false)));
        } else {
            o.put("running", JSONObject.NULL);
        }
        return o;
    }
}
