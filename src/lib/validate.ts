import { ABSENCE_TYPES } from './absences';
import { dateKey } from './time';
import type { Absence, AppState, Pause, Project, Session, SurchargeRule, Terms, Weekday } from './types';

/**
 * Prüft gespeicherte Daten und Datensicherungen. Einträge, mit denen die App nicht rechnen kann
 * (fehlende Felder, Text statt Zahl …), werden weggelassen oder auf Standardwerte gesetzt – sonst
 * könnte eine beschädigte Datei die App beim Start abstürzen lassen.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const optNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const isDateKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isHM = (v: unknown): v is string => typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v);
/** Nur Farben wie #2563eb – der Wert landet im CSS. */
const color = (v: unknown): string => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : '#2563eb');

function weekdays(v: unknown): Weekday[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((d): d is Weekday => Number.isInteger(d) && d >= 0 && d <= 6))];
}

function surcharge(v: unknown): SurchargeRule | undefined {
  if (!isObj(v) || typeof v.id !== 'string') return undefined;
  const kind = v.kind === 'time' || v.kind === 'weekday' || v.kind === 'holiday' ? v.kind : undefined;
  if (!kind) return undefined;
  return {
    ...v,
    id: v.id,
    name: str(v.name),
    kind,
    from: isHM(v.from) ? v.from : undefined,
    to: isHM(v.to) ? v.to : undefined,
    weekdays: v.weekdays === undefined ? undefined : weekdays(v.weekdays),
    percent: num(v.percent, 0),
    enabled: v.enabled !== false,
  } as SurchargeRule;
}

function terms(v: unknown): Terms | undefined {
  if (!isObj(v) || typeof v.from !== 'string') return undefined;
  const percents: Record<string, number> = {};
  if (isObj(v.surchargePercents))
    for (const [k, p] of Object.entries(v.surchargePercents)) if (typeof p === 'number' && Number.isFinite(p)) percents[k] = p;
  return {
    from: v.from,
    hourlyRate: num(v.hourlyRate, 0),
    dailyTargetHours: num(v.dailyTargetHours, 8),
    workdays: weekdays(v.workdays),
    overtimeSurchargePercent: num(v.overtimeSurchargePercent, 0),
    surchargePercents: percents,
  };
}

function project(v: unknown): Project | undefined {
  if (!isObj(v) || typeof v.id !== 'string') return undefined;
  const list = <T,>(x: unknown, fn: (e: unknown) => T | undefined): T[] =>
    Array.isArray(x) ? x.map(fn).filter((e): e is T => e !== undefined) : [];
  return {
    ...v,
    id: v.id,
    name: str(v.name, 'Arbeitgeber'),
    color: color(v.color),
    hourlyRate: num(v.hourlyRate, 0),
    dailyTargetHours: num(v.dailyTargetHours, 8),
    workdays: Array.isArray(v.workdays) ? weekdays(v.workdays) : [1, 2, 3, 4, 5],
    autoBreak: v.autoBreak !== false,
    autoBreakMinutes: optNum(v.autoBreakMinutes),
    state: str(v.state),
    surcharges: list(v.surcharges, surcharge),
    surchargeMode: v.surchargeMode === 'stack' ? 'stack' : v.surchargeMode === 'max' ? 'max' : undefined,
    startDate: isDateKey(v.startDate) ? v.startDate : dateKey(new Date()),
    vacationDaysPerYear: optNum(v.vacationDaysPerYear),
    vacationAtStart: optNum(v.vacationAtStart),
    overtimeAtStartHours: optNum(v.overtimeAtStartHours),
    overtimeSurchargePercent: optNum(v.overtimeSurchargePercent),
    terms: v.terms === undefined ? undefined : list(v.terms, terms),
  } as Project;
}

function pause(v: unknown): Pause | undefined {
  if (!isObj(v) || optNum(v.start) === undefined) return undefined;
  return { ...v, start: v.start as number, end: optNum(v.end), auto: v.auto === true ? true : undefined } as Pause;
}

function session(v: unknown): Session | undefined {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.projectId !== 'string') return undefined;
  const start = optNum(v.start);
  if (start === undefined) return undefined;
  const end = optNum(v.end);
  return {
    ...v,
    id: v.id,
    projectId: v.projectId,
    start,
    // Ende vor dem Beginn: 0 Minuten statt negativer Zeit (nicht „läuft noch“)
    end: end === undefined ? undefined : Math.max(start, end),
    pauses: Array.isArray(v.pauses) ? v.pauses.map(pause).filter((p): p is Pause => !!p) : [],
    note: typeof v.note === 'string' ? v.note : undefined,
  } as Session;
}

function absence(v: unknown): Absence | undefined {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.projectId !== 'string' || !isDateKey(v.date)) return undefined;
  if (typeof v.type !== 'string' || !Object.prototype.hasOwnProperty.call(ABSENCE_TYPES, v.type)) return undefined;
  return { ...v, note: typeof v.note === 'string' ? v.note : undefined } as Absence;
}

export function validateState(data: unknown): AppState {
  if (!isObj(data) || !Array.isArray(data.projects) || !Array.isArray(data.sessions)) {
    throw new Error('Ungültige Datei');
  }
  const keep = <T,>(x: unknown, fn: (e: unknown) => T | undefined): T[] =>
    Array.isArray(x) ? x.map(fn).filter((e): e is T => e !== undefined) : [];
  return {
    version: 1,
    projects: keep(data.projects, project),
    sessions: keep(data.sessions, session),
    absences: keep(data.absences, absence),
    selectedProjectId: typeof data.selectedProjectId === 'string' ? data.selectedProjectId : undefined,
    settings: isObj(data.settings) ? { decimalHours: data.settings.decimalHours === true } : undefined,
  };
}
