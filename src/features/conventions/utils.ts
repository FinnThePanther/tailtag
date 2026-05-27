import { parseDateOnlyAsLocal, toDisplayDate } from '../../utils/dates';
import type { ConventionVerificationErrorCode } from '@/features/conventions/api/conventions';

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

/**
 * Normalize a GPS accuracy value to a usable integer meter value.
 * Falls back to 50m when the accuracy is not a number.
 */
export const normalizeAccuracy = (accuracy: number | null): number => {
  if (accuracy === null || !Number.isFinite(accuracy)) return 50;
  const rounded = Math.round(accuracy);
  if (!Number.isFinite(rounded)) return 50;
  return Math.max(1, rounded);
};

/**
 * Map a convention verification error code to a user-facing message.
 */
export const verificationErrorMessage = (
  errorCode: ConventionVerificationErrorCode | null | undefined,
  fallback?: string | null,
): string => {
  switch (errorCode) {
    case 'outside_geofence':
      return "TailTag couldn't confirm you're inside the convention area. Move closer to the venue and try again.";
    case 'poor_accuracy':
      return 'Your GPS signal is not accurate enough to verify you. Step outside or move closer to the venue, then try again.';
    case 'rate_limited':
      return "You've tried location verification several times. Wait a bit, then try again on-site.";
    case 'geofence_not_configured':
      return "This convention's location check is not ready yet. Please ask event staff to review the geofence.";
    case 'registration_closed':
      return 'This convention is not open for registration right now.';
    case 'convention_not_found':
      return 'This convention is no longer available.';
    case 'profile_not_found':
      return 'Unable to verify location without profile.';
    case 'location_required':
      return 'TailTag needs a fresh location check before catching unlocks.';
    default:
      return fallback ?? 'Location verification failed. Please try again.';
  }
};
