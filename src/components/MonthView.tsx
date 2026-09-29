import { useEffect, useRef, useState } from 'react';
import { ABSENCE_TYPES } from '../lib/absences';
import { monthSummary } from '../lib/calc';
import { notify } from '../lib/demo';
import { useHours, useNow, useStore } from '../lib/store';
import { MONTHS, WEEKDAYS_SHORT, dateKey, fmtDuration, fmtTime, parseDateKey } from '../lib/time';
import type { DateKey } from '../lib/types';
import { yearOverview } from '../lib/year';
import { DayEditor } from './DayEditor';
import { MonthExtras } from './MonthExtras';
import { ProjectPicker } from './ProjectPicker';
import { SurchargeList } from './SurchargeList';

export function MonthView() {
  const { state, update } = useStore();
  const hours = useHours();
  const running = state.sessions.some((s) => s.end === undefined);
  const now = useNow(true, running ? 1000 : 30_000);
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [editDate, setEditDate] = useState<DateKey | null>(null);
  // PDF-Modul vorladen, damit der Export direkt im Klick passiert (nötig fürs Teilen-Menü auf iOS)
  const pdf = useRef<typeof import('../lib/pdf') | null>(null);
  useEffect(() => {
    if (import.meta.env.MODE !== 'demo') void import('../lib/pdf').then((m) => (pdf.current = m));
  }, []);

  const projects = state.projects.filter((p) => !p.archived);
  const project = projects.find((p) => p.id === state.selectedProjectId) ?? projects[0];
  if (!project) return <div className="page"><p className="card muted">Bitte zuerst einen Arbeitgeber anlegen.</p></div>;

  const sum = monthSummary(state, project, ym.y, ym.m, now);
  const year = yearOverview(state, project, ym.y, now);
  const today = dateKey(now);
  const shift = (delta: number) =>
    setYm(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  return (
    <div className="page">
      <section className="card">
        <ProjectPicker
          projects={projects}
          value={project.id}
          onChange={(id) => update((s) => void (s.selectedProjectId = id))}
        />
        <div className="month-nav">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Vorheriger Monat">
            ‹
          </button>
          <h2>
            {MONTHS[ym.m]} {ym.y}
          </h2>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Nächster Monat">
            ›
          </button>
        </div>
        <div className="stats">
          <div className="stat">
            <span className="muted">Ist</span>
            <strong>{hours(sum.worked + sum.credit)} h</strong>
          </div>
          <div className="stat">
            <span className="muted">Soll</span>
            <strong>{hours(sum.target)} h</strong>
          </div>
          <div className={`stat ${sum.balance < 0 ? 'neg' : 'pos'}`}>
            <span className="muted">Saldo</span>
            <strong>{hours(sum.balance, true)} h</strong>
          </div>
        </div>
        <MonthExtras
          month={sum}
          year={ym.y}
          vacationRemaining={year.vacation.remaining}
          account={year.overtime.months[ym.m]?.total ?? (project.overtimeAtStartHours ?? 0) * 60}
          complete={dateKey(new Date(ym.y, ym.m + 1, 0)) < today}
        />
        <div className="chips summary-chips">
          <span className="chip static">{sum.workedDays} Arbeitstage</span>
          {Object.entries(sum.absenceCounts).map(([t, n]) => (
            <span
              key={t}
              className="chip static"
              style={{ '--chip': ABSENCE_TYPES[t as keyof typeof ABSENCE_TYPES].color } as React.CSSProperties}
            >
              {n.toLocaleString('de-DE')}× {ABSENCE_TYPES[t as keyof typeof ABSENCE_TYPES].label}
            </span>
          ))}
        </div>
        {sum.surcharges.some((s) => s.minutes > 0) && (
          <>
            <h3>Zulagen</h3>
            <SurchargeList month={sum} hideEmpty />
          </>
        )}
        <button className="btn primary full" onClick={async () => {
            if (import.meta.env.MODE === 'demo') {
              notify('In der Demo ist der PDF-Download gesperrt. In der installierten App wird der Bericht gespeichert oder geteilt.');
            } else {
              const m = pdf.current ?? (pdf.current = await import('../lib/pdf'));
              await m.exportMonthPdf(state, project, ym.y, ym.m);
            }
          }}>
          ⬇ PDF-Monatsbericht exportieren
        </button>
      </section>

      <section className="card day-list">
        {sum.days.map((d) => {
          const date = parseDateKey(d.date);
          const off = !d.isWorkday || !!d.holiday;
          const surchargeMinutes = Object.values(d.surcharges).reduce((a, b) => a + b, 0);
          return (
            <button
              key={d.date}
              className={`day-row ${off ? 'off' : ''} ${d.date === today ? 'today' : ''} ${d.untracked ? 'untracked' : ''}`}
              onClick={() => setEditDate(d.date)}
            >
              <span className="day-date">
                <strong>{date.getDate()}.</strong>
                <span className="muted">{WEEKDAYS_SHORT[date.getDay()]}</span>
              </span>
              <span className="day-info">
                {d.sessions.map((s) => (
                  <span key={s.id}>
                    {fmtTime(s.start)}
                    {dateKey(s.start) !== d.date && <sup title="Beginn am Vortag">−1</sup>}–{s.end ? fmtTime(s.end) : 'läuft'}
                    {s.end && dateKey(s.end) !== d.date && <sup>+1</sup>}
                  </span>
                ))}
                {d.holiday && <span className="tag holiday">{d.holiday}</span>}
                {d.absence && (
                  <span className="tag" style={{ '--chip': ABSENCE_TYPES[d.absence.type].color } as React.CSSProperties}>
                    {ABSENCE_TYPES[d.absence.type].label}
                  </span>
                )}
                {d.untracked && <span className="tag missing">nicht erfasst</span>}
              </span>
              <span className="day-hours">
                {d.sessions.length > 0 ? (
                  <>
                    <strong>{fmtDuration(d.worked)}</strong>
                    <span className="muted small">
                      P {fmtDuration(d.pause)}
                      {surchargeMinutes >= 1 && ' · Z'}
                    </span>
                  </>
                ) : d.credit > 0 ? (
                  <span className="muted">({fmtDuration(d.credit)})</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </section>

      {editDate && <DayEditor project={project} date={editDate} onClose={() => setEditDate(null)} />}
    </div>
  );
}
