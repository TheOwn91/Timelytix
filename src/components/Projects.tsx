import { useEffect, useRef, useState } from 'react';
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
import { FeedbackCard } from './FeedbackCard';
import { InstallCard } from './InstallCard';
import { NotifyCard } from './NotifyCard';
import { NumberField } from './NumberField';
import { SettingsGroup } from './SettingsGroup';
import { SurchargeModeField } from './SurchargeModeField';
import { TermsSection } from './TermsSection';
import { VersionCard } from './VersionCard';
import { WeekdayToggle } from './WeekdayToggle';
import { Icon } from './Icon';
import { CardTitle } from './Help';

/** Kurzbeschreibung einer Zulage, z. B. „18:00–22:00 · 10 %“ (`percent`: heute gültiger Satz). */
function ruleSummary(rule: SurchargeRule, percent: number): string {
  if (!rule.enabled) return 'aus';
  const when =
    rule.kind === 'holiday'
      ? 'Feiertage'
      : rule.kind === 'weekday'
        ? fmtWorkdays(rule.weekdays ?? [])
        : `${rule.from || '?'}–${rule.to || '?'}${rule.weekdays?.length ? ` (${fmtWorkdays(rule.weekdays)})` : ''}`;
  return `${when} · ${percent.toLocaleString('de-DE')} %`;
}

