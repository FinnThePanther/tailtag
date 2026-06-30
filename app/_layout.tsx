// app/_layout.tsx
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import {
  useSegments,
  Stack,
  Redirect,
  useNavigationContainerRef,
  useRouter,
  usePathname,
  useGlobalSearchParams,
} from 'expo-router';
import type { Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  MutationCache,
  useQuery,
} from '@tanstack/react-query';

import { AuthProvider, useAuth, usePrimeUserData } from '../src/features/auth';
import { shouldRedirectToAuth } from '@/features/auth/providers/authResumeState';
import { NavigationReadyProvider, useSetNavigationReady } from '../src/hooks/useNavigationReady';
import { OtaUpdateProvider } from '../src/hooks/useOtaUpdateCheck';
import {
  clearPendingOtaRestore,
  loadPendingOtaRestore,
  saveLatestOtaRestoreRoute,
} from '@/hooks/otaRestoreStorage';
import { createOtaRestoreHref, resolvePendingOtaRestoreSnapshot } from '@/hooks/otaRestoreState';
import { createProfileQueryOptions } from '../src/features/profile';
import { profileNeedsAgeAttestation } from '../src/features/adult-boundary';
import { profileNeedsLegalConsent } from '../src/features/legal-consent';
import { colors } from '../src/theme';
import { ToastProvider } from '../src/hooks/useToast';
import { DailyTaskToastManager } from '../src/features/daily-tasks/components/DailyTaskToastManager';
import { AchievementToastManager } from '../src/features/achievements';
import { CatchConfirmationToastManager } from '../src/features/catch-confirmations';
import { MySuitsOrderSyncManager } from '../src/features/suits';
import {
  loadPendingCatchInviteToken,
  savePendingCatchInviteToken,
  subscribePendingCatchInviteToken,
} from '../src/features/catch-invites';
import { CatchOutboxSyncManager } from '../src/features/catch-outbox';
import { PushNotificationManager } from '../src/features/push-notifications';
import {
  Sentry,
  addMonitoringBreadcrumb,
  captureFeatureError,
  captureNonCriticalError,
  routingInstrumentation,
} from '../src/lib/sentry';
import { handleAuthError } from '../src/lib/authErrorHandler';
import { SuspensionGate } from '../src/features/moderation';
import { EnvironmentBanner } from '../src/components/EnvironmentBanner';
import { TailTagButton } from '../src/components/ui/TailTagButton';
import {
  completeRecoverySessionFromUrl,
  getCompletedRecoverySessionMarker,
  getRecoverySessionParams,
  RECOVERY_SESSION_ERROR_PARAM,
  RECOVERY_SESSION_ERROR_VALUE,
  RECOVERY_SESSION_READY_PARAM,
} from '../src/features/auth/utils/recovery';

function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator
        size="large"
        color={colors.primary}
      />
    </View>
  );
}

function extractCatchInviteToken(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = Linking.parse(url);
    const pathParts = (parsed.path ?? '').split('/').filter(Boolean);
    const inviteIndex = pathParts.indexOf('invite');
    const pathToken =
      inviteIndex !== -1 && pathParts[inviteIndex + 1] ? pathParts[inviteIndex + 1] : null;
    const hostToken = parsed.hostname === 'invite' && pathParts[0] ? pathParts[0] : null;
    const queryToken =
      typeof parsed.queryParams?.token === 'string' ? parsed.queryParams.token : null;
    const token = pathToken ?? hostToken ?? queryToken;

    return token && /^[A-Za-z0-9_-]{32,160}$/.test(token) ? token : null;
  } catch {
    return null;
  }
}

function createInviteHref(token: string): Href {
  return {
    pathname: '/invite/[token]',
    params: { token },
  };
}

function BlockingProfileError({
  message,
  onRetry,
  isRetrying,
}: {
  message: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        backgroundColor: colors.background,
      }}
    >
      <Text
        style={{
          color: colors.foreground,
          fontSize: 20,
          fontWeight: '700',
          textAlign: 'center',
        }}
      >
        We could not load your profile
      </Text>
      <Text
        style={{
          color: colors.textMuted,
          fontSize: 14,
          lineHeight: 20,
          textAlign: 'center',
        }}
      >
        {message}
      </Text>
      <TailTagButton
        variant="outline"
        onPress={onRetry}
        loading={isRetrying}
      >
        Try again
      </TailTagButton>
    </View>
  );
}

