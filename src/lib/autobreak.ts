import { DEFAULT_AUTO_BREAK_MINUTES, placeAutoBreaks, workIntervals } from './calc';
import { sessionDay } from './shift';
import type { AppState, Session } from './types';

/**
 * Automatische Pausen als echte Pausen speichern: Für jeden Tag, dessen Buchungen alle beendet sind,
 * werden die fehlenden gesetzlichen Pausen (nach 6 h bzw. 9 h, siehe placeAutoBreaks) als Pausen mit
 * `auto: true` eingetragen – an der Buchung, in die sie fallen. Danach sind die Buchungen markiert
 * (`autoBreaksApplied`), damit eine gelöschte automatische Pause nicht wieder erscheint.
 * Ändert `state` direkt; `true`, wenn sich etwas geändert hat.
 */
export function materializeAutoBreaks(state: AppState): boolean {
  let changed = false;
  for (const project of state.projects) {
    if (!project.autoBreak) continue;
    const own = state.sessions.filter((s) => s.projectId === project.id);
    // Meist ist schon alles eingetragen – dann nur die wenigen offenen Tage betrachten
    const open = new Set(own.filter((s) => !s.autoBreaksApplied).map((s) => sessionDay(project, s)));
    if (!open.size) continue;
    const byDay = new Map<string, Session[]>();
    for (const s of own) {
      const day = sessionDay(project, s);
      if (!open.has(day)) continue;
      const list = byDay.get(day);
      if (list) list.push(s);
      else byDay.set(day, [s]);
    }
    for (const sessions of byDay.values()) {
      // Solange die Zeit läuft, rechnet die App die Pause nur mit (Timer); gespeichert wird beim Beenden
      if (sessions.some((s) => s.end === undefined)) continue;
      const intervals = sessions.flatMap((s) => workIntervals(s, 0));
      const { breaks } = placeAutoBreaks(intervals, project.autoBreakMinutes ?? DEFAULT_AUTO_BREAK_MINUTES);
      for (const b of breaks) {
        for (const s of sessions) {
          const start = Math.max(b.start, s.start);
          const end = Math.min(b.end, s.end!);
          if (end > start) {
            s.pauses.push({ start, end, auto: true });
            s.pauses.sort((x, y) => x.start - y.start);
          }
        }
      }
      for (const s of sessions) s.autoBreaksApplied = true;
      changed = true;
    }
  }
  return changed;
}
