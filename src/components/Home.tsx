import { useMemo, useState } from 'react';
import { ABSENCE_TYPES, visibleAbsences } from '../lib/absences';
import { DEMO } from '../lib/demo';
import { sessionDay } from '../lib/shift';
import { isStandalone } from '../lib/device';
import { ask } from '../lib/confirm';
import { notifyEnabled, notifySupport, requestNotifyPermission, setNotifyEnabled, syncRunningStatus } from '../lib/status';
import { buildIndex, daySummary, monthSummary, sessionStats, untrackedDays } from '../lib/calc';
import { useHours, useNow, useStore } from '../lib/store';
import { MONTHS, dateKey, fmtClock, fmtDate, fmtDuration, fmtTime, uid } from '../lib/time';
import type { AbsenceType, DateKey } from '../lib/types';
import { yearOverview } from '../lib/year';
import { DayEditor } from './DayEditor';
import { MonthExtras } from './MonthExtras';
import { ProjectPicker } from './ProjectPicker';
import { SurchargeList } from './SurchargeList';

const INSTALL_HINT_KEY = 'timetrack.installHintDismissed';

const QUICK_ABSENCES: AbsenceType[] = ['urlaub', 'krank', 'ueberstunden', 'kurzarbeit', 'frei'];

export function Home({ onOpenProjects, onStartSetup }: { onOpenProjects: () => void; onStartSetup: () => void }) {
  const { state, update } = useStore();
  const hours = useHours();
  const active = state.sessions.find((s) => s.end === undefined);
  const now = useNow(true, active ? 1000 : 30_000);
  const [editDate, setEditDate] = useState<DateKey | null>(null);
  const [hideInstall, setHideInstall] = useState(() => {
    try {
      return DEMO || isStandalone() || localStorage.getItem(INSTALL_HINT_KEY) === '1';
    } catch {
      return true;
    }
  });
  const dismissInstall = () => {
    setHideInstall(true);
    try {
      localStorage.setItem(INSTALL_HINT_KEY, '1');
    } catch {
      /* ignorieren */
    }
  };

  const projects = state.projects.filter((p) => !p.archived);
  const project =
    state.projects.find((p) => p.id === active?.projectId) ??
    projects.find((p) => p.id === state.selectedProjectId) ??
    projects[0];
  // Summen zeigen nur Minuten: einmal pro Minute rechnen, nicht bei jedem Sekundentakt des Timers
  const minute = Math.floor(now / 60_000) * 60_000;
  const totals = useMemo(() => {
    if (!project) return undefined;
    const d = new Date(minute);
    return {
      month: monthSummary(state, project, d.getFullYear(), d.getMonth(), minute),
      yearNow: yearOverview(state, project, d.getFullYear(), minute),
      missing: untrackedDays(state, project, minute),
    };
  }, [state, project, minute]);

  if (!project || !totals) {
    return (
      <div className="page">
        <div className="card onboarding">
          <h2>Willkommen bei Timelytix 👋</h2>
          <p>Lege zuerst deinen Arbeitgeber an – der Assistent führt dich in wenigen Schritten durch.</p>
          <button className="btn primary full" onClick={onStartSetup}>
            Einrichtung starten
          </button>
        </div>
      </div>
    );
  }

  const openPause = active?.pauses.find((p) => p.end === undefined);
  // Tag, zu dem die laufende Schicht zählt (bei „Schicht dem Folgetag zuordnen“ ggf. morgen)
  const today = daySummary(project, active ? sessionDay(project, active) : dateKey(now), buildIndex(state, project.id), now);
  // Automatische Pause nach 6 h: läuft gerade, und wie viel davon fällt in die laufende Buchung
  const autoPause = !openPause ? today.autoBreaks.find((b) => now >= b.start && now < b.end) : undefined;
  const autoInActive = active
    ? today.autoBreaks.reduce((n, b) => n + Math.min(b.minutes, Math.max(0, (Math.min(b.end, now) - Math.max(b.start, active.start)) / 60_000)), 0)
    : 0;
  const raw = active ? sessionStats(active, now) : undefined;
  const stats = raw && { net: raw.net - autoInActive, pause: raw.pause + autoInActive };
  const d = new Date(now);
  const { month, yearNow, missing } = totals;

  const start = () => {
    const session = { id: uid(), projectId: project.id, start: Date.now(), pauses: [] };
    update((s) => {
      s.sessions.push(session);
    });
    // Beim ersten Start fragen, ob die App eine „Zeit läuft“-Benachrichtigung zeigen darf –
    // erst in der App, die Abfrage des Browsers kommt nur nach „Erlauben“
    if (notifyEnabled() && notifySupport() === 'ask') {
      void ask('Soll Timelytix in der Statusleiste anzeigen, dass die Zeit läuft?', {
        detail: 'Nach „Erlauben“ fragt dein Handy einmal nach der Erlaubnis. Ändern kannst du das jederzeit unter Einstellungen → Statusleiste.',
        confirmLabel: 'Erlauben',
        cancelLabel: 'Nicht jetzt',
        // Nach der Erlaubnis die Anzeige gleich zeigen, nicht erst beim nächsten Tipp
        onConfirm: () =>
          void requestNotifyPermission().then(
            (granted) => granted && void syncRunningStatus({ ...state, sessions: [...state.sessions, session] }, true),
          ),
      }).then((ok) => !ok && setNotifyEnabled(false));
    }
  };
  const togglePause = () =>
    update((s) => {
      const sess = s.sessions.find((x) => x.id === active!.id)!;
      const open = sess.pauses.find((p) => p.end === undefined);
      if (open) open.end = Date.now();
      else sess.pauses.push({ start: Date.now() });
    });
  const stop = () =>
    update((s) => {
      const sess = s.sessions.find((x) => x.id === active!.id)!;
      const t = Date.now();
      for (const p of sess.pauses) if (p.end === undefined) p.end = t;
      sess.end = t;
    });
  const setAbsence = (date: DateKey, type: AbsenceType) =>
    update((s) => {
      s.absences.push({ id: uid(), projectId: project.id, date, type });
    });

  return (
    <div className="page">
      {!hideInstall && (
        <div className="install-hint">
          <button className="grow" onClick={onOpenProjects}>
            📲 Timelytix als App auf dem Homescreen installieren – funktioniert dann offline
          </button>
          <button className="icon-btn" onClick={dismissInstall} aria-label="Hinweis ausblenden">
            ✕
          </button>
        </div>
      )}
      <section className="card">
        <div className="row">
          <ProjectPicker
            projects={projects}
            value={project.id}
            disabled={!!active}
            onChange={(id) => update((s) => void (s.selectedProjectId = id))}
          />
          <button className="icon-btn" onClick={onOpenProjects} aria-label="Einstellungen" title="Einstellungen">
            ⚙
          </button>
        </div>
        {active && <p className="muted small center">Während die Zeit läuft, kann die Arbeit nicht gewechselt werden.</p>}
      </section>

      <section className={`card timer ${active ? (openPause || autoPause ? 'paused' : 'running') : ''}`}>
        {active && stats ? (
          <>
            <div className="timer-status">
              {openPause
                ? `⏸ Pause seit ${fmtTime(openPause.start)}`
                : autoPause
                  ? `⏸ Pause (automatisch) bis ${fmtTime(autoPause.end)}`
                  : `● Läuft seit ${fmtTime(active.start)}`}
            </div>
            <div className="clock">{fmtClock(stats.net * 60_000)}</div>
            <div className="muted center">
              Pause: {fmtClock(stats.pause * 60_000)} · heute gesamt: {fmtDuration(today.worked)} h
            </div>
            <div className="timer-actions">
              <button className={`btn big ${openPause ? 'primary' : 'warning'}`} onClick={togglePause}>
                {openPause ? '▶ Weiter' : '⏸ Pause'}
              </button>
              <button className="btn big danger" onClick={stop}>
                ■ Beenden
              </button>
            </div>
          </>
        ) : (
          <>
            {today.worked > 0 && (
              <div className="muted center">Heute bereits erfasst: {fmtDuration(today.worked)} h</div>
            )}
            <button className="btn big primary start" onClick={start}>
              ▶ Zeit starten
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h2>
          {MONTHS[d.getMonth()]} {d.getFullYear()}
        </h2>
        <div className="stats">
          <div className="stat">
            <span className="muted">Ist</span>
            <strong>{hours(month.worked + month.credit)} h</strong>
          </div>
          <div className="stat">
            <span className="muted">Soll bis heute</span>
            <strong>{hours(month.target)} h</strong>
          </div>
          <div className={`stat ${month.balance < 0 ? 'neg' : 'pos'}`}>
            <span className="muted">Saldo</span>
            <strong>{hours(month.balance, true)} h</strong>
          </div>
        </div>
        <MonthExtras
          month={month}
          year={d.getFullYear()}
          vacationRemaining={yearNow.vacation.remaining}
          complete={false}
          account={yearNow.overtime.months[d.getMonth()].total}
        />
        {month.credit > 0 && (
          <p className="muted small">Davon {hours(month.credit)} h Gutschrift (Urlaub, Krank …)</p>
        )}
        <h3>Zulagen</h3>
        {month.surcharges.length === 0 ? (
          <p className="muted small">Keine Zulagen konfiguriert.</p>
        ) : (
          <SurchargeList month={month} />
        )}
      </section>

      <section className="card">
        <h2>
          Ohne Zeiterfassung <span className="badge">{missing.length}</span>
        </h2>
        {missing.length === 0 ? (
          <p className="muted">✔ Alle vergangenen Arbeitstage sind erfasst.</p>
        ) : (
          <ul className="missing-list">
            {missing.map((m) => (
              <li key={m.date}>
                <button className="missing-date" onClick={() => setEditDate(m.date)}>
                  {fmtDate(m.date)}
                  <span className="muted small">Zeit nachtragen ›</span>
                </button>
                <div className="chips">
                  {visibleAbsences(project, QUICK_ABSENCES).map((t) => (
                    <button
                      key={t}
                      className="chip small"
                      style={{ '--chip': ABSENCE_TYPES[t].color } as React.CSSProperties}
                      onClick={() => setAbsence(m.date, t)}
                      title={ABSENCE_TYPES[t].label}
                    >
                      {t === 'frei' ? 'Frei' : ABSENCE_TYPES[t].label.replace('Überstundenausgleich', 'Ü-Ausgleich')}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editDate && <DayEditor project={project} date={editDate} onClose={() => setEditDate(null)} />}
    </div>
  );
}
