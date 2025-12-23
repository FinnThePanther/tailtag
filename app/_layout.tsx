// app/_layout.tsx
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSegments, Stack, Redirect, useNavigationContainerRef } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryCache, QueryClient, QueryClientProvider, MutationCache, useQuery } from "@tanstack/react-query";

import { AuthProvider, useAuth, usePrimeUserData } from "../src/features/auth";
import { createProfileQueryOptions } from "../src/features/profile";
import { useSyncProviderAvatar } from "../src/features/profile/hooks/useSyncProviderAvatar";
import { colors } from "../src/theme";
import { ToastProvider } from "../src/hooks/useToast";
import { DailyTaskToastManager } from "../src/features/daily-tasks/components/DailyTaskToastManager";
import { AchievementToastManager } from "../src/features/achievements";
import { CatchConfirmationToastManager } from "../src/features/catch-confirmations";
import { PushNotificationManager } from "../src/features/push-notifications";
import {
  Sentry,
  addMonitoringBreadcrumb,
  captureHandledException,
  routingInstrumentation,
} from "../src/lib/sentry";
import { handleAuthError } from "../src/lib/authErrorHandler";

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
  const userId = session?.user.id ?? null;

  const {
    data: profile,
    isLoading: isProfileLoading,
    isFetching: isProfileFetching,
    error: profileError,
  } = useQuery({
    ...createProfileQueryOptions(userId ?? ""),
    enabled: Boolean(userId),
  });

  usePrimeUserData(session?.user.id ?? null);
  useSyncProviderAvatar({ session, profile });

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

  const shouldGateOnboarding =
    Boolean(session) &&
    !profileError &&
    profile !== null && // Explicit null check - don't gate while loading
    (profile?.is_new === true || profile?.onboarding_completed !== true);

  if (session && shouldGateOnboarding && !inOnboardingFlow) {
    if ((isProfileLoading || isProfileFetching) && !profile && !profileError) {
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

  if (session && inOnboardingFlow && !shouldGateOnboarding && !isProfileLoading && !isProfileFetching) {
    return <Redirect href="/" />;
  }

  if (session && inOnboardingFlow && (isProfileLoading || isProfileFetching) && !profileError) {
    return <LoadingScreen />;
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

      {/* Achievements */}
      <Stack.Screen name="achievements/index" options={{ title: 'Achievements' }} />

      {/* Daily tasks */}
      <Stack.Screen name="daily-tasks/index" options={{ title: 'Daily Tasks' }} />

      {/* Show My QR */}
      <Stack.Screen name="show-qr" options={{ title: 'Show My QR', presentation: 'modal' }} />

      {/* OAuth callback (deep link landing) */}
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
    </Stack>
  );
}

function Layout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            captureHandledException(error, {
              scope: "react-query.query",
              queryHash: query?.queryHash,
              queryKey: query?.queryKey,
            });
            // Handle auth errors globally - force sign out on 401
            void handleAuthError(error);
          },
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            captureHandledException(error, {
              scope: "react-query.mutation",
              mutationId: mutation?.mutationId,
              mutationKey: mutation?.options?.mutationKey,
            });
            // Handle auth errors globally - force sign out on 401
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
      <SafeAreaProvider>
        <StatusBar style="light" />
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <PushNotificationManager />
              <AchievementToastManager />
              <DailyTaskToastManager />
              <CatchConfirmationToastManager />
              <RootLayoutNav />
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(Layout);
