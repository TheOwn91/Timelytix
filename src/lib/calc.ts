import { ABSENCE_TYPES } from './absences';
import { holidayName } from './holidays';
import { sessionDay } from './shift';
import { projectAt } from './terms';
import { MINUTE, dateKey, daysOfMonth, parseHM, pad } from './time';
import { accountBeforeMonth } from './year';
import type { Absence, AbsenceType, AppState, DateKey, Project, Session, SurchargeMode, SurchargeRule } from './types';

export type Interval = [number, number];

/** Arbeitsintervalle einer Buchung (ohne Pausen). Laufende Buchungen enden bei `now`. */
export function workIntervals(s: Session, now: number): Interval[] {
  const end = s.end ?? now;
  const pauses = s.pauses
    .map((p): Interval => [Math.max(p.start, s.start), Math.min(p.end ?? now, end)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const result: Interval[] = [];
  let cursor = s.start;
  for (const [a, b] of pauses) {
    if (a > cursor) result.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (end > cursor) result.push([cursor, end]);
  return result;
}

const sumMinutes = (intervals: Interval[]) =>
  intervals.reduce((acc, [a, b]) => acc + (b - a), 0) / MINUTE;

export function sessionStats(s: Session, now: number) {
  const gross = ((s.end ?? now) - s.start) / MINUTE;
  const net = sumMinutes(workIntervals(s, now));
  return { gross, net, pause: gross - net };
}

/** Standardlänge der automatischen Pause nach 6 h Arbeit (Minuten). */
export const DEFAULT_AUTO_BREAK_MINUTES = 30;

/** Automatische Pause als Zeitfenster; `end` ist das geplante Ende (kann bei laufender Zeit in der Zukunft liegen). */
export interface AutoBreak {
  start: number;
  end: number;
  /** Tatsächlich abgezogene Minuten (endet die Arbeit früher, entsprechend weniger). */
  minutes: number;
}

function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out: Interval[] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function subtractWindow(list: Interval[], [ws, we]: Interval): Interval[] {
  return list.flatMap(([a, b]): Interval[] => {
    if (b <= ws || a >= we) return [[a, b]];
    const parts: Interval[] = [];
    if (a < ws) parts.push([a, ws]);
    if (b > we) parts.push([we, b]);
    return parts;
  });
}

/** Zeitpunkt, an dem `minutes` Arbeitszeit erreicht sind – nur wenn danach noch gearbeitet wird. */
function timeAtWorked(list: Interval[], minutes: number): number | undefined {
  let left = minutes * MINUTE;
  for (const [a, b] of list) {
    if (b - a > left) return a + left;
    left -= b - a;
  }
  return undefined;
}

/**
 * Gesetzliche Mindestpause (§ 4 ArbZG) an der richtigen Stelle einplanen: Sind 6 h gearbeitet,
 * beginnt eine Pause von `firstMinutes` (Standard 30), danach läuft die Arbeitszeit weiter.
 * Sind 9 h gearbeitet und insgesamt noch keine 45 min Pause, folgt eine weitere Pause mit dem Rest.
 * Vorher genommene Pausen und Lücken zwischen Buchungen zählen mit.
 */
export function placeAutoBreaks(work: Interval[], firstMinutes = DEFAULT_AUTO_BREAK_MINUTES): { intervals: Interval[]; breaks: AutoBreak[] } {
  let intervals = mergeIntervals(work);
  const breaks: AutoBreak[] = [];
  if (!intervals.length) return { intervals, breaks };
  const dayStart = intervals[0][0];
  const rules = [
    { after: 360, total: firstMinutes },
    { after: 540, total: Math.max(45, firstMinutes) },
  ];
  for (const rule of rules) {
    const at = timeAtWorked(intervals, rule.after);
    if (at === undefined) continue;
    const taken = (at - dayStart) / MINUTE - rule.after;
    const needed = Math.round(rule.total - taken);
    if (needed <= 0) continue;
    const window: Interval = [at, at + needed * MINUTE];
    const before = intervals.reduce((n, [a, b]) => n + (b - a), 0);
    intervals = subtractWindow(intervals, window);
    const after = intervals.reduce((n, [a, b]) => n + (b - a), 0);
    breaks.push({ start: window[0], end: window[1], minutes: (before - after) / MINUTE });
  }
  return { intervals, breaks };
}

function ruleMatches(rule: SurchargeRule, ts: number, state: string): boolean {
  const d = new Date(ts);
  const weekday = d.getDay();
  switch (rule.kind) {
    case 'time': {
      if (!rule.from || !rule.to) return false;
      if (rule.weekdays?.length && !rule.weekdays.includes(weekday as never)) return false;
      const m = d.getHours() * 60 + d.getMinutes();
      const from = parseHM(rule.from);
      const to = parseHM(rule.to);
      return from <= to ? m >= from && m < to : m >= from || m < to;
    }
    case 'weekday':
      return !!rule.weekdays?.includes(weekday as never);
    case 'holiday':
      return !!holidayName(dateKey(d), state);
  }
}

/** Minuten je Zuschlagsregel für die gegebenen Arbeitsintervalle. */
/**
 * Minuten je Zulagen-Regel. `mode` 'max': gelten zur selben Zeit mehrere Zulagen, zählt nur die
 * mit dem höchsten Satz (bei Gleichstand die erste in der Liste); 'stack': alle zählen.
 */
export function surchargeMinutes(
  intervals: Interval[],
  rules: SurchargeRule[],
  state: string,
  mode: SurchargeMode = 'max',
): Record<string, number> {
  const active = rules.filter((r) => r.enabled);
  const result: Record<string, number> = {};
  for (const r of active) result[r.id] = 0;
  if (!active.length) return result;
  for (const [start, end] of intervals) {
    let cur = start;
    while (cur < end) {
      const next = Math.min(end, Math.floor(cur / MINUTE) * MINUTE + MINUTE);
      const dur = (next - cur) / MINUTE;
      const matching = active.filter((r) => ruleMatches(r, cur, state));
      if (mode === 'stack') {
        for (const r of matching) result[r.id] += dur;
      } else if (matching.length) {
        const best = matching.reduce((a, b) => (b.percent > a.percent ? b : a));
        result[best.id] += dur;
      }
      cur = next;
    }
  }
  return result;
}

/** Lücken zwischen zwei Buchungen bis zu dieser Länge (Minuten) zählen als Pause, längere als Unterbrechung. */
export const MAX_GAP_AS_PAUSE = 120;

export interface DaySummary {
  date: DateKey;
  isWorkday: boolean;
  holiday?: string;
  sessions: Session[];
  absence?: Absence;
  firstStart?: number;
  lastEnd?: number;
  running: boolean;
  /** Erfasste Pausen inkl. kurzer Lücken zwischen Buchungen (bis MAX_GAP_AS_PAUSE). */
  pause: number;
  /** Längere Lücken zwischen Buchungen (z. B. geteilter Dienst) – keine Pause. */
  interruption: number;
  /** Zusätzlich automatisch abgezogene Pause (Minuten). */
  autoBreak: number;
  /** Automatische Pausen als Zeitfenster (nach 6 h bzw. 9 h Arbeit). */
  autoBreaks: AutoBreak[];
  /** Netto-Arbeitszeit in Minuten. */
  worked: number;
  /** Gutgeschriebene Minuten (Urlaub, Krank …). */
  credit: number;
  /** Sollminuten. */
  target: number;
  /** Kurzarbeit: vom Stundenkonto genommene Minuten. */
  shortTimeFromAccount: number;
  /** Kurzarbeit: nicht vom Konto gedeckt → Soll entfällt (Minuten). */
  shortTimeUncovered: number;
  surcharges: Record<string, number>;
  /** Zulagen in € je Regel (mit den an diesem Tag gültigen Sätzen). */
  surchargeAmounts: Record<string, number>;
  /** An diesem Tag gültiger Stundenlohn. */
  rate: number;
  /** Lohn für Arbeitszeit + Gutschrift dieses Tages. */
  wage: number;
  /** Vergangener Arbeitstag ohne Buchung und ohne Abwesenheit. */
  untracked: boolean;
}

export interface Index {
  sessionsByDay: Map<string, Session[]>;
  absenceByDay: Map<string, Absence>;
}

export function buildIndex(state: AppState, projectId: string): Index {
  const sessionsByDay = new Map<string, Session[]>();
  const project = state.projects.find((p) => p.id === projectId);
  for (const s of state.sessions) {
    if (s.projectId !== projectId) continue;
    // Tag der Anzeige (bei „Schicht dem Folgetag zuordnen“ der Tag nach dem Anstempeln)
    const k = project ? sessionDay(project, s) : dateKey(s.start);
    const list = sessionsByDay.get(k) ?? [];
    list.push(s);
    sessionsByDay.set(k, list);
  }
  for (const list of sessionsByDay.values()) list.sort((a, b) => a.start - b.start);
  const absenceByDay = new Map<string, Absence>();
  for (const a of state.absences) if (a.projectId === projectId) absenceByDay.set(a.date, a);
  return { sessionsByDay, absenceByDay };
}

/**
 * `account`: Plusstunden, mit denen die Kurzarbeit dieses Tages verrechnet wird (Minuten, siehe
 * monthSummary) – sie nimmt höchstens so viel vom Konto, wie es an Plusstunden hat.
 */
export function daySummary(base: Project, date: DateKey, index: Index, now: number, account = 0): DaySummary {
  // Stundenlohn, Soll, Arbeitstage und Zuschläge so, wie sie an diesem Tag galten
  const project = projectAt(base, date);
  const today = dateKey(now);
  const sessions = index.sessionsByDay.get(date) ?? [];
  const absence = index.absenceByDay.get(date);
  const holiday = holidayName(date, project.state);
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const isWorkday = project.workdays.includes(weekday as never);

  let intervals: Interval[] = [];
  for (const s of sessions) intervals.push(...workIntervals(s, now));
  const firstStart = sessions[0]?.start;
  const lastEnd = sessions.length
    ? Math.max(...sessions.map((s) => s.end ?? now))
    : undefined;
  const running = sessions.some((s) => s.end === undefined);
  // Pausen = erfasste Pausen + Lücken zwischen den Buchungen; lange Lücken sind Unterbrechungen
  let recordedPause = 0;
  let shortGaps = 0;
  let interruption = 0;
  let cursor: number | undefined;
  for (const s of sessions) {
    const st = sessionStats(s, now);
    recordedPause += st.pause;
    if (cursor !== undefined && s.start > cursor) {
      const gap = (s.start - cursor) / MINUTE;
      if (gap <= MAX_GAP_AS_PAUSE) shortGaps += gap;
      else interruption += gap;
    }
    cursor = Math.max(cursor ?? s.start, s.end ?? now);
  }
  const pause = recordedPause + shortGaps;
  // Gesetzliche Mindestpause nach 6 h an der richtigen Stelle (auch während die Zeit läuft).
  // Jede Unterbrechung zählt dabei als Ruhepause (§ 4 ArbZG), auch lange.
  let autoBreaks: AutoBreak[] = [];
  // Nur für Tage, deren automatische Pausen noch nicht als echte Pausen eingetragen sind (z. B. laufende Zeit)
  if (project.autoBreak && sessions.some((s) => !s.autoBreaksApplied)) {
    const placed = placeAutoBreaks(intervals, project.autoBreakMinutes ?? DEFAULT_AUTO_BREAK_MINUTES);
    intervals = placed.intervals;
    autoBreaks = placed.breaks.filter((b) => b.minutes > 0);
  }
  const autoBreak = autoBreaks.reduce((n, b) => n + b.minutes, 0);
  const worked = sumMinutes(intervals);

  let target = isWorkday && !holiday ? project.dailyTargetHours * 60 : 0;
  let credit = 0;
  if (absence) {
    const mode = ABSENCE_TYPES[absence.type].mode;
    if (mode === 'credit') credit = target;
    if (mode === 'noTarget') target = 0;
  }
  // Vor Erfassungsbeginn und in der Zukunft noch kein Soll ansetzen
  // Heute zählt erst, sobald etwas erfasst ist – sonst stünde morgens schon ein Minus da
  const pendingToday = date === today && sessions.length === 0 && !absence;
  if (date > today || pendingToday || (date < project.startDate && !absence)) {
    target = 0;
    credit = 0;
  }

  const untracked =
    isWorkday &&
    !holiday &&
    date < today &&
    date >= project.startDate &&
    sessions.length === 0 &&
    !absence;

  const surcharges = surchargeMinutes(intervals, project.surcharges, project.state, project.surchargeMode ?? 'max');
  const surchargeAmounts: Record<string, number> = {};
  for (const r of project.surcharges)
    if (r.id in surcharges) surchargeAmounts[r.id] = (surcharges[r.id] / 60) * project.hourlyRate * (r.percent / 100);
  const workedFinal = Math.max(0, worked);

  // Kurzarbeit: fehlende Stunden vom Konto nehmen, soweit Plusstunden da sind; den Rest nicht als Soll zählen
  let shortTimeFromAccount = 0;
  let shortTimeUncovered = 0;
  if (absence && ABSENCE_TYPES[absence.type].mode === 'debitCapped' && target > 0) {
    const missing = Math.max(0, target - workedFinal);
    shortTimeFromAccount = Math.min(missing, Math.max(0, account));
    shortTimeUncovered = missing - shortTimeFromAccount;
    target -= shortTimeUncovered;
  }

  return {
    date,
    isWorkday,
    holiday,
    sessions,
    absence,
    firstStart,
    lastEnd,
    running,
    pause: Math.max(0, pause) + autoBreak,
    interruption,
    autoBreak,
    autoBreaks,
    worked: workedFinal,
    credit,
    target,
    shortTimeFromAccount,
    shortTimeUncovered,
    surcharges,
    surchargeAmounts,
    rate: project.hourlyRate,
    wage: ((workedFinal + credit) / 60) * project.hourlyRate,
    untracked,
  };
}

export interface MonthSummary {
  days: DaySummary[];
  worked: number;
  credit: number;
  target: number;
  balance: number;
  /**
   * Überstunden, auf die es Zuschlag gibt (Minuten). Mit Kurzarbeit nur, was nach dem Verrechnen am
   * Monatsende noch auf dem Konto steht – steht es bei 0, gibt es keinen Zuschlag.
   */
  surchargeBase: number;
  /** Kurzarbeit: vom Stundenkonto genommen / ohne Soll, weil das Konto leer war (Minuten). */
  shortTime: { fromAccount: number; uncovered: number };
  workedDays: number;
  absenceCounts: Partial<Record<AbsenceType, number>>;
  /** `rule.percent` = Satz zum Monatsende (bei Änderung im Monat wird tageweise gerechnet). */
  surcharges: { rule: SurchargeRule; minutes: number; amount: number }[];
  surchargeTotal: number;
  baseWage: number;
  /** In diesem Monat ist (zumindest zeitweise) ein Stundenlohn hinterlegt. */
  hasRate: boolean;
  /** Arbeitgeber mit den zum Monatsende gültigen Werten. */
  endTerms: Project;
}

export function monthSummary(
  state: AppState,
  project: Project,
  year: number,
  month0: number,
  now: number,
  /** Stundenkonto zu Monatsbeginn (Minuten); ohne Angabe wird es bei Kurzarbeit im Monat berechnet. */
  accountAtStart?: number,
): MonthSummary {
  const index = buildIndex(state, project.id);
  const ym = `${year}-${pad(month0 + 1)}`;
  const hasShortTime = state.absences.some(
    (a) => a.projectId === project.id && a.date.startsWith(ym) && ABSENCE_TYPES[a.type].mode === 'debitCapped',
  );
  // Kontostand Tag für Tag mitführen, damit Kurzarbeit nie ins Minus führt
  let account = accountAtStart ?? (hasShortTime ? accountBeforeMonth(state, project, year, month0, now) : 0);
  const dates = daysOfMonth(year, month0);
  const days: DaySummary[] = [];
  // Kurzarbeitstage, deren Stunden noch nicht mit Überstunden verrechnet sind
  const open: number[] = [];
  dates.forEach((d, i) => {
    const day = daySummary(project, d, index, now, account);
    days.push(day);
    account += day.worked + day.credit - day.target;
    if (day.shortTimeUncovered > 0) open.push(i);
    // Später im Monat entstandene Überstunden werden mit der Kurzarbeit davor verrechnet
    while (account > 0 && open.length) {
      const j = open[0];
      const prev = days[j];
      const take = Math.min(account, prev.shortTimeUncovered);
      days[j] = daySummary(project, dates[j], index, now, prev.shortTimeFromAccount + take);
      account -= take;
      if (days[j].shortTimeUncovered <= 0) open.shift();
    }
  });
  const worked = days.reduce((a, d) => a + d.worked, 0);
  const credit = days.reduce((a, d) => a + d.credit, 0);
  const target = days.reduce((a, d) => a + d.target, 0);
  const absenceCounts: Partial<Record<AbsenceType, number>> = {};
  for (const d of days)
    if (d.absence) absenceCounts[d.absence.type] = (absenceCounts[d.absence.type] ?? 0) + 1;
  const endTerms = projectAt(project, days[days.length - 1].date);
  const surcharges = endTerms.surcharges
    .filter((r) => r.enabled)
    .map((rule) => ({
      rule,
      minutes: days.reduce((a, d) => a + (d.surcharges[rule.id] ?? 0), 0),
      amount: days.reduce((a, d) => a + (d.surchargeAmounts[rule.id] ?? 0), 0),
    }));
  return {
    days,
    worked,
    credit,
    target,
    balance: worked + credit - target,
    surchargeBase: days.some((d) => d.shortTimeFromAccount + d.shortTimeUncovered > 0)
      ? Math.min(worked + credit - target, Math.max(0, account))
      : worked + credit - target,
    shortTime: {
      fromAccount: days.reduce((a, d) => a + d.shortTimeFromAccount, 0),
      uncovered: days.reduce((a, d) => a + d.shortTimeUncovered, 0),
    },
    workedDays: days.filter((d) => d.sessions.length > 0).length,
    absenceCounts,
    surcharges,
    surchargeTotal: surcharges.reduce((a, s) => a + s.amount, 0),
    baseWage: days.reduce((a, d) => a + d.wage, 0),
    hasRate: days.some((d) => d.rate > 0),
    endTerms,
  };
}

/** Vergangene Arbeitstage ohne Erfassung, neueste zuerst. */
export function untrackedDays(state: AppState, project: Project, now: number, maxDays = 90): DaySummary[] {
  const index = buildIndex(state, project.id);
  const result: DaySummary[] = [];
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  for (let i = 1; i <= maxDays; i++) {
    d.setDate(d.getDate() - 1);
    const key = dateKey(d);
    if (key < project.startDate) break;
    const s = daySummary(project, key, index, now);
    if (s.untracked) result.push(s);
  }
  return result;
}
