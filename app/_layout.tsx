// app/_layout.tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSegments, Stack, Redirect, useNavigationContainerRef } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryCache, QueryClient, QueryClientProvider, MutationCache, useQuery } from "@tanstack/react-query";

import { AuthProvider, useAuth, usePrimeUserData } from "../src/features/auth";
import { NavigationReadyProvider, useSetNavigationReady } from "../src/hooks/useNavigationReady";
import { createProfileQueryOptions } from "../src/features/profile";
import { colors } from "../src/theme";
import { ToastProvider } from "../src/hooks/useToast";
import { DailyTaskToastManager } from "../src/features/daily-tasks/components/DailyTaskToastManager";
import { AchievementToastManager } from "../src/features/achievements";
import { CatchConfirmationToastManager } from "../src/features/catch-confirmations";
import { PushNotificationManager } from "../src/features/push-notifications";
import {
  Sentry,
  addMonitoringBreadcrumb,
  captureFeatureError,
  captureNonCriticalError,
  routingInstrumentation,
} from "../src/lib/sentry";
import { handleAuthError } from "../src/lib/authErrorHandler";
import { SuspensionGate } from "../src/features/moderation";
import { EnvironmentBanner } from "../src/components/EnvironmentBanner";

function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

/**
 * Auth-aware root layout:
 * - Uses <Redirect /> for gating (replaces history cleanly).
 * - No BackHandler: rely on Expo Router's default Android back behavior.
 */
function RootLayoutNav() {
  const { status, session } = useAuth();
  const segments = useSegments();
  const inAuthGroup = segments.length > 0 && segments[0] === "(auth)";
  const inOnboardingFlow = segments.length > 0 && segments[0] === "onboarding";
  const inResetPasswordFlow =
    segments.length > 0 && segments[0] === "reset-password";
  const userId = session?.user.id ?? null;
  const setNavigationReady = useSetNavigationReady();

  const {
    data: profile,
    isLoading: isProfileLoading,
    isFetching: isProfileFetching,
    error: profileError,
  } = useQuery({
    ...createProfileQueryOptions(userId ?? ""),
    enabled: Boolean(userId),
    refetchInterval: 5 * 60_000,
  });

  usePrimeUserData(session?.user.id ?? null);

  const hasCompletedOnboarding = profile?.onboarding_completed === true;
  const shouldGateOnboarding =
    Boolean(session) &&
    !profileError &&
    profile !== null && // Explicit null check - don't gate while loading
    (profile?.is_new === true || !hasCompletedOnboarding);

  const shouldShowOnboardingRedirectLoading =
    !inResetPasswordFlow &&
    Boolean(session) &&
    shouldGateOnboarding &&
    !inOnboardingFlow &&
    (isProfileLoading || isProfileFetching) &&
    !profile &&
    !profileError;

  const shouldShowOnboardingFlowLoading =
    Boolean(session) &&
    inOnboardingFlow &&
    (isProfileLoading || isProfileFetching) &&
    !profile &&
    !profileError;

  let redirectHref: "/" | "/auth" | "/onboarding" | null = null;

  if (!session && !inAuthGroup) {
    redirectHref = "/auth";
  } else if (session && inAuthGroup) {
    redirectHref = "/";
  } else if (
    !inResetPasswordFlow &&
    session &&
    shouldGateOnboarding &&
    !inOnboardingFlow &&
    !shouldShowOnboardingRedirectLoading
  ) {
    redirectHref = "/onboarding";
  } else if (
    session &&
    inOnboardingFlow &&
    hasCompletedOnboarding &&
    !isProfileLoading &&
    !isProfileFetching
  ) {
    redirectHref = "/";
  }

  const shouldShowLoadingScreen =
    status === "loading" ||
    shouldShowOnboardingRedirectLoading ||
    shouldShowOnboardingFlowLoading;

  useEffect(() => {
    if (shouldShowLoadingScreen || redirectHref) {
      return;
    }

    setNavigationReady();
  }, [redirectHref, setNavigationReady, shouldShowLoadingScreen]);

  if (status === "loading") {
    return <LoadingScreen />;
  }

  // Not signed in: ensure we're in the auth stack.
  if (!session && !inAuthGroup) {
    return <Redirect href="/auth" />;
  }

  // Signed in but currently inside the auth stack: send to app root.
  if (session && inAuthGroup) {
    return <Redirect href="/" />;
  }

  // Don't redirect mid-flow during password reset — the recovery session
  // makes the user appear authenticated, but they need to stay on this screen.
  if (inResetPasswordFlow) {
    // Fall through to normal Stack rendering below
  } else if (session && shouldGateOnboarding && !inOnboardingFlow) {
    if (shouldShowOnboardingRedirectLoading) {
      return <LoadingScreen />;
    }

    // Log onboarding redirect for debugging
    addMonitoringBreadcrumb({
      category: "routing",
      message: "Redirecting to onboarding",
      data: {
        userId,
        profileIsNew: profile?.is_new,
        profileOnboardingCompleted: profile?.onboarding_completed,
        isProfileLoading,
        isProfileFetching,
      },
    });

    return <Redirect href="/onboarding" />;
  }

  if (session && inOnboardingFlow && hasCompletedOnboarding && !isProfileLoading && !isProfileFetching) {
    return <Redirect href="/" />;
  }

  if (shouldShowOnboardingFlowLoading) {
    return <LoadingScreen />;
  }

  // Suspension gate: if user is suspended, show full-screen overlay
  if (
    session &&
    profile?.is_suspended === true &&
    // Allow temporary suspensions that have already expired
    (!profile.suspended_until || new Date(profile.suspended_until) > new Date())
  ) {
    return (
      <SuspensionGate
        reason={profile.suspension_reason ?? null}
        suspendedUntil={profile.suspended_until ?? null}
      />
    );
  }

  // Normal app stack. Android back will "go back" automatically if there's history.
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.foreground, fontWeight: '600' },
        headerBackTitle: ' ',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Auth group - no header (full-screen auth flow) */}
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />

      {/* Main app (tabs) - no header (tab navigator has its own) */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />

      {/* Onboarding - no header (custom multi-step wizard) */}
      <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />

      {/* Standalone fursuit flows - has its own _layout.tsx */}
      <Stack.Screen name="fursuits" options={{ headerShown: false }} />

      {/* Catch detail screens */}
      <Stack.Screen name="catches" options={{ headerShown: false }} />

      {/* Public player profiles */}
      <Stack.Screen name="profile" options={{ headerShown: false }} />

      {/* Achievements */}
      <Stack.Screen name="achievements/index" options={{ headerShown: false }} />

      {/* Daily tasks */}
      <Stack.Screen name="daily-tasks/index" options={{ headerShown: false }} />

      {/* Blocked users management */}
      <Stack.Screen name="blocked-users" options={{ headerShown: false }} />

      {/* OAuth callback (deep link landing) */}
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />

      {/* Password reset completion (deep link landing) */}
      <Stack.Screen name="reset-password" options={{ headerShown: false }} />
    </Stack>
  );
}

