import { WEEKDAYS_SHORT, dateKey, fmtDate, fmtDuration, fmtMoney } from './time';
import type { DateKey, Project, Terms, Weekday } from './types';

/** „from“ des ersten Zeitraums: gilt ab Erfassungsbeginn (und davor). */
export const BEGINNING = '0000-01-01';

/** Vertragswerte aus den Feldern des Arbeitgebers (für Daten ohne Verlauf). */
function baseTerms(p: Project): Terms {
  return {
    from: BEGINNING,
    hourlyRate: p.hourlyRate,
    dailyTargetHours: p.dailyTargetHours,
    workdays: [...p.workdays],
    overtimeSurchargePercent: p.overtimeSurchargePercent ?? 0,
    surchargePercents: Object.fromEntries(p.surcharges.map((r) => [r.id, r.percent])),
  };
}

/** Alle Zeiträume, ältester zuerst (mindestens einer). */
export function termsList(p: Project): Terms[] {
  if (!p.terms?.length) return [baseTerms(p)];
  return [...p.terms].sort((a, b) => a.from.localeCompare(b.from));
}

/** Die an einem Tag gültigen Werte. */
export function termsAt(p: Project, date: DateKey): Terms {
  const list = termsList(p);
  let result = list[0];
  for (const t of list) if (t.from <= date) result = t;
  return result;
}

/** Der Arbeitgeber mit den an einem Tag gültigen Werten (für alle Berechnungen). */
export function projectAt(p: Project, date: DateKey): Project {
  const t = termsAt(p, date);
  return {
    ...p,
    hourlyRate: t.hourlyRate,
    dailyTargetHours: t.dailyTargetHours,
    workdays: t.workdays,
    overtimeSurchargePercent: t.overtimeSurchargePercent,
    surcharges: p.surcharges.map((r) => ({ ...r, percent: t.surchargePercents[r.id] ?? r.percent })),
  };
}

/** Felder des Arbeitgebers an die heute gültigen Werte angleichen. */
function syncCurrent(p: Project, today: DateKey) {
  const cur = projectAt(p, today);
  p.hourlyRate = cur.hourlyRate;
  p.dailyTargetHours = cur.dailyTargetHours;
  p.workdays = cur.workdays;
  p.overtimeSurchargePercent = cur.overtimeSurchargePercent;
  p.surcharges = cur.surcharges;
}

/**
 * Zeitraum speichern (ändert `p`). `replaceFrom`: bisheriges Datum des bearbeiteten Eintrags.
 * Ein Eintrag mit demselben Datum wird ersetzt.
 */
export function saveTerms(p: Project, t: Terms, replaceFrom?: DateKey, today = dateKey(new Date())) {
  const list = termsList(p).filter((x) => x.from !== t.from && x.from !== replaceFrom);
  list.push({ ...t, workdays: [...t.workdays], surchargePercents: { ...t.surchargePercents } });
  list.sort((a, b) => a.from.localeCompare(b.from));
  // Der erste Zeitraum gilt immer ab Erfassungsbeginn
  list[0] = { ...list[0], from: BEGINNING };
  p.terms = list;
  syncCurrent(p, today);
}

/** Zeitraum löschen (der erste bleibt immer erhalten). */
export function removeTerms(p: Project, from: DateKey, today = dateKey(new Date())) {
  if (from === BEGINNING) return;
  p.terms = termsList(p).filter((x) => x.from !== from);
  syncCurrent(p, today);
}

/** Neue Zulagen-Regel: in allen Zeiträumen mit ihrem Standardwert anlegen. */
export function addRulePercent(p: Project, ruleId: string, percent: number) {
  if (!p.terms?.length) return;
  p.terms = p.terms.map((t) => ({ ...t, surchargePercents: { ...t.surchargePercents, [ruleId]: percent } }));
}

export function fmtWorkdays(days: Weekday[]): string {
  const order: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
  const sorted = order.filter((d) => days.includes(d));
  if (!sorted.length) return 'keine';
  if (sorted.length === 7) return 'Mo–So';
  // Zusammenhängende Tage als „Mo–Fr“, auch über das Wochenende hinweg („So–Do“, „Fr–Mo“)
  if (sorted.length > 2) {
    for (let i = 0; i < 7; i++) {
      const run = Array.from({ length: sorted.length }, (_, k) => order[(i + k) % 7]);
      if (run.every((d) => days.includes(d))) return `${WEEKDAYS_SHORT[run[0]]}–${WEEKDAYS_SHORT[run[run.length - 1]]}`;
    }
  }
  return sorted.map((d) => WEEKDAYS_SHORT[d]).join(', ');
}

const pct = (n: number) => `${n.toLocaleString('de-DE')} %`;

/** Was hat sich gegenüber dem vorherigen Zeitraum geändert? (für Verlauf und PDF) */
export function describeChanges(prev: Terms | undefined, t: Terms, p: Project): string[] {
  const out: string[] = [];
  if (!prev || prev.hourlyRate !== t.hourlyRate) out.push(`Stundenlohn ${fmtMoney(t.hourlyRate)}`);
  if (!prev || prev.dailyTargetHours !== t.dailyTargetHours) out.push(`Soll ${fmtDuration(t.dailyTargetHours * 60)} h/Tag`);
  if (!prev || fmtWorkdays(prev.workdays) !== fmtWorkdays(t.workdays)) out.push(`Arbeitstage ${fmtWorkdays(t.workdays)}`);
  if (!prev || prev.overtimeSurchargePercent !== t.overtimeSurchargePercent)
    out.push(`Überstunden-Zuschlag ${pct(t.overtimeSurchargePercent)}`);
  for (const r of p.surcharges) {
    const now = t.surchargePercents[r.id] ?? r.percent;
    const before = prev ? (prev.surchargePercents[r.id] ?? r.percent) : undefined;
    if (prev ? before !== now : r.enabled) out.push(`${r.name} ${pct(now)}`);
  }
  return out;
}

export function fmtFrom(from: DateKey): string {
  return from === BEGINNING ? 'ab Start der Zeiterfassung' : `ab ${fmtDate(from, false)}`;
}
