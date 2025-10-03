// app/_layout.tsx
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSegments, Stack, Redirect } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthProvider, useAuth, usePrimeUserData } from "../src/features/auth";
import { colors } from "../src/theme";
import { ToastProvider } from "../src/hooks/useToast";

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

  usePrimeUserData(session?.user.id ?? null);

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

  // Normal app stack. Android back will "go back" automatically if there's history.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Auth group */}
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />

      {/* Main app (tabs) */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* Standalone fursuit flows */}
      <Stack.Screen name="fursuits/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="fursuits/[id]/edit" options={{ headerShown: false }} />

      {/* Achievements */}
      <Stack.Screen name="achievements/index" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function Layout() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ToastProvider>
              <SafeAreaView
                style={{ flex: 1, backgroundColor: colors.background }}
                edges={["top", "left", "right", "bottom"]}
              >
                <RootLayoutNav />
              </SafeAreaView>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
