import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

type Extras = Record<string, unknown>;

const routingInstrumentation = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
  enableTimeToInitialDisplayForPreloadedRoutes: true,
});

const SENTRY_DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN ??
  "https://998a5618a19167d71ccbcc016706fbae@o4510151259455488.ingest.us.sentry.io/4510151295959040";

const ENVIRONMENT =
  process.env.EXPO_PUBLIC_APP_ENV ??
  Constants.expoConfig?.extra?.environment ??
  (Constants.manifest2 ? Constants.manifest2.extra?.expoClient?.releaseChannel : undefined) ??
  (process.env.NODE_ENV ?? (__DEV__ ? "development" : "production"));

const RELEASE = (() => {
  const slug = Constants.expoConfig?.slug ?? "tailtag";
  const version =
    Constants.expoConfig?.version ??
    Constants.expoConfig?.runtimeVersion ??
    Constants.expoConfig?.extra?.appVersion;
  return version ? `${slug}@${version}` : slug;
})();

Sentry.init({
  dsn: SENTRY_DSN,
  environment: ENVIRONMENT,
  release: RELEASE,
  sendDefaultPii: true,
  debug: __DEV__,
  // Adjust sampling rates before shipping to production.
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [
    routingInstrumentation,
    Sentry.reactNativeTracingIntegration(),
    Sentry.mobileReplayIntegration(),
  ],
  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

const normalizeError = (error: unknown, fallbackMessage = "Unknown error"): Error => {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : fallbackMessage;
    return new Error(message);
  }

  return new Error(fallbackMessage);
};

export const captureHandledException = (error: unknown, extras?: Extras, fingerprint?: string[]) => {
  const capturedError = normalizeError(error);

  Sentry.withScope((scope) => {
    scope.setTag("handled", "true");
    scope.setLevel("error");

    if (extras) {
      scope.setExtras(extras);
    }

    if (fingerprint && fingerprint.length > 0) {
      scope.setFingerprint(fingerprint);
    }

    Sentry.captureException(capturedError);
  });
};

export const captureHandledMessage = (
  message: string,
  extras?: Extras,
  level: Sentry.SeverityLevel = "info"
) => {
  Sentry.withScope((scope) => {
    scope.setTag("handled", "true");
    scope.setLevel(level);

    if (extras) {
      scope.setExtras(extras);
    }

    Sentry.captureMessage(message);
  });
};

export const captureSupabaseError = (
  error: unknown,
  context: Extras & { scope: string; action?: string }
) => {
  if (!error) {
    captureHandledMessage("Supabase error without details", context, "warning");
    return;
  }

  const metadata: Extras = { ...context };

  if (typeof error === "object" && error !== null) {
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

  captureHandledException(error, metadata);
};

export const addMonitoringBreadcrumb = (breadcrumb: {
  category: string;
  message: string;
  type?: string;
  data?: Extras;
  level?: Sentry.SeverityLevel;
}) => {
  Sentry.addBreadcrumb({
    level: breadcrumb.level ?? "info",
    ...breadcrumb,
  });
};

export const setUser = (user: { id: string; email?: string | null; username?: string | null } | null) => {
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
