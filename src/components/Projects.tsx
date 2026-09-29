import { useRef, useState } from 'react';
import { ABSENCE_ORDER, ABSENCE_TYPES } from '../lib/absences';
import { DEFAULT_AUTO_BREAK_MINUTES } from '../lib/calc';
import { ask } from '../lib/confirm';
import { notify } from '../lib/demo';
import { shareOrDownload } from '../lib/device';
import { STATES } from '../lib/holidays';
import { PROJECT_COLORS, useStore, validateState } from '../lib/store';
import { setShiftToNextDay, shiftWeekdays } from '../lib/shift';
import { addRulePercent, fmtWorkdays } from '../lib/terms';
import { dateKey, uid } from '../lib/time';
import type { Project, SurchargeKind, SurchargeRule } from '../lib/types';
import { vacationPerYear } from '../lib/year';
import { DeleteAllData } from './DeleteAllData';
import { DisplayCard } from './DisplayCard';
import { InstallCard } from './InstallCard';
import { NotifyCard } from './NotifyCard';
import { NumberField } from './NumberField';
import { SurchargeModeField } from './SurchargeModeField';
import { TermsSection } from './TermsSection';
import { VersionCard } from './VersionCard';
import { WeekdayToggle } from './WeekdayToggle';

function SurchargeEditor({ rule, onChange, onRemove }: { rule: SurchargeRule; onChange: (r: SurchargeRule) => void; onRemove: () => void }) {
  const set = (patch: Partial<SurchargeRule>) => onChange({ ...rule, ...patch });
  return (
    <div className={`surcharge-edit ${rule.enabled ? '' : 'disabled'}`}>
      <div className="row">
        <label className="checkbox">
          <input type="checkbox" checked={rule.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        </label>
        <input className="grow" value={rule.name} onChange={(e) => set({ name: e.target.value })} />
        <span className="suffix muted">{rule.percent.toLocaleString('de-DE')} %</span>
        <button className="icon-btn" onClick={onRemove} aria-label="Zulage entfernen">
          ✕
        </button>
      </div>
      <div className="row">
        <select
          value={rule.kind}
          onChange={(e) => {
            const kind = e.target.value as SurchargeKind;
            set({
              kind,
              from: kind === 'time' ? rule.from ?? '22:00' : rule.from,
              to: kind === 'time' ? rule.to ?? '06:00' : rule.to,
              weekdays: kind === 'weekday' && !rule.weekdays?.length ? [0] : rule.weekdays,
            });
          }}
        >
          <option value="time">Uhrzeit</option>
          <option value="weekday">Wochentag</option>
          <option value="holiday">Feiertag</option>
        </select>
        {rule.kind === 'time' && (
          <>
            <input type="time" value={rule.from ?? ''} onChange={(e) => set({ from: e.target.value })} />
            <span>–</span>
            <input type="time" value={rule.to ?? ''} onChange={(e) => set({ to: e.target.value })} />
          </>
        )}
      </div>
      {rule.kind !== 'holiday' && (
        <div className="row">
          <WeekdayToggle value={rule.weekdays ?? []} onChange={(weekdays) => set({ weekdays })} />
          {rule.kind === 'time' && !rule.weekdays?.length && <span className="muted small">alle Tage</span>}
        </div>
      )}
    </div>
  );
}

function ProjectForm({ project }: { project: Project }) {
  const { update } = useStore();
  const set = (fn: (p: Project) => void) =>
    update((d) => {
      const p = d.projects.find((x) => x.id === project.id);
      if (p) fn(p);
    });

  return (
    <div className="project-form">
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
      <div className="auto-break-option">
        <label className="checkbox toggle-row">
          <input
            id="auto-break"
            type="checkbox"
            checked={project.autoBreak}
            onChange={(e) => set((p) => (p.autoBreak = e.target.checked))}
          />
          Gesetzliche Pause automatisch nach 6 h Arbeit
        </label>
        {project.autoBreak && (
          <>
            <div className="field-list">
              <label>
                <span>Länge der Pause</span>
                <NumberField
                  id="auto-break-minutes"
                  value={project.autoBreakMinutes ?? DEFAULT_AUTO_BREAK_MINUTES}
                  min={15}
                  max={120}
                  onChange={(v) => set((p) => (p.autoBreakMinutes = v))}
                />
                <span className="unit">min</span>
              </label>
            </div>
            <p className="muted small">
              Sind 6 h gearbeitet, beginnt die Pause, danach läuft die Arbeitszeit weiter. Nach 9 h folgt bei Bedarf eine
              weitere Pause, bis insgesamt 45 min erreicht sind. Selbst erfasste Pausen zählen mit.
            </p>
          </>
        )}
      </div>
      <div className="shift-option">
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
          Für Schichten, die ab 18 Uhr beginnen: Anstempeln Sonntagabend → die Schicht steht beim Montag, Montag →
          Dienstag usw. Früher beginnende Schichten bleiben an ihrem Tag. Zulagen (z. B. Sonntag) werden weiter nach
          den echten Uhrzeiten berechnet. Die Arbeitstage wandern mit
          {project.shiftToNextDay ? '.' : ` (${fmtWorkdays(project.workdays)} → ${fmtWorkdays(shiftWeekdays(project.workdays, 1))}).`}
        </p>
      </div>

      <TermsSection project={project} />

      <h3>Urlaub &amp; Überstunden</h3>
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
      <p className="muted small">
        „Zu Beginn“ = Stand am Tag „Erfassung ab“ (Minusstunden mit „-“ eingeben). Der Zuschlag wird am Monatsende auf
        die Überstunden des Monats gutgeschrieben. Resturlaub und Überstunden gehen automatisch ins nächste Jahr.
      </p>

      <h3>Schlüssel</h3>
      <p className="muted small">
        Welche Abwesenheiten zur Auswahl stehen (Tages-Editor und „Ohne Zeiterfassung“). Antippen blendet einen Schlüssel
        aus oder ein – bereits eingetragene Tage bleiben erhalten. „Feiertag“ trägt die App an gesetzlichen Feiertagen
        (Arbeitstag ohne Buchung) automatisch ein.
      </p>
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
                  const hidden = new Set(p.hiddenAbsences ?? []);
                  if (shown) hidden.add(t);
                  else hidden.delete(t);
                  p.hiddenAbsences = hidden.size ? ABSENCE_ORDER.filter((x) => hidden.has(x)) : undefined;
                })
              }
            >
              {shown ? '✓ ' : ''}
              {ABSENCE_TYPES[t].label}
            </button>
          );
        })}
      </div>

      <h3>Zulagen</h3>
      <p className="muted small">
        Zulagen werden minutengenau berechnet. Bei Uhrzeiten über Mitternacht (z. B. 22:00–06:00) einfach Ende vor Beginn
        eintragen. Die Prozentsätze änderst du oben unter „Lohn &amp; Arbeitszeit → Werte ändern“ – mit „gültig ab“.
      </p>
      <SurchargeModeField value={project.surchargeMode ?? 'max'} onChange={(m) => set((p) => (p.surchargeMode = m))} />
      {project.surcharges.map((r) => (
        <SurchargeEditor
          key={r.id}
          rule={r}
          onChange={(nr) => set((p) => (p.surcharges = p.surcharges.map((x) => (x.id === r.id ? nr : x))))}
          onRemove={() => set((p) => (p.surcharges = p.surcharges.filter((x) => x.id !== r.id)))}
        />
      ))}
      <button
        className="btn secondary full"
        onClick={() =>
          set((p) =>
          {
            const id = uid();
            p.surcharges.push({ id, name: 'Neue Zulage', kind: 'time', from: '20:00', to: '23:00', percent: 10, enabled: true });
            addRulePercent(p, id, 10);
          })
        }
      >
        + Zulage hinzufügen
      </button>

      <div className="row danger-zone">
        <button className="btn secondary" onClick={() => set((p) => (p.archived = !p.archived))}>
          {project.archived ? 'Wiederherstellen' : 'Archivieren'}
        </button>
        <button
          className="btn danger"
          onClick={async () => {
            const ok = await ask(`„${project.name}“ und alle zugehörigen Zeiten endgültig löschen?`, { confirmLabel: 'Löschen', danger: true });
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

export function Projects({ onShowWhatsNew, onNewEmployer }: { onShowWhatsNew: () => void; onNewEmployer: (name: string) => void }) {
  const { state, replace } = useStore();
  // Arbeitgeber sind anfangs eingeklappt – Antippen öffnet die Einstellungen
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    void shareOrDownload(blob, `timelytix-backup-${dateKey(new Date())}.json`);
  };

  const importBackup = async (file: File) => {
    try {
      const data = validateState(JSON.parse(await file.text()));
      if (!(await ask('Alle aktuellen Daten durch die Sicherung ersetzen?', { confirmLabel: 'Ersetzen', danger: true }))) return;
      replace(data);
    } catch (e) {
      notify(`Import fehlgeschlagen: ${(e as Error).message}`);
    }
  };

  return (
    <div className="page">
      <section className="card">
        <h2>Arbeitgeber / Projekte</h2>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            // Der Assistent fragt Arbeitszeit, Lohn und Startwerte ab
            onNewEmployer(name.trim());
            setName('');
          }}
        >
          <input className="grow" placeholder="Neuer Arbeitgeber / Projekt" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn primary" type="submit">
            Anlegen
          </button>
        </form>
      </section>

      {state.projects.map((p) => (
        <section key={p.id} className={`card project-card ${p.archived ? 'archived' : ''}`}>
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
        </section>
      ))}

      <DisplayCard />

      <InstallCard />

      <NotifyCard />

      <VersionCard onShowWhatsNew={onShowWhatsNew} />

      <section className="card">
        <h2>Datensicherung</h2>
        <p className="muted small">
          Alle Daten werden nur lokal auf diesem Gerät gespeichert – nichts wird hochgeladen. Erstelle regelmäßig eine Sicherung (z. B. in Dateien/Drive oder per Mail), damit bei Handywechsel oder Löschen der App nichts verloren geht.
        </p>
        <div className="row">
          <button className="btn secondary grow" onClick={exportBackup}>
            Sicherung exportieren
          </button>
          <button className="btn secondary grow" onClick={() => fileRef.current?.click()}>
            Sicherung importieren
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importBackup(f);
              e.target.value = '';
            }}
          />
        </div>
        <DeleteAllData onExportBackup={exportBackup} />
      </section>
    </div>
  );
}
