import { expect, it } from 'vitest';
import { ABSENCE_ORDER, visibleAbsences } from './absences';

it('blendet Schlüssel aus, der eingetragene bleibt sichtbar', () => {
  const p = { hiddenAbsences: ['kurzarbeit' as const, 'sonstiges' as const] };
  expect(visibleAbsences(p)).toEqual(ABSENCE_ORDER.filter((t) => t !== 'kurzarbeit' && t !== 'sonstiges'));
  expect(visibleAbsences(p, ABSENCE_ORDER, 'kurzarbeit')).toContain('kurzarbeit');
  expect(visibleAbsences({})).toEqual(ABSENCE_ORDER);
});
