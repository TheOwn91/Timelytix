import { useState } from 'react';
import { ABSENCE_ORDER, ABSENCE_TYPES } from '../lib/absences';
import { DEFAULT_AUTO_BREAK_MINUTES } from '../lib/calc';
import { ask } from '../lib/confirm';
import { STATES } from '../lib/holidays';
import { PROJECT_COLORS, useStore } from '../lib/store';
import { setShiftToNextDay, shiftWeekdays } from '../lib/shift';
import { addRulePercent, fmtWorkdays, termsAt } from '../lib/terms';
import { dateKey, fmtDate, fmtDuration, fmtMoney, uid } from '../lib/time';
import type { Project, SurchargeKind, SurchargeRule } from '../lib/types';
import { vacationPerYear } from '../lib/year';
import { BackupCard } from './BackupCard';
import { DisplayCard } from './DisplayCard';
import { InstallCard } from './InstallCard';
import { NotifyCard } from './NotifyCard';
import { NumberField } from './NumberField';
import { SettingsGroup } from './SettingsGroup';
import { SurchargeModeField } from './SurchargeModeField';
import { TermsSection } from './TermsSection';
import { VersionCard } from './VersionCard';
import { WeekdayToggle } from './WeekdayToggle';

/** Kurzbeschreibung einer Zulage, z. B. „18:00–22:00 · 10 %“. */
function ruleSummary(rule: SurchargeRule): string {
  if (!rule.enabled) return 'aus';
  const when =
    rule.kind === 'holiday'
      ? 'Feiertage'
      : rule.kind === 'weekday'
        ? fmtWorkdays(rule.weekdays ?? [])
        : `${rule.from ?? '?'}–${rule.to ?? '?'}${rule.weekdays?.length ? ` (${fmtWorkdays(rule.weekdays)})` : ''}`;
  return `${when} · ${rule.percent.toLocaleString('de-DE')} %`;
}

