import { WEEKDAYS_SHORT } from '../lib/time';
import type { Weekday } from '../lib/types';

const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export function WeekdayToggle({
  value,
  onChange,
  label = 'Wochentage',
}: {
  value: Weekday[];
  onChange: (v: Weekday[]) => void;
  label?: string;
}) {
  return (
    <div className="weekday-toggle" role="group" aria-label={label}>
      {WEEK_ORDER.map((w) => (
        <button
          key={w}
          type="button"
          className={value.includes(w) ? 'active' : ''}
          aria-pressed={value.includes(w)}
          onClick={() => onChange(value.includes(w) ? value.filter((x) => x !== w) : [...value, w])}
        >
          {WEEKDAYS_SHORT[w]}
        </button>
      ))}
    </div>
  );
}
