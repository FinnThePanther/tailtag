import * as Sentry from "@sentry/react-native";

// Centralize Sentry initialization so it runs before the router mounts.
const routingInstrumentation = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
  enableTimeToInitialDisplayForPreloadedRoutes: true,
});

const SENTRY_DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN ??
  "https://998a5618a19167d71ccbcc016706fbae@o4510151259455488.ingest.us.sentry.io/4510151295959040";

Sentry.init({
  dsn: SENTRY_DSN,
  sendDefaultPii: true,
  enableLogs: true,
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

export { Sentry, routingInstrumentation };
