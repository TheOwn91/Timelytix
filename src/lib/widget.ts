import { registerPlugin } from '@capacitor/core';
import { DEFAULT_AUTO_BREAK_MINUTES, buildIndex, workIntervals } from './calc';
import { NATIVE } from './native';
import { sessionDay } from './shift';
import { notifyEnabled } from './status';
import { addDays, combine, dateKey, uid } from './time';
import type { AppState } from './types';

/**
 * Widget für den Startbildschirm und Knöpfe in der Benachrichtigung „Zeit läuft“ (nur Android-App).
 * Die App legt einen Auszug ab (Arbeitgeber, laufende Zeit). Widget und Benachrichtigung
 * zeigen Änderungen sofort selbst an und merken sich jede Aktion mit Uhrzeit
 * (android/…/WidgetActions.java); die App übernimmt sie hier in ihre Daten.
 */

export type WidgetActionType = 'start' | 'pause' | 'resume' | 'stop' | 'select';

export interface WidgetAction {
  type: WidgetActionType;
  at: number;
  projectId?: string;
  /** Laufende Nummer in Android – bis zu ihr bestätigt die App die übernommenen Aktionen. */
  seq?: number;
}

type Span = [number, number];

export interface WidgetSnapshot {
  notify: boolean;
  /** Uhrzeit im Widget: groß, solange keine Zeit läuft, sonst klein über der Arbeitszeit. */
  clock: boolean;
  selected: string | null;
  /**
   * `autoBreak`: Länge der gesetzlichen Pause nach 6 h (0 = aus). `today`: übrige Arbeit des heutigen Tages
   * (ohne Pausen) zwischen `dayStart` und `dayEnd` – startet das Widget die Zeit, zählt sie für die Pause mit.
   */
  projects: { id: string; name: string; color: string; autoBreak: number; today: Span[] }[];
  dayStart: number;
  dayEnd: number;
  /**
   * Laufende Zeit mit allen Pausen (`null` = offen) und der übrigen Arbeit desselben Tages. Die gesetzlichen
   * Pausen rechnet das Widget daraus selbst (WidgetState.java, wie `placeAutoBreaks` in calc.ts) – so stimmen
   * sie auch nach Pause/Weiter im Widget.
   */
  running: {
    projectId: string;
    start: number;
    pauses: [number, number | null][];
    dayWork: Span[];
  } | null;
}

/** Android kennt nur #RRGGBB (bzw. #AARRGGBB); CSS-Farben wie #abc umwandeln. */
export function androidColor(color: string): string {
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${[...color.slice(1)].map((c) => c + c).join('')}`;
  if (/^#[0-9a-f]{8}$/i.test(color)) return `#${color.slice(7)}${color.slice(1, 7)}`;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#2563eb';
}

/** Arbeit (ohne Pausen) der beendeten Buchungen eines Tages. */
function dayWork(state: AppState, projectId: string, day: string, now: number): Span[] {
  const sessions = buildIndex(state, projectId).sessionsByDay.get(day) ?? [];
  return sessions.filter((s) => s.end !== undefined).flatMap((s) => workIntervals(s, now));
}

export function widgetSnapshot(state: AppState, now: number, notify = true): WidgetSnapshot {
  const run = state.sessions.find((s) => s.end === undefined);
  // Archivierte fehlen – außer die Zeit läuft gerade für einen archivierten Arbeitgeber
  const projects = state.projects.filter((p) => !p.archived || p.id === run?.projectId);
  const selected =
    run?.projectId ?? projects.find((p) => p.id === state.selectedProjectId)?.id ?? projects[0]?.id ?? null;
  const today = dateKey(now);
  const dayStart = combine(today, '00:00');
  let running: WidgetSnapshot['running'] = null;
  if (run) {
    const project = state.projects.find((p) => p.id === run.projectId);
    running = {
      projectId: run.projectId,
      start: run.start,
      pauses: run.pauses.map((p) => [p.start, p.end ?? null]),
      dayWork: project ? dayWork(state, project.id, sessionDay(project, run, now), now) : [],
    };
  }
  return {
    notify,
    clock: !state.settings?.hideWidgetClock,
    selected,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      color: androidColor(p.color),
      autoBreak: p.autoBreak ? (p.autoBreakMinutes ?? DEFAULT_AUTO_BREAK_MINUTES) : 0,
      today: dayWork(state, p.id, today, now),
    })),
    dayStart,
    dayEnd: combine(addDays(today, 1), '00:00'),
    running,
  };
}

const TYPES = new Set<WidgetActionType>(['start', 'pause', 'resume', 'stop', 'select']);

