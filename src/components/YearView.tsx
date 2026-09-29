import { useState } from 'react';
import { useHours, useNow, useStore } from '../lib/store';
import { termsAt } from '../lib/terms';
import { MONTHS, dateKey } from '../lib/time';
import { yearOverview } from '../lib/year';
import { ProjectPicker } from './ProjectPicker';

const fmtDays = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

export function YearView() {
  const { state, update } = useStore();
  const hours = useHours();
  // Summen in Minuten: bei laufender Zeit reicht einmal pro Minute (spart Akku)
  const now = useNow(true, 60_000);
  const [year, setYear] = useState(() => new Date().getFullYear());

  const projects = state.projects.filter((p) => !p.archived);
  const project = projects.find((p) => p.id === state.selectedProjectId) ?? projects[0];
  if (!project)
    return (
      <div className="page">
        <p className="card muted">Bitte zuerst einen Arbeitgeber anlegen.</p>
      </div>
    );

  const y = yearOverview(state, project, year, now);
  const v = y.vacation;
  const o = y.overtime;
  const available = v.entitlement + v.carryIn;
  const pct = termsAt(project, dateKey(now)).overtimeSurchargePercent;
  const pastYear = year < new Date(now).getFullYear();
  const usedShare = available > 0 ? Math.min(1, v.taken / available) : 0;
  const plannedShare = available > 0 ? Math.min(1 - usedShare, v.planned / available) : 0;

  return (
    <div className="page">
      <section className="card">
        <ProjectPicker
          projects={projects}
          value={project.id}
          onChange={(id) => update((s) => void (s.selectedProjectId = id))}
        />
        <div className="month-nav">
          <button className="icon-btn" onClick={() => setYear(year - 1)} aria-label="Vorheriges Jahr">
            ‹
          </button>
          <h2>{year}</h2>
          <button className="icon-btn" onClick={() => setYear(year + 1)} aria-label="Nächstes Jahr">
            ›
          </button>
        </div>
        {y.beforeStart && <p className="muted small">Die Erfassung beginnt erst am {project.startDate.split('-').reverse().join('.')}.</p>}
      </section>

      {!y.beforeStart && (
        <>
          <section className="card">
            <h2>Urlaub {year}</h2>
            <div className="stats">
              <div className="stat">
                <span className="muted">{y.firstYear ? 'Ab Erfassungsbeginn' : 'Anspruch'}</span>
                <strong>{fmtDays(v.entitlement)}</strong>
              </div>
              <div className="stat">
                <span className="muted">Übertrag {year - 1}</span>
                <strong>{fmtDays(v.carryIn)}</strong>
              </div>
              <div className={`stat ${v.remaining < 0 ? 'neg' : 'pos'}`}>
                <span className="muted">Rest</span>
                <strong>{fmtDays(v.remaining)}</strong>
              </div>
            </div>
            <div className="meter" aria-hidden>
              <span className="meter-taken" style={{ width: `${usedShare * 100}%` }} />
              <span className="meter-planned" style={{ width: `${plannedShare * 100}%` }} />
            </div>
            <div className="meter-legend small">
              <span>
                <i className="dot meter-taken" /> genommen: {fmtDays(v.taken)} Tage
              </span>
              <span>
                <i className="dot meter-planned" /> geplant: {fmtDays(v.planned)} Tage
              </span>
            </div>
            <p className="muted small">
              {pastYear
                ? `${fmtDays(v.remaining)} Tage wurden ins Jahr ${year + 1} übernommen.`
                : `Nicht genommener Urlaub wird automatisch ins Jahr ${year + 1} übernommen.`}
            </p>
          </section>

          <section className="card">
            <h2>Überstunden {year}</h2>
            <div className="stats">
              <div className="stat">
                <span className="muted">Übertrag {year - 1}</span>
                <strong>{hours(o.carryIn, true)} h</strong>
              </div>
              <div className="stat">
                <span className="muted">Zuschläge</span>
                <strong>{hours(o.surcharge, true)} h</strong>
              </div>
              <div className={`stat ${o.total < 0 ? 'neg' : 'pos'}`}>
                <span className="muted">{pastYear ? `Übertrag ${year + 1}` : 'Stand'}</span>
                <strong>{hours(o.total, true)} h</strong>
              </div>
            </div>
            {o.pendingSurcharge > 0 && (
              <p className="muted small">
                Voraussichtlich {hours(o.pendingSurcharge, true)} h Zuschlag ({pct} %) für den laufenden Monat – wird am
                Monatsende gutgeschrieben.
              </p>
            )}
            <div className="year-table" role="table">
              <div className="year-row head" role="row">
                <span>Monat</span>
                <span>Saldo</span>
                <span>Zuschlag</span>
                <span>Konto</span>
              </div>
              {o.months.map((m) => (
                <div key={m.month0} className={`year-row ${m.inactive ? 'inactive' : ''}`} role="row">
                  <span>{MONTHS[m.month0]}</span>
                  {m.inactive ? (
                    <>
                      <span>–</span>
                      <span>–</span>
                      <span>–</span>
                    </>
                  ) : (
                    <>
                      <span className={m.balance < 0 ? 'neg' : ''}>{hours(m.balance, true)}</span>
                      <span className={m.complete ? '' : 'muted'}>
                        {m.surcharge > 0 ? `${hours(m.surcharge, true)}${m.complete ? '' : '*'}` : '–'}
                      </span>
                      <strong className={m.total < 0 ? 'neg' : ''}>{hours(m.total, true)}</strong>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="muted small">
              {pct > 0
                ? `Zuschlag ${pct} % auf positive Monatsüberstunden${o.pendingSurcharge > 0 ? ', * = wird am Monatsende gutgeschrieben' : ''}. `
                : 'Kein Zuschlag auf Überstunden eingestellt (unter „Einstellungen“ änderbar). '}
              {pastYear
                ? `Der Stand wurde ins Jahr ${year + 1} übernommen.`
                : `Der Stand zum Jahresende wird automatisch ins Jahr ${year + 1} übernommen.`}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
