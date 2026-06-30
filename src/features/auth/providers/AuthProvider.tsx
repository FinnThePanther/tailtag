import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { Session } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';
import {
  addMonitoringBreadcrumb,
  captureCriticalError,
  captureNonCriticalError,
  captureSupabaseError,
  setUser,
} from '../../../lib/sentry';
import { registerForceSignOut, unregisterForceSignOut } from '../../../lib/authErrorHandler';
import { getUserVisibleErrorMessage } from '@/lib/userVisibleErrors';

type AuthStatus = 'loading' | 'checking_session' | 'signed_in' | 'signed_out';

type AuthContextValue = {
  session: Session | null;
  status: AuthStatus;
  error: string | null;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<{ error: unknown | null }>;
  forceSignOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const statusRef = useRef<AuthStatus>('loading');
  const isRevalidatingSessionRef = useRef(false);
  const pendingSignedOutDuringCheckRef = useRef(false);
  const intentionalSignOutRef = useRef(false);
  const isMountedRef = useRef(false);

  const setAuthState = useCallback((nextSession: Session | null, nextStatus: AuthStatus) => {
    if (!isMountedRef.current) {
      return;
    }

    sessionRef.current = nextSession;
    statusRef.current = nextStatus;

    supabase.realtime.setAuth(nextSession?.access_token ?? '');

    setSession(nextSession);
    setStatus(nextStatus);
    setUser(
      nextSession?.user
        ? {
            id: nextSession.user.id,
            email: nextSession.user.email ?? null,
          }
        : null,
    );
  }, []);

  const applySession = useCallback(
    (nextSession: Session | null) => {
      pendingSignedOutDuringCheckRef.current = false;
      setAuthState(nextSession, nextSession ? 'signed_in' : 'signed_out');
      setError(null);
    },
    [setAuthState],
  );

  const enterSessionCheck = useCallback((source: string) => {
    if (!sessionRef.current || statusRef.current === 'checking_session') {
      return;
    }

    statusRef.current = 'checking_session';
    setStatus('checking_session');

    addMonitoringBreadcrumb({
      category: 'auth',
      message: 'Checking existing session',
      data: {
        source,
        userId: sessionRef.current.user.id,
      },
    });
  }, []);

  const resolveSession = useCallback(
    async (source: 'initial' | 'foreground') => {
      const hadSession = Boolean(sessionRef.current);

      if (source === 'foreground') {
        enterSessionCheck(source);
        isRevalidatingSessionRef.current = true;
        pendingSignedOutDuringCheckRef.current = false;
      }

      addMonitoringBreadcrumb({
        category: 'auth',
        message:
          source === 'initial' ? 'Resolving initial session' : 'Resolving foreground session',
      });

      try {
        const {
          data: { session: activeSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!isMountedRef.current) {
          return;
        }

        if (sessionError) {
          captureSupabaseError(
            sessionError,
            {
              scope: 'auth.resolveSession',
              action: 'getSession',
              source,
            },
            source === 'foreground' ? 'non-critical' : 'critical',
          );

          if (source === 'foreground' && hadSession && !pendingSignedOutDuringCheckRef.current) {
            setAuthState(sessionRef.current, 'signed_in');
            setError(getUserVisibleErrorMessage(sessionError, 'Unable to refresh auth session.'));
            return;
          }

          applySession(null);
          setError(getUserVisibleErrorMessage(sessionError, 'Unable to resolve auth session.'));
          return;
        }

        applySession(activeSession ?? null);

        addMonitoringBreadcrumb({
          category: 'auth',
          message: activeSession ? 'Session restored' : 'No session',
          data: {
            source,
            userId: activeSession?.user.id ?? null,
          },
        });
      } catch (caughtError) {
        if (!isMountedRef.current) {
          return;
        }

        captureCriticalError(caughtError, {
          scope: 'auth.resolveSession',
          action: 'unexpected',
          source,
        });

        if (source === 'foreground' && hadSession && !pendingSignedOutDuringCheckRef.current) {
          setAuthState(sessionRef.current, 'signed_in');
          setError(getUserVisibleErrorMessage(caughtError, 'Unable to refresh auth session.'));
          return;
        }

        applySession(null);
        setError(getUserVisibleErrorMessage(caughtError, 'Unable to resolve auth session.'));
      } finally {
        if (source === 'foreground') {
          isRevalidatingSessionRef.current = false;
          pendingSignedOutDuringCheckRef.current = false;
        }
      }
    },
    [applySession, enterSessionCheck, setAuthState],
  );

  useEffect(() => {
    let isMounted = true;
    isMountedRef.current = true;

    void resolveSession('initial');

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) {
        return;
      }

      if (
        event === 'SIGNED_OUT' &&
        isRevalidatingSessionRef.current &&
        sessionRef.current &&
        !intentionalSignOutRef.current
      ) {
        pendingSignedOutDuringCheckRef.current = true;
        enterSessionCheck('auth-state-change');

        addMonitoringBreadcrumb({
          category: 'auth',
          message: 'Deferring signed-out event during session check',
          data: {
            event,
            userId: sessionRef.current.user.id,
          },
        });
        return;
      }

      applySession(nextSession);

      addMonitoringBreadcrumb({
        category: 'auth',
        message: 'Auth state change',
        data: {
          event,
          userId: nextSession?.user.id ?? null,
        },
      });
    });

    return () => {
      isMounted = false;
      isMountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [applySession, enterSessionCheck, resolveSession]);

  useEffect(() => {
    const captureAutoRefreshError = (caught: unknown, action: 'start' | 'stop') => {
      captureNonCriticalError(caught, {
        scope: 'auth.autoRefresh',
        action,
      });
    };

    const startAutoRefresh = () => {
      void supabase.auth.startAutoRefresh().catch((caught) => {
        captureAutoRefreshError(caught, 'start');
      });
    };

    const stopAutoRefresh = () => {
      void supabase.auth.stopAutoRefresh().catch((caught) => {
        captureAutoRefreshError(caught, 'stop');
      });
    };

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void resolveSession('foreground');
        startAutoRefresh();
        return;
      }

      stopAutoRefresh();
    };

    if (AppState.currentState === 'active') {
      startAutoRefresh();
    }

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription.remove();
      stopAutoRefresh();
    };
  }, [resolveSession]);

  const refreshSession = useCallback(async () => {
    addMonitoringBreadcrumb({
      category: 'auth',
      message: 'Refreshing session',
    });

    // First try to refresh the token
    const {
      data: { session: refreshedSession },
      error: refreshError,
    } = await supabase.auth.refreshSession();

    if (refreshError) {
      // If refresh fails, try to get the current session as fallback
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (currentSession) {
        // We have a valid cached session, use it
        applySession(currentSession);
        return;
      }

      // No valid session at all
      captureSupabaseError(
        refreshError,
        {
          scope: 'auth.refreshSession',
          action: 'refreshSession',
        },
        'critical',
      );
      applySession(null);
      setError(getUserVisibleErrorMessage(refreshError, 'Unable to refresh auth session.'));
      return;
    }

    // Update realtime auth with new token
    applySession(refreshedSession ?? null);

    addMonitoringBreadcrumb({
      category: 'auth',
      message: 'Session refreshed',
      data: { userId: refreshedSession?.user.id ?? null },
    });
  }, [applySession]);

  const signOut = useCallback(async () => {
    addMonitoringBreadcrumb({
      category: 'auth',
      message: 'User sign-out',
    });

    intentionalSignOutRef.current = true;
    pendingSignedOutDuringCheckRef.current = false;

    try {
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        intentionalSignOutRef.current = false;
        captureSupabaseError(
          signOutError,
          {
            scope: 'auth.signOut',
            action: 'signOut',
          },
          'feature',
        );
        return { error: signOutError };
      }

      applySession(null);
      intentionalSignOutRef.current = false;
      return { error: null };
    } catch (caughtError) {
      intentionalSignOutRef.current = false;
      captureCriticalError(caughtError, {
        scope: 'auth.signOut',
        action: 'unexpected',
      });
      return { error: caughtError };
    }
  }, [applySession]);

  const forceSignOut = useCallback(async () => {
    addMonitoringBreadcrumb({
      category: 'auth',
      message: 'Force sign-out',
    });

    intentionalSignOutRef.current = true;
    pendingSignedOutDuringCheckRef.current = false;

    const authWithInternals = supabase.auth as unknown as {
      _removeSession?: () => Promise<unknown>;
    };

    try {
      if (typeof authWithInternals._removeSession === 'function') {
        await authWithInternals._removeSession();
      } else {
        const { error: localSignOutError } = await supabase.auth.signOut({ scope: 'local' });

        if (localSignOutError) {
          captureSupabaseError(
            localSignOutError,
            {
              scope: 'auth.forceSignOut',
              action: 'signOutLocal',
            },
            'critical',
          );
        }
      }
    } catch (caughtError) {
      captureCriticalError(caughtError, {
        scope: 'auth.forceSignOut',
        action: 'unexpected',
      });
    } finally {
      applySession(null);
      intentionalSignOutRef.current = false;
    }
  }, [applySession]);

  // Register force sign out handler for global auth error handling
  useEffect(() => {
    registerForceSignOut(forceSignOut);
    return () => {
      unregisterForceSignOut();
    };
  }, [forceSignOut]);

  const value = useMemo(
    () => ({
      session,
      status,
      error,
      refreshSession,
      signOut,
      forceSignOut,
    }),
    [session, status, error, refreshSession, signOut, forceSignOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