/** Query key prefixes that map to non-critical severity. */
const NON_CRITICAL_KEY_PREFIXES = [
  "convention-leaderboard",
  "convention-suit-leaderboard",
  "fursuit-species",
  "fursuit-colors",
];

function isNonCriticalQueryKey(queryKey: unknown): boolean {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
  const first = String(queryKey[0]);
  return NON_CRITICAL_KEY_PREFIXES.some((prefix) => first.startsWith(prefix));
}

/** Extract Supabase error metadata (code/details/hint) into extras. */
function extractQueryErrorExtras(
  error: unknown,
  base: Record<string, unknown>,
): Record<string, unknown> {
  const extras = { ...base };
  if (typeof error === "object" && error !== null) {
    const e = error as { code?: string; details?: string; hint?: string };
    if (e.code) extras.supabaseCode = e.code;
    if (e.details) extras.supabaseDetails = e.details;
    if (e.hint) extras.supabaseHint = e.hint;
  }
  return extras;
}

function Layout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            const extras = extractQueryErrorExtras(error, {
              scope: "react-query.query",
              queryHash: query?.queryHash,
              queryKey: query?.queryKey,
            });
            const capturer = isNonCriticalQueryKey(query?.queryKey)
              ? captureNonCriticalError
              : captureFeatureError;
            capturer(error, extras);
            void handleAuthError(error);
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            const extras = extractQueryErrorExtras(error, {
              scope: "react-query.mutation",
              mutationId: mutation?.mutationId,
              mutationKey: mutation?.options?.mutationKey,
            });
            captureFeatureError(error, extras);
            void handleAuthError(error);
          },
        }),
      })
  );
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    if (!navigationRef) {
      return;
    }

    if (navigationRef.current) {
      routingInstrumentation.registerNavigationContainer(navigationRef);
      addMonitoringBreadcrumb({
        category: "navigation",
        message: "Registered navigation container",
      });
      return;
    }

    // Expo Router sets the ref asynchronously; retry until it's available.
    const interval = setInterval(() => {
      if (navigationRef.current) {
        routingInstrumentation.registerNavigationContainer(navigationRef);
        addMonitoringBreadcrumb({
          category: "navigation",
          message: "Registered navigation container (delayed)",
        });
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [navigationRef]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <EnvironmentBanner />
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <NavigationReadyProvider>
                <ToastProvider>
                  <PushNotificationManager />
                  <AchievementToastManager />
                  <DailyTaskToastManager />
                  <CatchConfirmationToastManager />
                  <RootLayoutNav />
                </ToastProvider>
              </NavigationReadyProvider>
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(Layout);