/**
 * Auth-aware root layout:
 * - Uses <Redirect /> for gating (replaces history cleanly).
 * - No BackHandler: rely on Expo Router's default Android back behavior.
 */
function RootLayoutNav() {
  const router = useRouter();
  const { status, session } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const globalSearchParams = useGlobalSearchParams() as Record<
    string,
    string | string[] | undefined
  >;
  const firstSegment = segments[0];
  const secondSegment = segments.at(1);
  const inAuthGroup = firstSegment === '(auth)';
  const inAuthCallbackFlow = firstSegment === 'auth' && secondSegment === 'callback';
  const inOnboardingFlow = firstSegment === 'onboarding';
  const inInviteFlow = firstSegment === 'invite';
  const inAgeGateFlow = firstSegment === 'age-gate';
  const inLegalConsentFlow = firstSegment === 'legal-consent';
  const inResetPasswordFlow = firstSegment === 'reset-password';
  const inPublicAuthFlow = inAuthGroup || inAuthCallbackFlow || inResetPasswordFlow;
  const userId = session?.user.id ?? null;
  const setNavigationReady = useSetNavigationReady();
  const initialRecoveryUrlCheckKeyRef = useRef<string | null>(null);
  const completedInitialRecoveryUrlRef = useRef<string | null>(null);
  const initialInviteUrlCheckKeyRef = useRef<string | null>(null);
  const hasStartedOtaRestoreRef = useRef(false);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const [hasLoadedPendingInviteToken, setHasLoadedPendingInviteToken] = useState(false);
  const [hasCheckedInitialInviteUrl, setHasCheckedInitialInviteUrl] = useState(false);
  const [hasCheckedInitialRecoveryUrl, setHasCheckedInitialRecoveryUrl] = useState(false);
  const [hasResolvedOtaRestore, setHasResolvedOtaRestore] = useState(false);

  const {
    data: profile,
    isLoading: isProfileLoading,
    isFetching: isProfileFetching,
    error: profileError,
    refetch: refetchProfile,
  } = useQuery({
    ...createProfileQueryOptions(userId ?? ''),
    enabled: Boolean(userId),
    refetchInterval: 5 * 60_000,
  });

  usePrimeUserData(session?.user.id ?? null);

  const hasCompletedOnboarding = profile?.onboarding_completed === true;
  const hasProfileBlockingError = Boolean(session) && Boolean(profileError);
  const shouldGateLegalConsent =
    Boolean(session) &&
    !hasProfileBlockingError &&
    profile !== null &&
    profileNeedsLegalConsent(profile);
  const shouldGateAgeAttestation =
    Boolean(session) &&
    !hasProfileBlockingError &&
    profile !== null &&
    !shouldGateLegalConsent &&
    profileNeedsAgeAttestation(profile);
  const shouldGateOnboarding =
    Boolean(session) &&
    !hasProfileBlockingError &&
    profile !== null && // Explicit null check - don't gate while loading
    !shouldGateLegalConsent &&
    !shouldGateAgeAttestation &&
    (profile?.is_new === true || !hasCompletedOnboarding);
  const isSuspended =
    Boolean(session) &&
    profile?.is_suspended === true &&
    (!profile.suspended_until || new Date(profile.suspended_until) > new Date());

  const shouldShowOnboardingRedirectLoading =
    !inResetPasswordFlow &&
    Boolean(session) &&
    shouldGateOnboarding &&
    !inOnboardingFlow &&
    (isProfileLoading || isProfileFetching) &&
    !profile &&
    !hasProfileBlockingError;

  const shouldShowAgeGateRedirectLoading =
    !inResetPasswordFlow &&
    Boolean(session) &&
    !inAgeGateFlow &&
    (isProfileLoading || isProfileFetching) &&
    !profile &&
    !hasProfileBlockingError;

  const shouldResolvePostAuthDestination =
    Boolean(session) &&
    inAuthGroup &&
    !hasProfileBlockingError &&
    !profile &&
    (isProfileLoading || isProfileFetching);

  const postGateHomeHref: Href = pendingInviteToken ? createInviteHref(pendingInviteToken) : '/';

  let redirectHref: Href | null = null;

  if (shouldRedirectToAuth(status, Boolean(session), inPublicAuthFlow)) {
    redirectHref = '/auth';
  } else if (
    !inResetPasswordFlow &&
    session &&
    shouldGateLegalConsent &&
    !inLegalConsentFlow &&
    !inAuthGroup
  ) {
    redirectHref = '/legal-consent';
  } else if (
    !inResetPasswordFlow &&
    session &&
    shouldGateAgeAttestation &&
    !inAgeGateFlow &&
    !inAuthGroup
  ) {
    redirectHref = '/age-gate';
  } else if (
    session &&
    inAuthGroup &&
    !hasProfileBlockingError &&
    !shouldResolvePostAuthDestination
  ) {
    redirectHref = shouldGateLegalConsent
      ? '/legal-consent'
      : shouldGateAgeAttestation
        ? '/age-gate'
        : shouldGateOnboarding
          ? '/onboarding'
          : postGateHomeHref;
  } else if (
    !inResetPasswordFlow &&
    session &&
    shouldGateOnboarding &&
    !inOnboardingFlow &&
    !shouldShowOnboardingRedirectLoading
  ) {
    redirectHref = '/onboarding';
  } else if (
    session &&
    inAgeGateFlow &&
    !shouldGateAgeAttestation &&
    !isProfileLoading &&
    !isProfileFetching
  ) {
    redirectHref = shouldGateOnboarding ? '/onboarding' : postGateHomeHref;
  } else if (
    session &&
    inOnboardingFlow &&
    hasCompletedOnboarding &&
    !isProfileLoading &&
    !isProfileFetching
  ) {
    redirectHref = postGateHomeHref;
  }

  const shouldShowLoadingScreen =
    status === 'loading' || shouldShowOnboardingRedirectLoading || shouldShowAgeGateRedirectLoading;
  const hasPendingInitialRoutingCheck =
    !hasLoadedPendingInviteToken || !hasCheckedInitialInviteUrl || !hasCheckedInitialRecoveryUrl;
  const canRestoreOtaRoute =
    Boolean(session) &&
    status === 'signed_in' &&
    !hasPendingInitialRoutingCheck &&
    !shouldShowLoadingScreen &&
    !redirectHref &&
    !shouldResolvePostAuthDestination &&
    !pendingInviteToken &&
    !inPublicAuthFlow &&
    !shouldGateLegalConsent &&
    !shouldGateAgeAttestation &&
    !shouldGateOnboarding &&
    !hasProfileBlockingError &&
    !isSuspended;

  useEffect(() => {
    if (hasProfileBlockingError && !inResetPasswordFlow) {
      return;
    }

    if (shouldShowLoadingScreen || redirectHref || !hasResolvedOtaRestore) {
      return;
    }

    setNavigationReady();
  }, [
    hasProfileBlockingError,
    hasResolvedOtaRestore,
    inResetPasswordFlow,
    redirectHref,
    setNavigationReady,
    shouldShowLoadingScreen,
  ]);

  useEffect(() => {
    if (
      !session ||
      !inAuthGroup ||
      shouldResolvePostAuthDestination ||
      (hasProfileBlockingError && !inResetPasswordFlow)
    ) {
      return;
    }

    router.replace(
      shouldGateLegalConsent
        ? '/legal-consent'
        : shouldGateAgeAttestation
          ? '/age-gate'
          : shouldGateOnboarding
            ? '/onboarding'
            : postGateHomeHref,
    );
  }, [
    inAuthGroup,
    router,
    session,
    hasProfileBlockingError,
    inResetPasswordFlow,
    shouldGateLegalConsent,
    shouldGateAgeAttestation,
    shouldGateOnboarding,
    shouldResolvePostAuthDestination,
    postGateHomeHref,
  ]);

  useEffect(() => {
    let isMounted = true;
    setHasLoadedPendingInviteToken(false);

    const rememberInviteToken = async (incomingUrl: string | null | undefined) => {
      const token = extractCatchInviteToken(incomingUrl);
      if (!token) {
        return;
      }

      await savePendingCatchInviteToken(token);
      if (isMounted) {
        setPendingInviteToken(token);
      }
    };

    void loadPendingCatchInviteToken().then((token) => {
      if (isMounted) {
        setPendingInviteToken(token);
        setHasLoadedPendingInviteToken(true);
      }
    });

    const unsubscribePendingInviteToken = subscribePendingCatchInviteToken((token) => {
      if (isMounted) {
        setPendingInviteToken(token);
      }
    });

    const subscription = Linking.addEventListener('url', (event) => {
      void rememberInviteToken(event.url);
    });

    const initialUrlCheckKey = session ? 'signed_in' : 'signed_out';
    if (initialInviteUrlCheckKeyRef.current !== initialUrlCheckKey) {
      initialInviteUrlCheckKeyRef.current = initialUrlCheckKey;
      setHasCheckedInitialInviteUrl(false);
      void Linking.getInitialURL()
        .then((initialUrl) => rememberInviteToken(initialUrl))
        .catch((caught) => {
          captureNonCriticalError(caught, {
            scope: 'catchInvite.initialUrl',
            action: 'getInitialURL',
          });
        })
        .finally(() => {
          if (isMounted) {
            setHasCheckedInitialInviteUrl(true);
          }
        });
    } else {
      setHasCheckedInitialInviteUrl(true);
    }

    return () => {
      isMounted = false;
      unsubscribePendingInviteToken();
      subscription.remove();
    };
  }, [session]);

  useEffect(() => {
    if (
      !session ||
      !pendingInviteToken ||
      inInviteFlow ||
      inAuthGroup ||
      shouldGateLegalConsent ||
      shouldGateAgeAttestation ||
      shouldGateOnboarding ||
      hasProfileBlockingError ||
      isProfileLoading ||
      isProfileFetching
    ) {
      return;
    }

    router.replace(createInviteHref(pendingInviteToken));
  }, [
    hasProfileBlockingError,
    inAuthGroup,
    inInviteFlow,
    isProfileFetching,
    isProfileLoading,
    pendingInviteToken,
    router,
    session,
    shouldGateAgeAttestation,
    shouldGateLegalConsent,
    shouldGateOnboarding,
  ]);

  useEffect(() => {
    if (status === 'loading') {
      return;
    }

    let isMounted = true;

    const routeToResetPassword = (marker: string) => {
      router.replace({
        pathname: '/reset-password',
        params: {
          [RECOVERY_SESSION_READY_PARAM]: marker,
        },
      });
    };

    const routeToResetPasswordError = () => {
      router.replace({
        pathname: '/reset-password',
        params: {
          [RECOVERY_SESSION_ERROR_PARAM]: RECOVERY_SESSION_ERROR_VALUE,
        },
      });
    };

    const handleRecoveryUrl = async (incomingUrl: string | null | undefined) => {
      if (!incomingUrl || inResetPasswordFlow) {
        return;
      }

      try {
        const hasRecoverySession = Boolean(getRecoverySessionParams(incomingUrl));

        if (!hasRecoverySession) {
          return;
        }

        if (completedInitialRecoveryUrlRef.current === incomingUrl) {
          return;
        }

        if (session) {
          if (isMounted) {
            routeToResetPasswordError();
          }

          return;
        }

        const handled = await completeRecoverySessionFromUrl(incomingUrl);

        const marker = getCompletedRecoverySessionMarker();

        if (handled && marker && isMounted) {
          completedInitialRecoveryUrlRef.current = incomingUrl;
          routeToResetPassword(marker);
        }
      } catch (caught) {
        captureFeatureError(caught, {
          scope: 'auth.passwordRecoveryLink',
          action: 'setSession',
        });

        if (isMounted) {
          routeToResetPasswordError();
        }
      }
    };

    const subscription = Linking.addEventListener('url', (event) => {
      void handleRecoveryUrl(event.url);
    });

    const initialUrlCheckKey = session ? 'signed_in' : 'signed_out';

    if (initialRecoveryUrlCheckKeyRef.current !== initialUrlCheckKey) {
      initialRecoveryUrlCheckKeyRef.current = initialUrlCheckKey;
      setHasCheckedInitialRecoveryUrl(false);

      void Linking.getInitialURL()
        .then((initialUrl) => handleRecoveryUrl(initialUrl))
        .catch((caught) => {
          captureNonCriticalError(caught, {
            scope: 'auth.passwordRecoveryLink',
            action: 'getInitialURL',
          });
        })
        .finally(() => {
          if (isMounted) {
            setHasCheckedInitialRecoveryUrl(true);
          }
        });
    } else {
      setHasCheckedInitialRecoveryUrl(true);
    }

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, [inResetPasswordFlow, router, session, status]);

  const currentOtaRestoreHref = createOtaRestoreHref(pathname, globalSearchParams);

  useEffect(() => {
    const userIdForRoute = session?.user.id;

    if (
      !userIdForRoute ||
      !hasResolvedOtaRestore ||
      !canRestoreOtaRoute ||
      !currentOtaRestoreHref
    ) {
      return;
    }

    void saveLatestOtaRestoreRoute({
      href: currentOtaRestoreHref,
      userId: userIdForRoute,
    });
  }, [canRestoreOtaRoute, currentOtaRestoreHref, hasResolvedOtaRestore, session?.user.id]);

  useEffect(() => {
    if (hasStartedOtaRestoreRef.current || hasResolvedOtaRestore) {
      return;
    }

    if (status === 'loading') {
      return;
    }

    if (!session) {
      hasStartedOtaRestoreRef.current = true;
      void clearPendingOtaRestore();
      setHasResolvedOtaRestore(true);
      return;
    }

    if (!canRestoreOtaRoute) {
      return;
    }

    let isMounted = true;
    hasStartedOtaRestoreRef.current = true;

    void loadPendingOtaRestore()
      .then(async (snapshot) => {
        const resolution = resolvePendingOtaRestoreSnapshot(snapshot, {
          now: Date.now(),
          userId: session.user.id,
          canRestore: canRestoreOtaRoute,
        });

        if (resolution.action === 'defer') {
          hasStartedOtaRestoreRef.current = false;
          return;
        }

        await clearPendingOtaRestore();

        if (resolution.action === 'restore' && isMounted) {
          router.replace(resolution.href as Href);
        }
      })
      .finally(() => {
        if (isMounted && hasStartedOtaRestoreRef.current) {
          setHasResolvedOtaRestore(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [canRestoreOtaRoute, hasResolvedOtaRestore, router, session, status]);

  if (status === 'loading') {
    return <LoadingScreen />;
  }

  // Not signed in: ensure we're in the auth stack.
  if (shouldRedirectToAuth(status, Boolean(session), inPublicAuthFlow)) {
    return <Redirect href="/auth" />;
  }

  if (session && profileError && !inResetPasswordFlow) {
    return (
      <BlockingProfileError
        message={profileError.message}
        onRetry={() => {
          void refetchProfile();
        }}
        isRetrying={isProfileFetching}
      />
    );
  }

  // Don't redirect mid-flow during password reset — the recovery session
  // makes the user appear authenticated, but they need to stay on this screen.
  if (inResetPasswordFlow) {
    // Fall through to normal Stack rendering below
  } else if (session && shouldGateLegalConsent && !inLegalConsentFlow && !inAuthGroup) {
    addMonitoringBreadcrumb({
      category: 'routing',
      message: 'Redirecting to legal consent',
      data: {
        userId,
        profileLegalTermsVersion: profile?.legal_terms_version,
        profileLegalTermsAcceptedAt: profile?.legal_terms_accepted_at,
        isProfileLoading,
        isProfileFetching,
      },
    });

    return <Redirect href="/legal-consent" />;
  } else if (session && shouldGateAgeAttestation && !inAgeGateFlow && !inAuthGroup) {
    if (shouldShowAgeGateRedirectLoading) {
      return <LoadingScreen />;
    }

    addMonitoringBreadcrumb({
      category: 'routing',
      message: 'Redirecting to age gate',
      data: {
        userId,
        profileIsAdult: profile?.is_adult,
        profileAgeGateVersion: profile?.age_gate_version,
        isProfileLoading,
        isProfileFetching,
      },
    });

    return <Redirect href="/age-gate" />;
  } else if (session && shouldGateOnboarding && !inOnboardingFlow && !inAuthGroup) {
    if (shouldShowOnboardingRedirectLoading) {
      return <LoadingScreen />;
    }

    // Log onboarding redirect for debugging
    addMonitoringBreadcrumb({
      category: 'routing',
      message: 'Redirecting to onboarding',
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

  if (
    session &&
    inLegalConsentFlow &&
    !shouldGateLegalConsent &&
    !isProfileLoading &&
    !isProfileFetching
  ) {
    return (
      <Redirect
        href={
          shouldGateAgeAttestation
            ? '/age-gate'
            : shouldGateOnboarding
              ? '/onboarding'
              : postGateHomeHref
        }
      />
    );
  }

  if (
    session &&
    inAgeGateFlow &&
    !shouldGateAgeAttestation &&
    !isProfileLoading &&
    !isProfileFetching
  ) {
    return <Redirect href={shouldGateOnboarding ? '/onboarding' : postGateHomeHref} />;
  }

  if (
    session &&
    inOnboardingFlow &&
    hasCompletedOnboarding &&
    !isProfileLoading &&
    !isProfileFetching
  ) {
    return <Redirect href={postGateHomeHref} />;
  }

  // Suspension gate: if user is suspended, show full-screen overlay
  if (isSuspended) {
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
      <Stack.Screen
        name="(auth)"
        options={{ headerShown: false }}
      />

      {/* Main app (tabs) - no header (tab navigator has its own) */}
      <Stack.Screen
        name="(tabs)"
        options={{ headerShown: false, title: '' }}
      />

      {/* Onboarding - no header (custom multi-step wizard) */}
      <Stack.Screen
        name="onboarding/index"
        options={{ headerShown: false }}
      />

      {/* Age attestation gate - no header */}
      <Stack.Screen
        name="age-gate"
        options={{ headerShown: false }}
      />

      {/* Legal/user policy acceptance gate - no header */}
      <Stack.Screen
        name="legal-consent"
        options={{ headerShown: false }}
      />

      {/* Standalone fursuit flows - has its own _layout.tsx */}
      <Stack.Screen
        name="fursuits"
        options={{ headerShown: false }}
      />

      {/* Catch detail screens */}
      <Stack.Screen
        name="catches"
        options={{ headerShown: false }}
      />

      {/* Invite catch claim flow */}
      <Stack.Screen
        name="invite"
        options={{ headerShown: false }}
      />

      {/* Public player profiles */}
      <Stack.Screen
        name="profile"
        options={{ headerShown: false }}
      />

      {/* Achievements */}
      <Stack.Screen
        name="achievements/index"
        options={{ headerShown: false }}
      />

      {/* Daily tasks */}
      <Stack.Screen
        name="daily-tasks/index"
        options={{ headerShown: false }}
      />

      {/* Leaderboard */}
      <Stack.Screen
        name="leaderboard"
        options={{ headerShown: false }}
      />

      {/* Convention screens */}
      <Stack.Screen
        name="conventions"
        options={{ headerShown: false }}
      />

      {/* Convention recaps */}
      <Stack.Screen
        name="convention-recaps"
        options={{ headerShown: false }}
      />

      {/* Blocked users management */}
      <Stack.Screen
        name="blocked-users"
        options={{ headerShown: false }}
      />

      {/* OAuth callback (deep link landing) */}
      <Stack.Screen
        name="auth/callback"
        options={{ headerShown: false }}
      />

      {/* Password reset completion (deep link landing) */}
      <Stack.Screen
        name="reset-password"
        options={{ headerShown: false }}
      />

      {/* In-app password change (authenticated) */}
      <Stack.Screen
        name="change-password"
        options={{ headerShown: false }}
      />
    </Stack>
  );
}

/** Query key prefixes that map to non-critical severity. */
const NON_CRITICAL_KEY_PREFIXES = [
  'convention-leaderboard',
  'convention-suit-leaderboard',
  'convention-suit-roster',
  'convention-recap-detail',
  'fursuit-species',
  'fursuit-colors',
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
  if (typeof error === 'object' && error !== null) {
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
              scope: 'react-query.query',
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
              scope: 'react-query.mutation',
              mutationId: mutation?.mutationId,
              mutationKey: mutation?.options?.mutationKey,
            });
            captureFeatureError(error, extras);
            void handleAuthError(error);
          },
        }),
      }),
  );
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    if (!navigationRef) {
      return;
    }

    if (navigationRef.current) {
      routingInstrumentation.registerNavigationContainer(navigationRef);
      addMonitoringBreadcrumb({
        category: 'navigation',
        message: 'Registered navigation container',
      });
      return;
    }

    // Expo Router sets the ref asynchronously; retry until it's available.
    const interval = setInterval(() => {
      if (navigationRef.current) {
        routingInstrumentation.registerNavigationContainer(navigationRef);
        addMonitoringBreadcrumb({
          category: 'navigation',
          message: 'Registered navigation container (delayed)',
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
                  <OtaUpdateProvider>
                    <PushNotificationManager />
                    <AchievementToastManager />
                    <DailyTaskToastManager />
                    <CatchConfirmationToastManager />
                    <CatchOutboxSyncManager />
                    <MySuitsOrderSyncManager />
                    <RootLayoutNav />
                  </OtaUpdateProvider>
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
