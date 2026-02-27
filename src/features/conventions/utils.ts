import { toDisplayDate } from '../../utils/dates';

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

  // Parse the end date and set to end of day (23:59:59) to be inclusive
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  const now = new Date();
  return end < now;
};

/**
 * Check if a convention is currently active (started and not yet ended)
 * @param convention - Object with start_date and end_date fields
 * @returns true if today falls within the convention's date range
 */
export const isConventionActive = (convention: {
  start_date: string | null;
  end_date: string | null;
}): boolean => {
  if (isConventionEnded(convention.end_date)) return false;

  if (convention.start_date) {
    const start = new Date(convention.start_date);
    start.setHours(0, 0, 0, 0);
    if (start > new Date()) return false;
  }

  return true;
};
