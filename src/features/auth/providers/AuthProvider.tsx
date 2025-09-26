import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { Session } from '@supabase/supabase-js';

import { supabase } from '../../../lib/supabase';

type AuthStatus = 'loading' | 'signed_in' | 'signed_out';

type AuthContextValue = {
  session: Session | null;
  status: AuthStatus;
  error: string | null;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const resolveSession = async () => {
      try {
        const {
          data: { session: activeSession },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (!isMounted) {
          return;
        }

        if (sessionError) {
          setError(sessionError.message);
          setSession(null);
          setStatus('signed_out');
          return;
        }

        setSession(activeSession ?? null);
        setStatus(activeSession ? 'signed_in' : 'signed_out');
        setError(null);
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        const fallbackMessage =
          caughtError instanceof Error
            ? caughtError.message
            : 'Unable to resolve auth session.';
        setError(fallbackMessage);
        setSession(null);
        setStatus('signed_out');
      }
    };

    resolveSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setStatus(nextSession ? 'signed_in' : 'signed_out');
      setError(null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshSession = async () => {
    const {
      data: { session: refreshedSession },
      error: refreshError,
    } = await supabase.auth.getSession();

    if (refreshError) {
      setError(refreshError.message);
      setSession(null);
      setStatus('signed_out');
      return;
    }

    setSession(refreshedSession ?? null);
    setStatus(refreshedSession ? 'signed_in' : 'signed_out');
    setError(null);
  };

  const value = useMemo(
    () => ({
      session,
      status,
      error,
      refreshSession,
    }),
    [session, status, error]
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
