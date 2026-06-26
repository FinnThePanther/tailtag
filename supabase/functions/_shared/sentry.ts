type ErrorContext = Record<string, unknown>;

const sentryDsn = Deno.env.get('SENTRY_DSN') ?? Deno.env.get('SUPABASE_SENTRY_DSN') ?? null;

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      type: error.name || 'Error',
      value: error.message,
      stacktrace: error.stack
        ? {
            frames: error.stack
              .split('\n')
              .slice(1)
              .map((line) => ({ function: line.trim() }))
              .reverse(),
          }
        : undefined,
    };
  }

  return {
    type: 'Error',
    value: typeof error === 'string' ? error : JSON.stringify(error),
  };
}

function parseSentryDsn(dsn: string | null) {
  if (!dsn) {
    return null;
  }

  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\/+/, '');
    const envelopeUrl = `${url.protocol}//${url.host}/api/${projectId}/envelope/`;

    if (!publicKey || !projectId) {
      return null;
    }

    return { envelopeUrl, publicKey };
  } catch {
    return null;
  }
}

export function captureHandledException(error: unknown, context: ErrorContext) {
  const parsedDsn = parseSentryDsn(sentryDsn);

  if (!parsedDsn) {
    console.error('[edge-sentry] Handled exception', { error, context });
    return;
  }

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const event = {
    event_id: eventId,
    level: 'error',
    platform: 'javascript',
    timestamp: new Date().toISOString(),
    exception: {
      values: [normalizeError(error)],
    },
    contexts: {
      tailtag: context,
    },
  };
  const envelope = [
    JSON.stringify({
      event_id: eventId,
      sent_at: new Date().toISOString(),
      dsn: sentryDsn,
    }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');

  void fetch(parsedDsn.envelopeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsedDsn.publicKey}, sentry_client=tailtag-edge/1.0`,
    },
    body: envelope,
  }).catch((captureError) => {
    console.error('[edge-sentry] Failed capturing handled exception', {
      error,
      context,
      captureError,
    });
  });
}

export function captureSupabaseError(
  error: unknown,
  context: ErrorContext & { scope?: string; action?: string } = {},
) {
  const metadata: ErrorContext = { ...context };

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

  captureHandledException(error, {
    ...metadata,
    source: 'supabase',
  });
}
