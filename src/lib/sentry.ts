import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { APP_ENV } from './runtimeConfig';

type Extras = Record<string, unknown>;

export type SeverityTier = 'critical' | 'feature' | 'non-critical';

const routingInstrumentation = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
  enableTimeToInitialDisplayForPreloadedRoutes: true,
});

const SENTRY_DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN ??
  'https://998a5618a19167d71ccbcc016706fbae@o4510151259455488.ingest.us.sentry.io/4510151295959040';

const ENVIRONMENT =
  APP_ENV ??
  Constants.expoConfig?.extra?.environment ??
  process.env.NODE_ENV ??
  (__DEV__ ? 'development' : 'production');

const RELEASE = (() => {
  const slug = Constants.expoConfig?.slug ?? 'tailtag';
  const version =
    Constants.expoConfig?.version ??
    Constants.expoConfig?.runtimeVersion ??
    Constants.expoConfig?.extra?.appVersion;
  return version ? `${slug}@${version}` : slug;
})();

/** Patterns for errors that are expected/transient and should not be reported. */
const IGNORED_ERROR_PATTERNS = [
  /network request failed/i,
  /load failed/i,
  /internet connection appears to be offline/i,
  /aborted/i,
  /timed out after 5 seconds/i,
  /JWT expired/i,
  /PGRST116/, // Supabase "no rows returned" — expected for optional lookups
];

Sentry.init({
  dsn: SENTRY_DSN,
  environment: ENVIRONMENT,
  release: RELEASE,
  sendDefaultPii: true,
  debug: false,
  spotlight: __DEV__,
  tracesSampleRate: __DEV__ ? 1.0 : 0.1,
  profilesSampleRate: __DEV__ ? 1.0 : 0.05,
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    routingInstrumentation,
    Sentry.reactNativeTracingIntegration(),
    Sentry.mobileReplayIntegration(),
  ],
  beforeSend(event, hint) {
    const error = hint.originalException;
    const message = error instanceof Error ? error.message : String(error ?? '');

    if (IGNORED_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
      return null;
    }

    return event;
  },
  beforeBreadcrumb(breadcrumb) {
    // Drop console.log breadcrumbs in production (keep warn/error)
    if (
      breadcrumb.category === 'console' &&
      breadcrumb.level !== 'warning' &&
      breadcrumb.level !== 'error'
    ) {
      return null;
    }
    // Drop XHR breadcrumbs for realtime polling/heartbeat
    if (
      breadcrumb.category === 'xhr' &&
      typeof breadcrumb.data?.url === 'string' &&
      breadcrumb.data.url.includes('/realtime/')
    ) {
      return null;
    }
    return breadcrumb;
  },
});

const normalizeError = (error: unknown, fallbackMessage = 'Unknown error'): Error => {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message =
      typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : fallbackMessage;
    return new Error(message);
  }

  return new Error(fallbackMessage);
};

// ---------------------------------------------------------------------------
// Severity-tiered capture functions
// ---------------------------------------------------------------------------

const TIER_CONFIG: Record<SeverityTier, { level: Sentry.SeverityLevel; tag: string }> = {
  critical: { level: 'fatal', tag: 'critical' },
  feature: { level: 'error', tag: 'feature' },
  'non-critical': { level: 'warning', tag: 'non-critical' },
};

const captureWithTier = (
  tier: SeverityTier,
  error: unknown,
  extras?: Extras,
  fingerprint?: string[],
) => {
  const capturedError = normalizeError(error);
  const config = TIER_CONFIG[tier];

  Sentry.withScope((scope) => {
    scope.setTag('handled', 'true');
    scope.setTag('severity_tier', config.tag);
    scope.setLevel(config.level);

    if (extras) {
      scope.setExtras(extras);
    }

    if (fingerprint && fingerprint.length > 0) {
      scope.setFingerprint(fingerprint);
    }

    Sentry.captureException(capturedError);
  });
};

/** Auth failures, event pipeline broken, data corruption. */
export const captureCriticalError = (error: unknown, extras?: Extras, fingerprint?: string[]) =>
  captureWithTier('critical', error, extras, fingerprint);

/** Core feature failures: catches, achievements, fursuit CRUD. */
export const captureFeatureError = (error: unknown, extras?: Extras, fingerprint?: string[]) =>
  captureWithTier('feature', error, extras, fingerprint);

/** Non-critical failures: leaderboard, metadata, push notifications. */
export const captureNonCriticalError = (error: unknown, extras?: Extras) =>
  captureWithTier('non-critical', error, extras);

/**
 * @deprecated Use `captureCriticalError`, `captureFeatureError`, or
 * `captureNonCriticalError` instead. This alias maps to `captureFeatureError`.
 */
export const captureHandledException = (error: unknown, extras?: Extras, fingerprint?: string[]) =>
  captureFeatureError(error, extras, fingerprint);

export const captureHandledMessage = (
  message: string,
  extras?: Extras,
  level: Sentry.SeverityLevel = 'info',
) => {
  Sentry.withScope((scope) => {
    scope.setTag('handled', 'true');
    scope.setLevel(level);

    if (extras) {
      scope.setExtras(extras);
    }

    Sentry.captureMessage(message);
  });
};

// ---------------------------------------------------------------------------
// Supabase-specific error capture
// ---------------------------------------------------------------------------

/** Extract Supabase error metadata and capture with the given severity tier. */
export const captureSupabaseError = (
  error: unknown,
  context: Extras & { scope: string; action?: string },
  tier: SeverityTier = 'feature',
) => {
  if (!error) {
    captureHandledMessage('Supabase error without details', context, 'warning');
    return;
  }

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
  }

  captureWithTier(tier, error, metadata);
};

// ---------------------------------------------------------------------------
// Breadcrumbs & user context
// ---------------------------------------------------------------------------

export const addMonitoringBreadcrumb = (breadcrumb: {
  category: string;
  message: string;
  type?: string;
  data?: Extras;
  level?: Sentry.SeverityLevel;
}) => {
  Sentry.addBreadcrumb({
    level: breadcrumb.level ?? 'info',
    ...breadcrumb,
  });
};

export const setUser = (
  user: { id: string; email?: string | null; username?: string | null } | null,
) => {
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email ?? undefined,
      username: user.username ?? undefined,
    });
    return;
  }

  Sentry.setUser(null);
};

export { Sentry, routingInstrumentation };
