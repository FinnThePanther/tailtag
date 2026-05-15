const MAX_BACKOFF_MS = 5 * 60 * 1000;

export type CatchOutboxErrorClassification = {
  retryable: boolean;
  errorCode: string;
  errorMessage: string;
};

export function catchOutboxBackoffMs(retryCount: number) {
  return Math.min(MAX_BACKOFF_MS, 2 ** Math.max(0, retryCount) * 5 * 1000);
}

function rawErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.trim()
  ) {
    return error.message;
  }

  return null;
}

function errorMessageFor(error: unknown) {
  const message = rawErrorMessage(error);
  if (message) {
    return message;
  }

  return "We couldn't sync that catch. Please try again.";
}

function normalizedErrorMessage(error: unknown) {
  return rawErrorMessage(error)?.toLowerCase() ?? '';
}

function isRetryableCatchOutboxError(error: unknown) {
  const message = normalizedErrorMessage(error);
  if (!message) {
    return true;
  }

  if (
    message.includes('no such file') ||
    message.includes('file does not exist') ||
    message.includes('not readable') ||
    message.includes('could not be read') ||
    message.includes('please submit the photo again') ||
    message.includes('already caught') ||
    message.includes("couldn't find") ||
    message.includes('own suits') ||
    message.includes('not catchable') ||
    message.includes('share a playable convention') ||
    message.includes('cannot catch') ||
    message.includes('forbidden') ||
    message.includes('catch not found') ||
    message.includes('not pending') ||
    message.includes('already uploaded') ||
    message.includes('invalid photo')
  ) {
    return false;
  }

  return (
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('connection') ||
    message.includes('signed in') ||
    message.includes('failed to attach photo') ||
    message.includes('failed to upload')
  );
}

function errorCodeFor(error: unknown) {
  const message = normalizedErrorMessage(error);

  if (!message) return 'unknown_error';
  if (message.includes('timed out')) return 'timeout';
  if (
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('connection')
  ) {
    return 'network_error';
  }
  if (message.includes('signed in')) return 'auth_required';
  if (message.includes('already caught')) return 'already_caught';
  if (message.includes("couldn't find")) return 'code_not_found';
  if (message.includes('own suits')) return 'self_catch';
  if (message.includes('not catchable') || message.includes('share a playable convention')) {
    return 'shared_convention_required';
  }
  if (message.includes('cannot catch')) return 'blocked_user';
  if (
    message.includes('no such file') ||
    message.includes('file does not exist') ||
    message.includes('not readable') ||
    message.includes('could not be read') ||
    message.includes('please submit the photo again')
  ) {
    return 'photo_file_unavailable';
  }
  if (message.includes('forbidden')) return 'forbidden';
  if (message.includes('catch not found')) return 'catch_not_found';
  if (message.includes('not pending') || message.includes('already uploaded')) {
    return 'photo_upload_state_conflict';
  }
  if (message.includes('invalid photo')) return 'invalid_photo_upload_state';
  if (message.includes('failed to attach photo')) return 'photo_attach_failed';
  if (message.includes('failed to upload')) return 'photo_upload_failed';

  return 'server_rejected';
}

export function classifyCatchOutboxError(error: unknown): CatchOutboxErrorClassification {
  return {
    retryable: isRetryableCatchOutboxError(error),
    errorCode: errorCodeFor(error),
    errorMessage: errorMessageFor(error),
  };
}
