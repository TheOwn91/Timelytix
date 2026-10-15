import { useState } from 'react';
import { ask } from '../lib/confirm';
import { useStore } from '../lib/store';
import { BEGINNING, describeChanges, fmtFrom, fmtWorkdays, removeTerms, saveTerms, termsAt, termsList } from '../lib/terms';
import { dateKey, fmtDuration, fmtMoney } from '../lib/time';
import type { Project, Terms } from '../lib/types';
import { Modal } from './Modal';
import { NumberField } from './NumberField';
import { WeekdayToggle } from './WeekdayToggle';

const pct = (n: number) => `${n.toLocaleString('de-DE')} %`;

/** Stundenlohn, Soll, Arbeitstage und Zuschläge mit „gültig ab“ und Verlauf. */
export function TermsSection({ project }: { project: Project }) {
  const { update } = useStore();
  const today = dateKey(new Date());
  const [editing, setEditing] = useState<{ terms: Terms; original?: string } | null>(null);
  const list = termsList(project);
  const current = termsAt(project, today);
  const enabledRules = project.surcharges.filter((r) => r.enabled);

  const edit = (fn: (p: Project) => void) =>
    update((d) => {
      const p = d.projects.find((x) => x.id === project.id);
      if (p) fn(p);
    });

  return (
    <>
      <div className="field-list readonly">
        <div className="field-row">
          <span>Stundenlohn</span>
          <strong>{current.hourlyRate > 0 ? fmtMoney(current.hourlyRate) : '–'}</strong>
        </div>
        <div className="field-row">
          <span>Soll pro Tag</span>
          <strong>{fmtDuration(current.dailyTargetHours * 60)} h</strong>
        </div>
        <div className="field-row">
          <span>Arbeitstage</span>
          <strong>{fmtWorkdays(current.workdays)}</strong>
        </div>
        <div className="field-row">
          <span>Zuschlag auf Überstunden</span>
          <strong>{pct(current.overtimeSurchargePercent)}</strong>
        </div>
        {enabledRules.map((r) => (
          <div className="field-row" key={r.id}>
            <span>{r.name}</span>
            <strong>{pct(current.surchargePercents[r.id] ?? r.percent)}</strong>
          </div>
        ))}
      </div>
      <button className="btn secondary full" onClick={() => setEditing({ terms: { ...current, from: today } })}>
        Werte ändern …
      </button>

      <div className="terms-history">
        <span className="muted small">Verlauf</span>
        {[...list].reverse().map((t, i, arr) => {
          const prev = arr[i + 1];
          const active = t.from === current.from;
          return (
            <button
              key={t.from}
              className={`terms-entry ${active ? 'active' : ''}`}
              onClick={() => setEditing({ terms: t, original: t.from })}
            >
              <span className="terms-date">
                {fmtFrom(t.from)}
                {active && <span className="tag">gilt heute</span>}
                {t.from > today && <span className="tag">geplant</span>}
              </span>
              {/* Nur ein Eintrag: Die Werte stehen schon oben in der Liste */}
              {arr.length > 1 && (
                <span className="muted small">{describeChanges(prev, t, project).join(' · ') || 'keine Änderung'}</span>
              )}
            </button>
          );
        })}
      </div>

      {editing && (
        <TermsEditor
          project={project}
          initial={editing.terms}
          isFirst={editing.original === BEGINNING}
          isNew={editing.original === undefined}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            edit((p) => saveTerms(p, t, editing.original));
            setEditing(null);
          }}
          onDelete={
            editing.original && editing.original !== BEGINNING
              ? async () => {
                  const ok = await ask('Diese Änderung löschen? Dann gelten wieder die vorherigen Werte.', { confirmLabel: 'Löschen', danger: true });
                  if (!ok) return;
                  edit((p) => removeTerms(p, editing.original!));
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

interface EditorProps {
  project: Project;
  initial: Terms;
  isFirst: boolean;
  isNew: boolean;
  onClose: () => void;
  onSave: (t: Terms) => void;
  onDelete?: () => void;
}

function TermsEditor({ project, initial, isFirst, isNew, onClose, onSave, onDelete }: EditorProps) {
  const [t, setT] = useState<Terms>(() => ({
    ...initial,
    surchargePercents: Object.fromEntries(project.surcharges.map((r) => [r.id, initial.surchargePercents[r.id] ?? r.percent])),
  }));
  const set = (patch: Partial<Terms>) => setT((x) => ({ ...x, ...patch }));

  return (
    <Modal title={isNew ? 'Neue Werte' : isFirst ? 'Werte ab Erfassungsbeginn' : 'Änderung bearbeiten'} onClose={onClose}>
      {isFirst ? (
        <p className="muted small">
          Diese Werte gelten ab Erfassungsbeginn bis zur nächsten Änderung. Wenn sich etwas ab einem bestimmten Tag ändert, lege
          stattdessen über „Werte ändern …“ neue Werte an.
        </p>
      ) : (
        <label className="terms-from">
          <span>Gültig ab</span>
          <input
            id="terms-from"
            type="date"
            value={t.from}
            min={project.startDate}
            onChange={(e) => e.target.value && set({ from: e.target.value })}
          />
        </label>
      )}
      <div className="field-list">
        <label>
          <span>Stundenlohn</span>
          <NumberField value={t.hourlyRate} decimals={2} minDecimals={2} onChange={(v) => set({ hourlyRate: v })} />
          <span className="unit">€</span>
        </label>
        <label>
          <span>Soll pro Tag</span>
          <NumberField value={t.dailyTargetHours} decimals={2} max={24} onChange={(v) => set({ dailyTargetHours: v })} />
          <span className="unit">h</span>
        </label>
        <label>
          <span>Zuschlag auf Überstunden</span>
          <NumberField
            value={t.overtimeSurchargePercent}
            decimals={1}
            max={1000}
            onChange={(v) => set({ overtimeSurchargePercent: v })}
          />
          <span className="unit">%</span>
        </label>
        {project.surcharges.map((r) => (
          <label key={r.id} className={r.enabled ? '' : 'muted'}>
            <span>
              {r.name}
              {!r.enabled && ' (aus)'}
            </span>
            <NumberField
              value={t.surchargePercents[r.id] ?? r.percent}
              decimals={1}
              max={1000}
              onChange={(v) => set({ surchargePercents: { ...t.surchargePercents, [r.id]: v } })}
            />
            <span className="unit">%</span>
          </label>
        ))}
      </div>
      <div className="terms-workdays">
        <span>Arbeitstage</span>
        <WeekdayToggle value={t.workdays} onChange={(v) => set({ workdays: v })} />
      </div>
      <p className="muted small">
        Tage vor dem „gültig ab“ werden weiter mit den bisherigen Werten berechnet – vergangene Monate, Überstunden und
        PDF-Berichte bleiben unverändert.
      </p>
      <button className="btn primary full" onClick={() => onSave(t)}>
        Speichern
      </button>
      {onDelete && (
        <button className="btn secondary full danger-text" onClick={onDelete}>
          Diese Änderung löschen
        </button>
      )}
    </Modal>
  );
}
