import type { MonthSummary } from '../lib/calc';
import { useHours } from '../lib/store';
import { overtimeSurcharge } from '../lib/year';

const fmtDays = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

interface Props {
  month: MonthSummary;
  year: number;
  /** Resturlaub des Jahres (inkl. Übertrag, abzüglich genommen und geplant). */
  vacationRemaining: number;
  /** Monat ist abgeschlossen → Zuschlag gutgeschrieben. */
  complete: boolean;
  /** Stundenkonto nach diesem Monat (Minuten, inkl. Übertrag). */
  account: number;
}

/** Urlaubstage des Monats und Überstunden-Zuschlag unter den Monatsstunden. */
export function MonthExtras({ month, year, vacationRemaining, complete, account }: Props) {
  const hours = useHours();
  const vacation = month.absenceCounts.urlaub ?? 0;
  // Satz, der zum Monatsende gilt
  const pct = month.endTerms.overtimeSurchargePercent ?? 0;
  const surcharge = overtimeSurcharge(month.endTerms, month.balance);
  const { fromAccount, uncovered } = month.shortTime;
  const shortTotal = fromAccount + uncovered;
  return (
    <div className="month-extra">
      <div>
        <span>Urlaub in diesem Monat</span>
        <strong>{vacation === 1 ? '1 Tag' : `${fmtDays(vacation)} Tage`}</strong>
      </div>
      <div className="muted small">
        <span>Resturlaub {year}</span>
        <span>{fmtDays(vacationRemaining)} Tage</span>
      </div>
      {shortTotal > 0 && (
        <>
          <div>
            <span>Kurzarbeit</span>
            <strong>{hours(shortTotal)} h</strong>
          </div>
          {fromAccount > 0 && (
            <div className="muted small">
              <span>− mit Überstunden verrechnet</span>
              <span>{hours(-fromAccount)} h</span>
            </div>
          )}
          <div className="muted small">
            <span>= verbleibende Kurzarbeit</span>
            <span>{hours(uncovered)} h</span>
          </div>
          <div className="muted small">
            <span>Stundenkonto danach</span>
            <span>{hours(account, true)} h</span>
          </div>
        </>
      )}
      {pct > 0 && (
        <div className="muted small">
          <span>
            Überstundenzuschlag ({pct} %){complete ? '' : ' – am Monatsende'}
          </span>
          <span>{surcharge > 0 ? `${hours(surcharge, true)} h` : '–'}</span>
        </div>
      )}
    </div>
  );
}