/** Gemerkte Aktionen prüfen (sie kommen aus dem Android-Speicher, in der Reihenfolge der Tipps). */
export function parseWidgetActions(raw: string): WidgetAction[] {
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(
      (a): a is WidgetAction =>
        !!a &&
        typeof a === 'object' &&
        TYPES.has((a as WidgetAction).type) &&
        typeof (a as WidgetAction).at === 'number' &&
        Number.isFinite((a as WidgetAction).at) &&
        ((a as WidgetAction).projectId === undefined || typeof (a as WidgetAction).projectId === 'string') &&
        ((a as WidgetAction).seq === undefined || typeof (a as WidgetAction).seq === 'number'),
    );
  } catch {
    return [];
  }
}

/**
 * Aktionen in den Zustand übernehmen (ändert `draft`, nur innerhalb von `update()` aufrufen). Es zählt die
 * Uhrzeit der Aktion; was nicht (mehr) passt – z. B. Pause ohne laufende Zeit –, wird übersprungen. Doppelt
 * übernommen ändert nichts: Android löscht die Aktionen erst, wenn die App sie gespeichert hat.
 */
export function applyWidgetActions(draft: AppState, actions: WidgetAction[]) {
  for (const a of actions) {
    const run = draft.sessions.find((s) => s.end === undefined);
    const open = run?.pauses.find((p) => p.end === undefined);
    switch (a.type) {
      case 'select':
        if (!run && draft.projects.some((p) => p.id === a.projectId)) draft.selectedProjectId = a.projectId;
        break;
      case 'start': {
        // Auch für einen archivierten Arbeitgeber – das Widget bietet ihn nur an, wenn seine Zeit zuletzt lief
        const project = draft.projects.find((p) => p.id === a.projectId);
        if (run || !project || draft.sessions.some((s) => s.projectId === project.id && s.start === a.at)) break;
        draft.sessions.push({ id: uid(), projectId: project.id, start: a.at, pauses: [] });
        draft.selectedProjectId = project.id;
        break;
      }
      case 'pause':
        if (run && !open && a.at >= run.start && !run.pauses.some((p) => p.start === a.at)) run.pauses.push({ start: a.at });
        break;
      case 'resume':
        if (!run || !open) break;
        // Weiter vor Beginn der Pause (Uhr verstellt): Pause fällt weg
        if (a.at <= open.start) run.pauses = run.pauses.filter((p) => p !== open);
        else open.end = a.at;
        break;
      case 'stop':
        // Ein Beenden vor dem Beginn gehört zu einer früheren Zeit
        if (!run || a.at < run.start) break;
        run.pauses = run.pauses.filter((p) => p.start < a.at);
        for (const p of run.pauses) if (p.end === undefined || p.end > a.at) p.end = a.at;
        run.end = a.at;
        break;
    }
  }
}

interface WidgetPlugin {
  sync(o: { snapshot: string }): Promise<{ changed: boolean }>;
  actions(): Promise<{ actions: string }>;
  ack(o: { upTo: number }): Promise<void>;
  addListener(event: 'actions', fn: () => void): Promise<{ remove: () => Promise<void> }>;
}

const Widget = NATIVE ? registerPlugin<WidgetPlugin>('TimelytixWidget') : undefined;

/**
 * Auszug fürs Widget ablegen (Android-App). Android zeichnet das Widget nur bei Änderungen neu; warten noch
 * Aktionen, lehnt es ab – die kommen zuerst.
 */
export async function syncWidget(state: AppState) {
  if (!Widget) return;
  await Widget.sync({ snapshot: JSON.stringify(widgetSnapshot(state, Date.now(), notifyEnabled())) }).catch(() => undefined);
}

/** Gemerkte Aktionen lesen (sie bleiben in Android, bis die App sie mit `ackWidgetActions` bestätigt). */
export async function readWidgetActions(): Promise<WidgetAction[]> {
  if (!Widget) return [];
  const res = await Widget.actions().catch(() => ({ actions: '[]' }));
  return parseWidgetActions(res.actions);
}

/** Übernommene und gespeicherte Aktionen in Android löschen (alle bis einschließlich Nummer `upTo`). */
export async function ackWidgetActions(upTo: number) {
  await Widget?.ack({ upTo }).catch(() => undefined);
}

/** Aktion aus Widget oder Benachrichtigung, während die App geöffnet ist. */
export function onWidgetActions(fn: () => void): () => void {
  if (!Widget) return () => undefined;
  const handle = Widget.addListener('actions', fn).catch(() => undefined);
  return () => void handle.then((h) => h?.remove());
}
