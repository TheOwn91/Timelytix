import { useState } from 'react';
import { DEMO } from '../lib/demo';
import { isStandalone } from '../lib/device';
import { STATES } from '../lib/holidays';
import { notifySupport, requestNotifyPermission, setNotifyEnabled } from '../lib/status';
import { newProject, useStore } from '../lib/store';
import { fmtWorkdays } from '../lib/terms';
import { fmtDate, fmtDuration, fmtMoney } from '../lib/time';
import type { Project } from '../lib/types';
import { InstallHelp } from './InstallCard';
import { Modal } from './Modal';
import { NumberField } from './NumberField';
import { SurchargeModeField } from './SurchargeModeField';
import { WeekdayToggle } from './WeekdayToggle';

type Step = 'employer' | 'time' | 'pay' | 'start' | 'app' | 'summary';

interface Props {
  /** Erster Start: zusätzlich Schritt „App einrichten“. */
  firstRun: boolean;
  initialName?: string;
  onClose: () => void;
}

/** Einrichtungs-Assistent für einen neuen Arbeitgeber (beim ersten Start auch für die App). */
export function SetupWizard({ firstRun, initialName = '', onClose }: Props) {
  const { state, update } = useStore();
  const [p, setP] = useState<Project>(() => ({ ...newProject(initialName, state.projects.length), name: initialName }));
  const set = (patch: Partial<Project>) => setP((x) => ({ ...x, ...patch }));

  // „App einrichten“ nur, wenn es dort etwas zu tun gibt
  const showInstall = !DEMO && !isStandalone();
  const [notify, setNotify] = useState(notifySupport);
  const showNotify = notify === 'ask' || notify === 'install';
  const showAppStep = firstRun && (showInstall || showNotify);
  const steps: Step[] = ['employer', 'time', 'pay', 'start', ...(showAppStep ? (['app'] as Step[]) : []), 'summary'];
  const [i, setI] = useState(0);
  const step = steps[i];

  const finish = () => {
    const project = { ...p, name: p.name.trim() || 'Mein Arbeitgeber' };
    update((d) => {
      d.projects.push(project);
      d.selectedProjectId = project.id;
    });
    onClose();
  };
  const cancel = () => {
    // Beim ersten Start trotzdem einen Arbeitgeber mit Standardwerten anlegen, damit man loslegen kann
    if (firstRun) finish();
    else onClose();
  };

  const titles: Record<Step, string> = {
    employer: 'Arbeitgeber',
    time: 'Arbeitszeit',
    pay: 'Lohn & Zulagen',
    start: 'Startwerte',
    app: 'App einrichten',
    summary: 'Zusammenfassung',
  };
  const canNext = step !== 'employer' || p.name.trim().length > 0;

  return (
    <Modal title={firstRun && i === 0 ? 'Willkommen bei Timelytix 👋' : titles[step]} onClose={cancel}>
      <div className="wizard-progress" aria-label={`Schritt ${i + 1} von ${steps.length}`}>
        {steps.map((s, n) => (
          <span key={s} className={n <= i ? 'done' : ''} />
        ))}
      </div>
      <p className="muted small wizard-step">
        Schritt {i + 1} von {steps.length} · {titles[step]}
      </p>

      {step === 'employer' && (
        <div className="wizard-body">
          {firstRun && <p>In wenigen Schritten ist alles eingerichtet. Du kannst alles später unter „Einstellungen“ ändern.</p>}
          <label className="wizard-field">
            <span>Name des Arbeitgebers oder Projekts</span>
            <input
              id="wizard-name"
              autoFocus
              placeholder="z. B. Muster GmbH"
              value={p.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
          <label className="wizard-field">
            <span>Bundesland (für die Feiertage)</span>
            <select id="wizard-state" value={p.state} onChange={(e) => set({ state: e.target.value })}>
              {Object.entries(STATES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="wizard-field">
            <span>Erfassung ab</span>
            <input
              id="wizard-start"
              type="date"
              value={p.startDate}
              onChange={(e) => e.target.value && set({ startDate: e.target.value })}
            />
            <span className="muted small">Ab diesem Tag zeigt die App fehlende Einträge an.</span>
          </label>
        </div>
      )}

      {step === 'time' && (
        <div className="wizard-body">
          <div className="wizard-field">
            <span>An welchen Tagen arbeitest du?</span>
            <WeekdayToggle value={p.workdays} onChange={(workdays) => set({ workdays })} />
          </div>
          <div className="field-list">
            <label>
              <span>Soll pro Arbeitstag</span>
              <NumberField value={p.dailyTargetHours} decimals={2} max={24} onChange={(v) => set({ dailyTargetHours: v })} />
              <span className="unit">h</span>
            </label>
          </div>
          <label className="checkbox toggle-row">
            <input id="wizard-break" type="checkbox" checked={p.autoBreak} onChange={(e) => set({ autoBreak: e.target.checked })} />
            Gesetzliche Pause automatisch nach 6 h Arbeit (30 min, nach 9 h insgesamt 45 min – später einstellbar)
          </label>
        </div>
      )}

      {step === 'pay' && (
        <div className="wizard-body">
          <p className="muted small">
            Der Stundenlohn ist optional – ohne ihn zeigt die App nur Stunden, keine Euro-Beträge.
          </p>
          <div className="field-list">
            <label>
              <span>Stundenlohn</span>
              <NumberField value={p.hourlyRate} decimals={2} minDecimals={2} onChange={(v) => set({ hourlyRate: v })} />
              <span className="unit">€</span>
            </label>
            <label>
              <span>Zuschlag auf Überstunden</span>
              <NumberField
                value={p.overtimeSurchargePercent ?? 0}
                decimals={1}
                max={1000}
                onChange={(v) => set({ overtimeSurchargePercent: v })}
              />
              <span className="unit">%</span>
            </label>
          </div>
          <p className="wizard-subhead">Welche Zulagen bekommst du?</p>
          <div className="field-list">
            {p.surcharges.map((r) => (
              <label key={r.id} className={`wizard-rule ${r.enabled ? '' : 'muted'}`}>
                <span className="wizard-rule-name">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={(e) =>
                      set({ surcharges: p.surcharges.map((x) => (x.id === r.id ? { ...x, enabled: e.target.checked } : x)) })
                    }
                  />
                  <span>
                    {r.name}
                    {r.kind === 'time' && <span className="muted small"> {r.from}–{r.to}</span>}
                  </span>
                </span>
                <NumberField
                  value={r.percent}
                  decimals={1}
                  max={1000}
                  onChange={(v) => set({ surcharges: p.surcharges.map((x) => (x.id === r.id ? { ...x, percent: v } : x)) })}
                />
                <span className="unit">%</span>
              </label>
            ))}
          </div>
          <SurchargeModeField value={p.surchargeMode ?? 'max'} onChange={(surchargeMode) => set({ surchargeMode })} />
          <p className="muted small">Uhrzeiten und weitere Zulagen kannst du später unter „Einstellungen“ anpassen.</p>
        </div>
      )}

      {step === 'start' && (
        <div className="wizard-body">
          <p className="muted small">
            Den Resturlaub und den Stand deines Überstundenkontos findest du meist auf deiner letzten Lohnabrechnung.
          </p>
          <div className="field-list">
            <label>
              <span>Urlaubstage pro Jahr</span>
              <NumberField
                value={p.vacationDaysPerYear ?? 30}
                decimals={1}
                max={366}
                onChange={(v) => set({ vacationDaysPerYear: v })}
              />
              <span className="unit">Tage</span>
            </label>
            <label>
              <span>Resturlaub am {fmtDate(p.startDate, false)}</span>
              <NumberField
                value={p.vacationAtStart ?? p.vacationDaysPerYear ?? 30}
                decimals={1}
                max={366}
                onChange={(v) => set({ vacationAtStart: v })}
              />
              <span className="unit">Tage</span>
            </label>
            <label>
              <span>Überstunden am {fmtDate(p.startDate, false)}</span>
              <NumberField
                value={p.overtimeAtStartHours ?? 0}
                decimals={2}
                min={-10000}
                onChange={(v) => set({ overtimeAtStartHours: v })}
              />
              <span className="unit">h</span>
            </label>
          </div>
          <p className="muted small">Minusstunden mit „-“ eingeben, z. B. -3,5.</p>
        </div>
      )}

      {step === 'app' && (
        <div className="wizard-body">
          {showInstall && (
            <section className="wizard-section">
              <p className="wizard-subhead">Auf dem Homescreen installieren</p>
              <p className="muted small">
                Dann startet Timelytix wie eine normale App und funktioniert ohne Internet.
              </p>
              <InstallHelp />
            </section>
          )}
          {showNotify && (
            <section className="wizard-section">
              <p className="wizard-subhead">Symbol in der Statusleiste</p>
              {notify === 'ask' ? (
                <>
                  <p className="muted small">Solange die Zeit läuft, zeigt Timelytix eine Benachrichtigung an.</p>
                  <button
                    className="btn secondary full"
                    onClick={async () => {
                      setNotifyEnabled(true);
                      await requestNotifyPermission();
                      setNotify(notifySupport());
                    }}
                  >
                    Benachrichtigungen erlauben
                  </button>
                </>
              ) : (
                <p className="muted small">Auf dem iPhone geht das, sobald Timelytix auf dem Home-Bildschirm installiert ist.</p>
              )}
            </section>
          )}
          {notify === 'ok' && <p className="small">✔ Benachrichtigungen sind erlaubt.</p>}
        </div>
      )}

      {step === 'summary' && (
        <div className="wizard-body">
          <div className="field-list readonly">
            <div className="field-row">
              <span>Arbeitgeber</span>
              <strong>{p.name.trim() || 'Mein Arbeitgeber'}</strong>
            </div>
            <div className="field-row">
              <span>Feiertage</span>
              <strong>{STATES[p.state]}</strong>
            </div>
            <div className="field-row">
              <span>Erfassung ab</span>
              <strong>{fmtDate(p.startDate, false)}</strong>
            </div>
            <div className="field-row">
              <span>Arbeitszeit</span>
              <strong>
                {fmtWorkdays(p.workdays)} · {fmtDuration(p.dailyTargetHours * 60)} h
              </strong>
            </div>
            <div className="field-row">
              <span>Stundenlohn</span>
              <strong>{p.hourlyRate > 0 ? fmtMoney(p.hourlyRate) : '–'}</strong>
            </div>
            <div className="field-row">
              <span>Zulagen</span>
              <strong>
                {p.surcharges
                  .filter((r) => r.enabled)
                  .map((r) => r.name)
                  .join(', ') || '–'}
              </strong>
            </div>
            <div className="field-row">
              <span>Urlaub</span>
              <strong>
                {(p.vacationDaysPerYear ?? 30).toLocaleString('de-DE')} Tage/Jahr · Rest{' '}
                {(p.vacationAtStart ?? p.vacationDaysPerYear ?? 30).toLocaleString('de-DE')}
              </strong>
            </div>
            <div className="field-row">
              <span>Überstunden zu Beginn</span>
              <strong>{fmtDuration((p.overtimeAtStartHours ?? 0) * 60, true)} h</strong>
            </div>
          </div>
          <p className="muted small">Alles lässt sich später unter „Einstellungen“ ändern.</p>
        </div>
      )}

      <div className="wizard-nav">
        {i > 0 ? (
          <button className="btn secondary" onClick={() => setI(i - 1)}>
            Zurück
          </button>
        ) : (
          <button className="btn secondary" onClick={cancel}>
            {firstRun ? 'Überspringen' : 'Abbrechen'}
          </button>
        )}
        {step === 'summary' ? (
          <button className="btn primary" onClick={finish}>
            Fertig
          </button>
        ) : (
          <button className="btn primary" disabled={!canNext} onClick={() => setI(i + 1)}>
            Weiter
          </button>
        )}
      </div>
    </Modal>
  );
}
