import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Session } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';
import {
  addMonitoringBreadcrumb,
  captureCriticalError,
  captureSupabaseError,
  setUser,
} from '../../../lib/sentry';
import { registerForceSignOut, unregisterForceSignOut } from '../../../lib/authErrorHandler';

type AuthStatus = 'loading' | 'signed_in' | 'signed_out';

type AuthContextValue = {
  session: Session | null;
  status: AuthStatus;
  error: string | null;
  refreshSession: () => Promise<void>;
  forceSignOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const resolveSession = async () => {
      addMonitoringBreadcrumb({
        category: 'auth',
        message: 'Resolving initial session',
      });

      try {
        const {
          data: { session: activeSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!isMounted) {
          return;
        }

        if (sessionError) {
          captureSupabaseError(
            sessionError,
            {
              scope: 'auth.resolveSession',
              action: 'getSession',
            },
            'critical',
          );
          setError(sessionError.message);
          setSession(null);
          setStatus('signed_out');
          setUser(null);
          return;
        }

        supabase.realtime.setAuth(activeSession?.access_token ?? '');

        setSession(activeSession ?? null);
        setStatus(activeSession ? 'signed_in' : 'signed_out');
        setError(null);
        setUser(
          activeSession?.user
            ? {
                id: activeSession.user.id,
                email: activeSession.user.email ?? null,
              }
            : null,
        );

        addMonitoringBreadcrumb({
          category: 'auth',
          message: activeSession ? 'Session restored' : 'No session',
          data: {
            userId: activeSession?.user.id ?? null,
          },
        });
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        captureCriticalError(caughtError, {
          scope: 'auth.resolveSession',
          action: 'unexpected',
        });

        const fallbackMessage =
          caughtError instanceof Error ? caughtError.message : 'Unable to resolve auth session.';
        setError(fallbackMessage);
        setSession(null);
        setStatus('signed_out');
        setUser(null);
      }
    };

    resolveSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) {
        return;
      }

      supabase.realtime.setAuth(nextSession?.access_token ?? '');

      setSession(nextSession);
      setStatus(nextSession ? 'signed_in' : 'signed_out');
      setError(null);

      setUser(
        nextSession?.user
          ? {
              id: nextSession.user.id,
              email: nextSession.user.email ?? null,
            }
          : null,
      );

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
      subscription.unsubscribe();
    };
  }, []);

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
        supabase.realtime.setAuth(currentSession.access_token);
        setSession(currentSession);
        setStatus('signed_in');
        setError(null);
        setUser({
          id: currentSession.user.id,
          email: currentSession.user.email ?? null,
        });
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
      setError(refreshError.message);
      setSession(null);
      setStatus('signed_out');
      setUser(null);
      return;
    }

    // Update realtime auth with new token
    supabase.realtime.setAuth(refreshedSession?.access_token ?? '');

    setSession(refreshedSession ?? null);
    setStatus(refreshedSession ? 'signed_in' : 'signed_out');
    setError(null);

    setUser(
      refreshedSession?.user
        ? {
            id: refreshedSession.user.id,
            email: refreshedSession.user.email ?? null,
          }
        : null,
    );

    addMonitoringBreadcrumb({
      category: 'auth',
      message: 'Session refreshed',
      data: { userId: refreshedSession?.user.id ?? null },
    });
  }, []);

  const forceSignOut = useCallback(async () => {
    addMonitoringBreadcrumb({
      category: 'auth',
      message: 'Force sign-out',
    });

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
      supabase.realtime.setAuth('');
      setSession(null);
      setStatus('signed_out');
      setError(null);
      setUser(null);
    }
  }, []);

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
      forceSignOut,
    }),
    [session, status, error, refreshSession, forceSignOut],
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
