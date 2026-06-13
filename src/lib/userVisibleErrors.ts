export const NETWORK_UNAVAILABLE_MESSAGE =
  "We couldn't reach TailTag. Check your connection and try again.";

const DEFAULT_ERROR_MESSAGE = 'Something went wrong. Please try again.';

const NETWORK_ERROR_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /fetch failed/i,
  /load failed/i,
  /internet connection appears to be offline/i,
  /server with the specified hostname could not be found/i,
  /network connection was lost/i,
  /connection timed out/i,
  /request timed out/i,
  /\btimed out\b/i,
  /NSURLErrorDomain/i,
];

const TECHNICAL_ERROR_PATTERNS = [
  /^TypeError\b/i,
  /^PostgrestError\b/i,
  /^AuthRetryableFetchError\b/i,
  /^StorageApiError\b/i,
];

export function rawErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return null;
}

export function isNetworkError(error: unknown): boolean {
  const message = rawErrorMessage(error);
  return Boolean(message && NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message)));
}

export function getUserVisibleErrorMessage(
  error: unknown,
  fallbackMessage = DEFAULT_ERROR_MESSAGE,
): string {
  const message = rawErrorMessage(error);

  if (!message) {
    return fallbackMessage;
  }

  if (isNetworkError(message)) {
    return NETWORK_UNAVAILABLE_MESSAGE;
  }

  if (TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return fallbackMessage;
  }

  return message;
}
