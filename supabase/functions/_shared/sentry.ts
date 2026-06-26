type ErrorContext = Record<string, unknown>;

const sentryDsn = Deno.env.get('SENTRY_DSN') ?? Deno.env.get('SUPABASE_SENTRY_DSN') ?? null;

function safeToString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return '[Unserializable]';
  }
}

function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  try {
    return (
      JSON.stringify(value, (_key, nestedValue) => {
        if (typeof nestedValue === 'bigint') {
          return nestedValue.toString();
        }

        if (typeof nestedValue === 'object' && nestedValue !== null) {
          if (seen.has(nestedValue)) {
            return '[Circular]';
          }
          seen.add(nestedValue);
        }

        return nestedValue;
      }) ?? safeToString(value)
    );
  } catch {
    return safeToString(value);
  }
}

function normalizeError(error: unknown) {
  try {
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
      value: typeof error === 'string' ? error : safeStringify(error),
    };
  } catch {
    return {
      type: 'Error',
      value: 'Unknown error',
    };
  }
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
  try {
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
      safeStringify({
        event_id: eventId,
        sent_at: new Date().toISOString(),
        dsn: sentryDsn,
      }),
      safeStringify({ type: 'event' }),
      safeStringify(event),
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
  } catch (captureError) {
    console.error('[edge-sentry] Failed preparing handled exception', {
      error: safeStringify(error),
      context: safeStringify(context),
      captureError,
    });
  }
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
