import { toDisplayDate } from '../../utils/dates';

export const formatConventionDateRange = (start: string | null, end: string | null) => {
  const startLabel = toDisplayDate(start);
  const endLabel = toDisplayDate(end);

  if (startLabel && endLabel) {
    return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  }

  return startLabel ?? endLabel ?? null;
};