function SurchargeEditor({
  rule,
  percent,
  isNew,
  onChange,
  onRemove,
}: {
  rule: SurchargeRule;
  percent: number;
  /** Gerade hinzugefügt: aufgeklappt, Name zum Überschreiben markiert */
  isNew: boolean;
  onChange: (r: SurchargeRule) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<SurchargeRule>) => onChange({ ...rule, ...patch });
  // Nur beim Hinzufügen offen – danach bleibt sie, wie der Nutzer sie auf- oder zuklappt
  const [initiallyOpen] = useState(isNew);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (initiallyOpen) nameRef.current?.select();
  }, [initiallyOpen]);
  return (
    <details className={`surcharge-edit ${rule.enabled ? '' : 'disabled'}`} open={initiallyOpen || undefined}>
      <summary>
        <strong>{rule.name || 'Ohne Namen'}</strong>
        <span className="muted small">{ruleSummary(rule, percent)}</span>
      </summary>
      <div className="surcharge-edit-body">
        <div className="row">
          <label className="checkbox">
            <input type="checkbox" checked={rule.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
            Aktiv
          </label>
          <input
            ref={nameRef}
            className="grow"
            aria-label="Name der Zulage"
            value={rule.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          <button className="icon-btn" onClick={onRemove} aria-label="Zulage entfernen">
            <Icon name="close" />
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
          <option value="time">Zu bestimmten Uhrzeiten</option>
          <option value="weekday">An bestimmten Wochentagen</option>
          <option value="holiday">An Feiertagen</option>
        </select>
        {rule.kind === 'time' && (
          <div className="row times">
            <input type="time" aria-label="von" value={rule.from ?? ''} onChange={(e) => e.target.value && set({ from: e.target.value })} />
            <span>–</span>
            <input type="time" aria-label="bis" value={rule.to ?? ''} onChange={(e) => e.target.value && set({ to: e.target.value })} />
          </div>
        )}
        {rule.kind !== 'holiday' && (
          <div className="row">
            <WeekdayToggle value={rule.weekdays ?? []} onChange={(weekdays) => set({ weekdays })} label="Wochentage der Zulage" />
            {rule.kind === 'time' && !rule.weekdays?.length && <span className="muted small">alle Tage</span>}
          </div>
        )}
      </div>
    </details>
  );
}

function ProjectForm({ project }: { project: Project }) {
  const { state, update } = useStore();
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
      <SettingsGroup
        title="Allgemein"
        summary={`${STATES[project.state] ?? '–'} · ab ${fmtDate(project.startDate, false)}`}
        help={
          <>
            <p>
              <strong>Bundesland:</strong> bestimmt, welche Tage gesetzliche Feiertage sind. An Feiertagen musst du nicht
              arbeiten, sie zählen trotzdem als Arbeitstag.
            </p>
            <p>
              <strong>Zeiterfassung ab:</strong> der erste Tag, den Timelytix berechnet. Ab hier zählen Soll-Stunden und Urlaub,
              und die App erinnert an Tage ohne Eintrag. Tage davor werden nicht gerechnet.
            </p>
          </>
        }
      >
        <label>
          Name
          <input value={project.name} onChange={(e) => set((p) => (p.name = e.target.value))} />
        </label>
        <div className="color-row">
          {PROJECT_COLORS.map((c, i) => (
            <button
              key={c}
              className={`color ${project.color === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => set((p) => (p.color = c))}
              aria-label={`Farbe ${i + 1}`}
              aria-pressed={project.color === c}
            />
          ))}
        </div>
        <div className="grid-2">
          <label>
            Bundesland (Feiertage)
            <select value={project.state} onChange={(e) => set((p) => (p.state = e.target.value))}>
              {Object.entries(STATES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Zeiterfassung ab
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
        help={
          <>
            <p>
              <strong>Soll-Arbeitszeit:</strong> so viele Stunden musst du an jedem Arbeitstag arbeiten. Mehr ergibt Überstunden,
              weniger Minusstunden.
            </p>
            <p>
              <strong>Überstundenzuschlag:</strong> Aufschlag in Prozent auf die Überstunden, die am Monatsende übrig sind (0 % =
              kein Aufschlag).
            </p>
            <p>
              <strong>Ab einem Datum ändern:</strong> Bekommst du mehr Lohn oder änderst deine Arbeitszeit, lege neue Werte mit
              dem Datum an, ab dem sie gelten. Ältere Tage rechnet die App weiter mit den alten Werten – vergangene Monate und
              PDF-Berichte bleiben richtig.
            </p>
          </>
        }
      >
        <TermsSection project={project} />
      </SettingsGroup>

      <SettingsGroup
        title="Pausen & Nachtschicht"
        summary={`${project.autoBreak ? `Pause ${breakMin} min nach 6 h` : 'keine automatische Pause'}${project.shiftToNextDay ? ' · Nachtschicht → Folgetag' : ''}`}
        help={
          <>
            <p>
              <strong>Gesetzliche Pause:</strong> Wer mehr als 6 Stunden arbeitet, muss 30 Minuten Pause machen, ab 9 Stunden
              45 Minuten. Hast du weniger Pause eingetragen, zieht Timelytix den Rest automatisch ab. Deine eigenen Pausen zählen
              dabei mit.
            </p>
            <p>
              <strong>Nachtschicht:</strong> Eine Schicht über Mitternacht zählt dann ganz zu dem Tag, an dem sie endet
              (So 22:00 – Mo 6:00 → Montag). Sonst zählt sie zum Tag, an dem sie beginnt.
            </p>
          </>
        }
      >
        <label className="checkbox toggle-row">
          <input
            id="auto-break"
            type="checkbox"
            checked={project.autoBreak}
            onChange={(e) => set((p) => (p.autoBreak = e.target.checked))}
          />
          Gesetzliche Pause automatisch abziehen
        </label>
        {project.autoBreak && (
          <>
            <div className="field-list">
              <label>
                <span>Pausenlänge</span>
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
          </>
        )}
        <label className="checkbox toggle-row">
          <input
            id="shift-next-day"
            type="checkbox"
            checked={!!project.shiftToNextDay}
            onChange={(e) => set((p) => setShiftToNextDay(p, e.target.checked))}
          />
          Nachtschicht zählt zum nächsten Tag
        </label>
        {!project.shiftToNextDay && (
          <p className="muted small">
            Beim Einschalten verschieben sich die Arbeitstage mit: {fmtWorkdays(project.workdays)} →{' '}
            {fmtWorkdays(shiftWeekdays(project.workdays, 1))}.
          </p>
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Urlaub & Überstunden"
        summary={`${vacationPerYear(project).toLocaleString('de-DE')} Urlaubstage pro Jahr`}
        help={
          <>
            <p>
              <strong>Urlaubstage pro Jahr:</strong> dein Jahresanspruch laut Vertrag.
            </p>
            <p>
              <strong>Resturlaub und Überstunden am Start:</strong> dein Stand am Tag „Zeiterfassung ab“, z. B. aus der letzten
              Lohnabrechnung. Minusstunden mit „-“ davor eingeben.
            </p>
            <p>Nicht genommener Urlaub und Überstunden wandern zum Jahreswechsel automatisch ins neue Jahr.</p>
          </>
        }
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
            <span>Resturlaub am Start</span>
            <NumberField
              value={project.vacationAtStart ?? vacationPerYear(project)}
              decimals={1}
              max={366}
              onChange={(v) => set((p) => (p.vacationAtStart = v))}
            />
            <span className="unit">Tage</span>
          </label>
          <label>
            <span>Überstunden am Start</span>
            <NumberField
              value={project.overtimeAtStartHours ?? 0}
              decimals={2}
              min={-10000}
              onChange={(v) => set((p) => (p.overtimeAtStartHours = v))}
            />
            <span className="unit">h</span>
          </label>
        </div>
      </SettingsGroup>

      <SettingsGroup
        title="Zulagen"
        summary={activeRules ? `${activeRules} aktiv` : 'keine'}
        help={
          <>
            <p>
              Zulagen sind Zuschläge für bestimmte Zeiten, z. B. Nachtarbeit, Sonntage oder Feiertage. Timelytix zählt, wie viele
              Stunden in diese Zeiten fallen, und rechnet mit deinem Stundenlohn den Betrag aus.
            </p>
            <p>
              Die Prozentsätze stellst du unter „Lohn &amp; Arbeitszeit“ ein – so können auch sie sich ab einem Datum ändern.
            </p>
          </>
        }
      >
        <SurchargeModeField value={project.surchargeMode ?? 'max'} onChange={(m) => set((p) => (p.surchargeMode = m))} />
        {project.surcharges.map((r) => (
          <SurchargeEditor
            key={r.id}
            rule={r}
            percent={terms.surchargePercents[r.id] ?? r.percent}
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
      </SettingsGroup>

      <SettingsGroup
        title="Abwesenheiten"
        summary={hidden ? `${ABSENCE_ORDER.length - hidden} von ${ABSENCE_ORDER.length} sichtbar` : 'alle sichtbar'}
        help={
          <p>
            Diese Abwesenheiten (Schlüssel) kannst du für einen Tag eintragen, z. B. Urlaub oder Krank. Brauchst du eine nicht,
            blende sie hier aus – sie verschwindet dann aus der Auswahl. Schon eingetragene Tage bleiben erhalten.
          </p>
        }
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
                {shown && <span aria-hidden>✓ </span>}
                {ABSENCE_TYPES[t].label}
              </button>
            );
          })}
        </div>
        <p className="muted small">Antippen blendet aus oder ein.</p>
      </SettingsGroup>

      <div className="row danger-zone">
        <button className="btn secondary" onClick={() => set((p) => (p.archived = !p.archived))}>
          {project.archived ? 'Wiederherstellen' : 'Archivieren'}
        </button>
        <button
          className="btn danger"
          onClick={async () => {
            const running = state.sessions.some((s) => s.projectId === project.id && s.end === undefined);
            const ok = await ask(
              `„${project.name}“ und alle zugehörigen Zeiten endgültig löschen?${running ? ' Die laufende Zeit wird dabei verworfen.' : ''}`,
              { confirmLabel: 'Löschen', danger: true },
            );
            if (!ok) return;
            update((d) => {
              d.projects = d.projects.filter((p) => p.id !== project.id);
              d.sessions = d.sessions.filter((s) => s.projectId !== project.id);
              d.absences = d.absences.filter((a) => a.projectId !== project.id);
              if (d.selectedProjectId === project.id) d.selectedProjectId = (d.projects.find((p) => !p.archived) ?? d.projects[0])?.id;
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
        <CardTitle
          title="Arbeitgeber"
          help={
            <>
              <p>
                Für jeden Arbeitgeber (oder jedes Projekt) stellst du hier Arbeitszeit, Lohn, Urlaub und Zulagen ein. Antippen
                öffnet die Einstellungen.
              </p>
              <p>
                <strong>Archivieren:</strong> Der Arbeitgeber verschwindet aus der Auswahl, seine Zeiten bleiben gespeichert.{' '}
                <strong>Löschen</strong> entfernt ihn mit allen Zeiten.
              </p>
            </>
          }
        />
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
              <span className="muted project-chevron" aria-hidden>
                <Icon name={openId === p.id ? 'collapse' : 'expand'} />
              </span>
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

      <FeedbackCard />

      <InstallCard />
    </div>
  );
}
