import * as Sentry from '@sentry/core';

type Extras = Record<string, unknown>;

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error('Unknown error');
  }
}

export function captureSupabaseError(
  error: unknown,
  context: Extras & { scope?: string; action?: string } = {},
) {
  const capturedError = normalizeError(error);
  const metadata: Extras = { ...context };

  if (typeof error === 'object' && error !== null) {
    const supabaseError = error as {
      code?: string;
      details?: string;
      hint?: string;
      message?: string;
    };

    if (supabaseError.code) {
      metadata.supabaseCode = supabaseError.code;
    }

    if (supabaseError.details) {
      metadata.supabaseDetails = supabaseError.details;
    }

    if (supabaseError.hint) {
      metadata.supabaseHint = supabaseError.hint;
    }

    if (supabaseError.message) {
      metadata.supabaseMessage = supabaseError.message;
    }
  }

  Sentry.withScope((scope) => {
    scope.setTag('source', 'supabase');
    scope.setLevel('error');

    if (context.scope) {
      scope.setTag('scope', context.scope);
    }

    if (context.action) {
      scope.setTag('action', context.action);
    }

    scope.setExtras(metadata);
    Sentry.captureException(capturedError);
  });
}