function SurchargeEditor({
  rule,
  isNew,
  onChange,
  onRemove,
}: {
  rule: SurchargeRule;
  /** Gerade hinzugefügt: gleich aufgeklappt zum Bearbeiten */
  isNew: boolean;
  onChange: (r: SurchargeRule) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<SurchargeRule>) => onChange({ ...rule, ...patch });
  return (
    <details className={`surcharge-edit ${rule.enabled ? '' : 'disabled'}`} open={isNew || undefined}>
      <summary>
        <strong>{rule.name || 'Ohne Namen'}</strong>
        <span className="muted small">{ruleSummary(rule)}</span>
      </summary>
      <div className="surcharge-edit-body">
        <div className="row">
          <label className="checkbox">
            <input type="checkbox" checked={rule.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
            Aktiv
          </label>
          <input
            className="grow"
            aria-label="Name der Zulage"
            value={rule.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <button className="icon-btn" onClick={onRemove} aria-label="Zulage entfernen">
            ✕
          </button>
        </div>
        <select
          aria-label="Art der Zulage"
          value={rule.kind}
          onChange={(e) => {
            const kind = e.target.value as SurchargeKind;
            set({
              kind,
              from: kind === 'time' ? (rule.from ?? '22:00') : rule.from,
              to: kind === 'time' ? (rule.to ?? '06:00') : rule.to,
              weekdays: kind === 'weekday' && !rule.weekdays?.length ? [0] : rule.weekdays,
            });
          }}
        >
          <option value="time">Uhrzeit</option>
          <option value="weekday">Wochentag</option>
          <option value="holiday">Feiertag</option>
        </select>
        {rule.kind === 'time' && (
          <div className="row times">
            <input type="time" aria-label="von" value={rule.from ?? ''} onChange={(e) => set({ from: e.target.value })} />
            <span>–</span>
            <input type="time" aria-label="bis" value={rule.to ?? ''} onChange={(e) => set({ to: e.target.value })} />
          </div>
        )}
        {rule.kind !== 'holiday' && (
          <div className="row">
            <WeekdayToggle value={rule.weekdays ?? []} onChange={(weekdays) => set({ weekdays })} />
            {rule.kind === 'time' && !rule.weekdays?.length && <span className="muted small">alle Tage</span>}
          </div>
        )}
      </div>
    </details>
  );
}

function ProjectForm({ project }: { project: Project }) {
  const { update } = useStore();
  const set = (fn: (p: Project) => void) =>
    update((d) => {
      const p = d.projects.find((x) => x.id === project.id);
      if (p) fn(p);
    });
  const terms = termsAt(project, dateKey(new Date()));
  const breakMin = project.autoBreakMinutes ?? DEFAULT_AUTO_BREAK_MINUTES;
  const activeRules = project.surcharges.filter((r) => r.enabled).length;
  const hidden = project.hiddenAbsences?.length ?? 0;
  const [newRule, setNewRule] = useState<string | null>(null);

  return (
    <div className="project-form">
      <SettingsGroup title="Allgemein" summary={`${STATES[project.state] ?? '–'} · ab ${fmtDate(project.startDate, false)}`}>
        <label>
          Name
          <input value={project.name} onChange={(e) => set((p) => (p.name = e.target.value))} />
        </label>
        <div className="color-row">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              className={`color ${project.color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => set((p) => (p.color = c))}
              aria-label={`Farbe ${c}`}
            />
          ))}
        </div>
        <div className="grid-2">
          <label>
            Feiertage
            <select value={project.state} onChange={(e) => set((p) => (p.state = e.target.value))}>
              {Object.entries(STATES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Erfassung ab
            <input
              type="date"
              value={project.startDate}
              onChange={(e) => e.target.value && set((p) => (p.startDate = e.target.value))}
            />
          </label>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Lohn & Arbeitszeit"
        summary={`${terms.hourlyRate > 0 ? `${fmtMoney(terms.hourlyRate)} · ` : ''}${fmtDuration(terms.dailyTargetHours * 60)} h · ${fmtWorkdays(terms.workdays)}`}
      >
        <TermsSection project={project} />
      </SettingsGroup>

      <SettingsGroup
        title="Pausen & Nachtschicht"
        summary={`${project.autoBreak ? `Pause ${breakMin} min nach 6 h` : 'keine automatische Pause'}${project.shiftToNextDay ? ' · Nachtschicht → Folgetag' : ''}`}
      >
        <label className="checkbox toggle-row">
          <input
            id="auto-break"
            type="checkbox"
            checked={project.autoBreak}
            onChange={(e) => set((p) => (p.autoBreak = e.target.checked))}
          />
          Gesetzliche Pause nach 6 h automatisch
        </label>
        {project.autoBreak && (
          <>
            <div className="field-list">
              <label>
                <span>Länge</span>
                <NumberField
                  id="auto-break-minutes"
                  value={breakMin}
                  min={15}
                  max={120}
                  onChange={(v) => set((p) => (p.autoBreakMinutes = v))}
                />
                <span className="unit">min</span>
              </label>
            </div>
            <p className="muted small">Nach 9 h folgt bei Bedarf der Rest bis 45 min. Eigene Pausen zählen mit.</p>
          </>
        )}
        <label className="checkbox toggle-row">
          <input
            id="shift-next-day"
            type="checkbox"
            checked={!!project.shiftToNextDay}
            onChange={(e) => set((p) => setShiftToNextDay(p, e.target.checked))}
          />
          Nachtschicht dem Folgetag zuordnen
        </label>
        <p className="muted small">
          Schichten über Mitternacht zählen zum Folgetag (So 22:00 – Mo 6:00 → Montag)
          {project.shiftToNextDay
            ? '.'
            : `; die Arbeitstage wandern mit (${fmtWorkdays(project.workdays)} → ${fmtWorkdays(shiftWeekdays(project.workdays, 1))}).`}
        </p>
      </SettingsGroup>

      <SettingsGroup
        title="Urlaub & Überstunden"
        summary={`${vacationPerYear(project).toLocaleString('de-DE')} Urlaubstage pro Jahr`}
      >
        <div className="field-list">
          <label>
            <span>Urlaubstage pro Jahr</span>
            <NumberField
              value={vacationPerYear(project)}
              decimals={1}
              max={366}
              onChange={(v) => set((p) => (p.vacationDaysPerYear = v))}
            />
            <span className="unit">Tage</span>
          </label>
          <label>
            <span>Resturlaub zu Beginn</span>
            <NumberField
              value={project.vacationAtStart ?? vacationPerYear(project)}
              decimals={1}
              max={366}
              onChange={(v) => set((p) => (p.vacationAtStart = v))}
            />
            <span className="unit">Tage</span>
          </label>
          <label>
            <span>Überstunden zu Beginn</span>
            <NumberField
              value={project.overtimeAtStartHours ?? 0}
              decimals={2}
              min={-10000}
              onChange={(v) => set((p) => (p.overtimeAtStartHours = v))}
            />
            <span className="unit">h</span>
          </label>
        </div>
        <p className="muted small">„Zu Beginn“ = Stand am Tag „Erfassung ab“; Minusstunden mit „-“.</p>
      </SettingsGroup>

      <SettingsGroup title="Zulagen" summary={activeRules ? `${activeRules} aktiv` : 'keine'}>
        <SurchargeModeField value={project.surchargeMode ?? 'max'} onChange={(m) => set((p) => (p.surchargeMode = m))} />
        {project.surcharges.map((r) => (
          <SurchargeEditor
            key={r.id}
            rule={r}
            isNew={r.id === newRule}
            onChange={(nr) => set((p) => (p.surcharges = p.surcharges.map((x) => (x.id === r.id ? nr : x))))}
            onRemove={() => set((p) => (p.surcharges = p.surcharges.filter((x) => x.id !== r.id)))}
          />
        ))}
        <button
          className="btn secondary full"
          onClick={() => {
            const id = uid();
            set((p) => {
              p.surcharges.push({
                id,
                name: 'Neue Zulage',
                kind: 'time',
                from: '20:00',
                to: '23:00',
                percent: 10,
                enabled: true,
              });
              addRulePercent(p, id, 10);
            });
            setNewRule(id);
          }}
        >
          + Zulage hinzufügen
        </button>
        <p className="muted small">Prozentsätze ändern unter „Lohn &amp; Arbeitszeit → Werte ändern“.</p>
      </SettingsGroup>

      <SettingsGroup
        title="Schlüssel"
        summary={hidden ? `${ABSENCE_ORDER.length - hidden} von ${ABSENCE_ORDER.length} sichtbar` : 'alle sichtbar'}
      >
        <div className="chips absence-keys">
          {ABSENCE_ORDER.map((t) => {
            const shown = !project.hiddenAbsences?.includes(t);
            return (
              <button
                key={t}
                className={`chip ${shown ? 'active' : ''}`}
                style={{ '--chip': ABSENCE_TYPES[t].color } as React.CSSProperties}
                aria-pressed={shown}
                onClick={() =>
                  set((p) => {
                    const next = new Set(p.hiddenAbsences ?? []);
                    if (shown) next.add(t);
                    else next.delete(t);
                    p.hiddenAbsences = next.size ? ABSENCE_ORDER.filter((x) => next.has(x)) : undefined;
                  })
                }
              >
                {shown ? '✓ ' : ''}
                {ABSENCE_TYPES[t].label}
              </button>
            );
          })}
        </div>
        <p className="muted small">Antippen blendet einen Schlüssel aus oder ein; eingetragene Tage bleiben.</p>
      </SettingsGroup>

      <div className="row danger-zone">
        <button className="btn secondary" onClick={() => set((p) => (p.archived = !p.archived))}>
          {project.archived ? 'Wiederherstellen' : 'Archivieren'}
        </button>
        <button
          className="btn danger"
          onClick={async () => {
            const ok = await ask(`„${project.name}“ und alle zugehörigen Zeiten endgültig löschen?`, {
              confirmLabel: 'Löschen',
              danger: true,
            });
            if (!ok) return;
            update((d) => {
              d.projects = d.projects.filter((p) => p.id !== project.id);
              d.sessions = d.sessions.filter((s) => s.projectId !== project.id);
              d.absences = d.absences.filter((a) => a.projectId !== project.id);
              if (d.selectedProjectId === project.id) d.selectedProjectId = d.projects[0]?.id;
            });
          }}
        >
          Löschen
        </button>
      </div>
    </div>
  );
}

export function Projects({
  onShowWhatsNew,
  onNewEmployer,
}: {
  onShowWhatsNew: () => void;
  onNewEmployer: (name: string) => void;
}) {
  const { state } = useStore();
  // Arbeitgeber sind anfangs eingeklappt – Antippen öffnet die Einstellungen
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="page">
      <section className="card project-list">
        <h2>Arbeitgeber</h2>
        {state.projects.map((p) => (
          <div key={p.id} className={`project-card ${p.archived ? 'archived' : ''}`}>
            <button
              className="project-head"
              aria-expanded={openId === p.id}
              onClick={() => setOpenId(openId === p.id ? null : p.id)}
            >
              <span className="dot" style={{ background: p.color }} />
              <strong className="grow">{p.name || 'Ohne Namen'}</strong>
              {p.archived && <span className="muted small">archiviert</span>}
              <span className="muted">{openId === p.id ? '▴' : '▾'}</span>
            </button>
            {openId === p.id && <ProjectForm project={p} />}
          </div>
        ))}
        {/* Name, Arbeitszeit, Lohn und Startwerte fragt der Assistent ab */}
        <button className="btn secondary full" onClick={() => onNewEmployer('')}>
          + Arbeitgeber hinzufügen
        </button>
      </section>

      <DisplayCard />

      <NotifyCard />

      <BackupCard />

      <VersionCard onShowWhatsNew={onShowWhatsNew} />

      <InstallCard />
    </div>
  );
}
