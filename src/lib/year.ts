import { vacationDayValue } from './absences';
import { monthSummary, type MonthSummary } from './calc';
import { dateKey } from './time';
import type { AppState, Project } from './types';

export const DEFAULT_VACATION_DAYS = 30;

export function vacationPerYear(p: Project): number {
  return p.vacationDaysPerYear ?? DEFAULT_VACATION_DAYS;
}

export interface MonthAccount {
  month0: number;
  summary: MonthSummary;
  /** Über-/Minusstunden des Monats (Minuten). */
  balance: number;
  /** Zuschlag auf positive Überstunden (Minuten). */
  surcharge: number;
  /** Monat ist abgeschlossen → Zuschlag ist gutgeschrieben. */
  complete: boolean;
  /** Kontostand nach diesem Monat (Minuten), inkl. gutgeschriebener Zuschläge. */
  total: number;
  /** Monat liegt vollständig vor dem Erfassungsbeginn oder in der Zukunft. */
  inactive: boolean;
}

export interface YearOverview {
  year: number;
  /** Jahr liegt vor dem Erfassungsbeginn. */
  beforeStart: boolean;
  /** Jahr des Erfassungsbeginns (Anspruch = Resturlaub bei Beginn). */
  firstYear: boolean;
  vacation: {
    entitlement: number;
    carryIn: number;
    taken: number;
    planned: number;
    remaining: number;
  };
  overtime: {
    carryIn: number;
    months: MonthAccount[];
    balance: number;
    surcharge: number;
    /** Zuschlag des laufenden Monats, der erst am Monatsende gutgeschrieben wird. */
    pendingSurcharge: number;
    total: number;
  };
}

/** Zuschlag auf die positiven Überstunden eines Monats (Minuten). */
export function overtimeSurcharge(project: Project, balance: number): number {
  const pct = project.overtimeSurchargePercent ?? 0;
  return balance > 0 && pct > 0 ? (balance * pct) / 100 : 0;
}

function lastDayOfMonth(year: number, month0: number) {
  return dateKey(new Date(year, month0 + 1, 0));
}

function computeYear(state: AppState, project: Project, year: number, now: number, carryVacation: number, carryOvertime: number, firstYear: boolean): YearOverview {
  const today = dateKey(now);
  const startMonth = project.startDate.slice(0, 7);

  const months: MonthAccount[] = [];
  let total = carryOvertime;
  let balanceSum = 0;
  let surchargeSum = 0;
  let pending = 0;
  for (let m = 0; m < 12; m++) {
    const ym = `${year}-${String(m + 1).padStart(2, '0')}`;
    const inactive = ym < startMonth || `${ym}-01` > today;
    const summary = monthSummary(state, project, year, m, now, total);
    const balance = inactive ? 0 : summary.balance;
    const complete = lastDayOfMonth(year, m) < today;
    // Satz, der zum Monatsende gilt
    const surcharge = inactive ? 0 : overtimeSurcharge(summary.endTerms, summary.surchargeBase);
    total += balance + (complete ? surcharge : 0);
    balanceSum += balance;
    if (complete) surchargeSum += surcharge;
    else pending += surcharge;
    months.push({ month0: m, summary, balance, surcharge, complete, total, inactive });
  }

  let taken = 0;
  let planned = 0;
  for (const a of state.absences) {
    if (a.projectId !== project.id || a.type !== 'urlaub' || !a.date.startsWith(`${year}-`)) continue;
    // 24.12. und 31.12. zählen nur als halber Urlaubstag
    if (a.date <= today) taken += vacationDayValue(a.date);
    else planned += vacationDayValue(a.date);
  }
  const entitlement = firstYear ? (project.vacationAtStart ?? vacationPerYear(project)) : vacationPerYear(project);
  const carryIn = firstYear ? 0 : carryVacation;

  return {
    year,
    beforeStart: false,
    firstYear,
    vacation: { entitlement, carryIn, taken, planned, remaining: entitlement + carryIn - taken - planned },
    overtime: {
      carryIn: carryOvertime,
      months,
      balance: balanceSum,
      surcharge: surchargeSum,
      pendingSurcharge: pending,
      total,
    },
  };
}

/** Stand des Stundenkontos zu Beginn eines Monats (Minuten, inkl. gutgeschriebener Zuschläge). */
export function accountBeforeMonth(state: AppState, project: Project, year: number, month0: number, now = Date.now()): number {
  const y = yearOverview(state, project, year, now);
  if (y.beforeStart) return (project.overtimeAtStartHours ?? 0) * 60;
  return month0 === 0 ? y.overtime.carryIn : y.overtime.months[month0 - 1].total;
}

/**
 * Jahresübersicht mit Übertrag: Resturlaub und Überstunden werden vom Jahr des
 * Erfassungsbeginns an Jahr für Jahr ins Folgejahr übernommen.
 */
export function yearOverview(state: AppState, project: Project, year: number, now = Date.now()): YearOverview {
  const startYear = Number(project.startDate.slice(0, 4));
  if (year < startYear) {
    return {
      year,
      beforeStart: true,
      firstYear: false,
      vacation: { entitlement: 0, carryIn: 0, taken: 0, planned: 0, remaining: 0 },
      overtime: { carryIn: 0, months: [], balance: 0, surcharge: 0, pendingSurcharge: 0, total: 0 },
    };
  }
  let vacation = 0;
  let overtime = (project.overtimeAtStartHours ?? 0) * 60;
  let result: YearOverview | undefined;
  const cache = yearCache(state, project);
  // Vergangene Jahre hängen nur vom heutigen Tag ab, das laufende Jahr (und ein Jahr, in dem eine noch
  // laufende Zeit begonnen hat) von `now`
  const runningSince = state.sessions
    .filter((s) => s.projectId === project.id && s.end === undefined)
    .reduce((min, s) => Math.min(min, new Date(s.start).getFullYear()), Infinity);
  const today = dateKey(now);
  for (let y = startYear; y <= year; y++) {
    const past = y < runningSince && `${y}-12-31` < today;
    const key = `${y}|${past ? today : now}|${vacation}|${overtime}`;
    result = cache.get(key) ?? computeYear(state, project, y, now, vacation, overtime, y === startYear);
    cache.set(key, result);
    vacation = result.vacation.remaining;
    overtime = result.overtime.total;
  }
  return result!;
}

// Der Zustand wird bei jeder Änderung neu angelegt (store.tsx) → Ergebnisse je Zustand wiederverwenden.
// Die Startseite braucht das Jahr mehrmals pro Anzeige und rechnet bei laufender Zeit jede Sekunde neu.
const cacheByState = new WeakMap<AppState, WeakMap<Project, Map<string, YearOverview>>>();

function yearCache(state: AppState, project: Project): Map<string, YearOverview> {
  let perState = cacheByState.get(state);
  if (!perState) cacheByState.set(state, (perState = new WeakMap()));
  let perProject = perState.get(project);
  if (!perProject) perState.set(project, (perProject = new Map()));
  // Nur wenige Einträge behalten (bei laufender Zeit kommt jede Sekunde einer dazu)
  if (perProject.size > 50) perProject.clear();
  return perProject;
}
