import { parseDateOnlyAsLocal, toDisplayDate } from '../../utils/dates';

export const formatConventionDateRange = (start: string | null, end: string | null) => {
  const startLabel = toDisplayDate(start);
  const endLabel = toDisplayDate(end);

  if (startLabel && endLabel) {
    return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
  }

  return startLabel ?? endLabel ?? null;
};

/**
 * Check if a convention has ended based on its end_date
 * @param endDate - The convention end date (YYYY-MM-DD or ISO timestamp)
 * @returns true if the convention has ended (end date is in the past)
 */
export const isConventionEnded = (endDate: string | null): boolean => {
  if (!endDate) {
    return false; // No end date means we can't determine if it ended
  }

  // Parse as local midnight so end-of-day is in the device's timezone, not UTC.
  const end = /^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ? parseDateOnlyAsLocal(endDate)
    : new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const now = new Date();
  return end < now;
};
