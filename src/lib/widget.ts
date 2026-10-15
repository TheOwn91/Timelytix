import { registerPlugin } from '@capacitor/core';
import { buildIndex, daySummary, monthSummary } from './calc';
import { NATIVE } from './native';
import { sessionDay } from './shift';
import { notifyEnabled } from './status';
import { pad, uid } from './time';
import type { AppState } from './types';

/**
 * Widget für den Startbildschirm und Knöpfe in der Benachrichtigung „Zeit läuft“ (nur Android-App).
 * Die App legt einen Auszug ab (Arbeitgeber, laufende Zeit, Monatssaldo). Widget und Benachrichtigung
 * zeigen Änderungen sofort selbst an und merken sich jede Aktion mit Uhrzeit
 * (android/…/WidgetActions.java); die App übernimmt sie hier in ihre Daten.
 */

export type WidgetActionType = 'start' | 'pause' | 'resume' | 'stop' | 'select';

export interface WidgetAction {
  type: WidgetActionType;
  at: number;
  projectId?: string;
}

export interface WidgetSnapshot {
  /** Zeitpunkt des Auszugs; `balance` gilt bis hierhin. */
  at: number;
  /** Monat des Saldos (YYYY-MM) – in einem neuen Monat zeigt das Widget ihn erst nach dem Öffnen der App. */
  month: string;
  notify: boolean;
  decimal: boolean;
  selected: string | null;
  projects: { id: string; name: string; color: string; balance: number; autoBreak: number }[];
  running: {
    projectId: string;
    start: number;
    closedPauseMs: number;
    pauseStart: number | null;
    autoBreaks: [number, number][];
  } | null;
}

/** Android kennt nur #RRGGBB (bzw. #AARRGGBB); CSS-Farben wie #abc umwandeln. */
export function androidColor(color: string): string {
  if (/^#[0-9a-f]{3}$/i.test(color)) return `#${[...color.slice(1)].map((c) => c + c).join('')}`;
  if (/^#[0-9a-f]{8}$/i.test(color)) return `#${color.slice(7)}${color.slice(1, 7)}`;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#2563eb';
}

export function widgetSnapshot(state: AppState, now: number, notify = true): WidgetSnapshot {
  const run = state.sessions.find((s) => s.end === undefined);
  // Archivierte fehlen – außer die Zeit läuft gerade für einen archivierten Arbeitgeber
  const projects = state.projects.filter((p) => !p.archived || p.id === run?.projectId);
  const d = new Date(now);
  const selected =
    run?.projectId ?? projects.find((p) => p.id === state.selectedProjectId)?.id ?? projects[0]?.id ?? null;
  let running: WidgetSnapshot['running'] = null;
  if (run) {
    const project = state.projects.find((p) => p.id === run.projectId);
    const open = run.pauses.find((p) => p.end === undefined);
    const closedPauseMs = run.pauses.reduce(
      (n, p) => (p.end === undefined ? n : n + Math.max(0, Math.min(p.end, now) - Math.max(p.start, run.start))),
      0,
    );
    // Automatische Pausen des Tages als Zeitfenster (auch geplante, die noch kommen)
    const autoBreaks = project
      ? daySummary(project, sessionDay(project, run, now), buildIndex(state, project.id), now).autoBreaks.map(
          (b): [number, number] => [b.start, b.end],
        )
      : [];
    running = { projectId: run.projectId, start: run.start, closedPauseMs, pauseStart: open?.start ?? null, autoBreaks };
  }
  return {
    at: now,
    month: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
    notify,
    decimal: !!state.settings?.decimalHours,
    selected,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      color: androidColor(p.color),
      balance: monthSummary(state, p, d.getFullYear(), d.getMonth(), now).balance,
      autoBreak: p.autoBreak ? (p.autoBreakMinutes ?? 30) : 0,
    })),
    running,
  };
}

const TYPES = new Set<WidgetActionType>(['start', 'pause', 'resume', 'stop', 'select']);

/** Gemerkte Aktionen prüfen (sie kommen aus dem Android-Speicher). */
export function parseWidgetActions(raw: string): WidgetAction[] {
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (a): a is WidgetAction =>
          !!a &&
          typeof a === 'object' &&
          TYPES.has((a as WidgetAction).type) &&
          typeof (a as WidgetAction).at === 'number' &&
          Number.isFinite((a as WidgetAction).at) &&
          ((a as WidgetAction).projectId === undefined || typeof (a as WidgetAction).projectId === 'string'),
      )
      .sort((a, b) => a.at - b.at);
  } catch {
    return [];
  }
}

/**
 * Aktionen in den Zustand übernehmen (ändert `draft`, nur innerhalb von `update()` aufrufen). Es zählt die
 * Uhrzeit der Aktion; was nicht (mehr) passt – z. B. Pause ohne laufende Zeit –, wird übersprungen.
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
        const project = draft.projects.find((p) => p.id === a.projectId && !p.archived);
        if (run || !project) break;
        draft.sessions.push({ id: uid(), projectId: project.id, start: a.at, pauses: [] });
        draft.selectedProjectId = project.id;
        break;
      }
      case 'pause':
        if (run && !open && a.at >= run.start) run.pauses.push({ start: a.at });
        break;
      case 'resume':
        if (open) open.end = Math.max(open.start, a.at);
        break;
      case 'stop':
        if (!run) break;
        for (const p of run.pauses) if (p.end === undefined) p.end = Math.max(p.start, a.at);
        run.end = Math.max(run.start, a.at);
        break;
    }
  }
}

interface WidgetPlugin {
  sync(o: { snapshot: string }): Promise<{ saved: boolean }>;
  takeActions(): Promise<{ actions: string }>;
  addListener(event: 'actions', fn: () => void): Promise<{ remove: () => Promise<void> }>;
}

const Widget = NATIVE ? registerPlugin<WidgetPlugin>('TimelytixWidget') : undefined;

/** Auszug fürs Widget ablegen (Android-App). Warten noch Aktionen, lehnt Android ab – sie kommen zuerst. */
export async function syncWidget(state: AppState) {
  if (!Widget) return;
  await Widget.sync({ snapshot: JSON.stringify(widgetSnapshot(state, Date.now(), notifyEnabled())) }).catch(() => undefined);
}

/** Gemerkte Aktionen abholen (danach sind sie in Android gelöscht). */
export async function takeWidgetActions(): Promise<WidgetAction[]> {
  if (!Widget) return [];
  const res = await Widget.takeActions().catch(() => ({ actions: '[]' }));
  return parseWidgetActions(res.actions);
}

/** Aktion aus Widget oder Benachrichtigung, während die App geöffnet ist. */
export function onWidgetActions(fn: () => void): () => void {
  if (!Widget) return () => undefined;
  const handle = Widget.addListener('actions', fn);
  return () => void handle.then((h) => h.remove());
}
