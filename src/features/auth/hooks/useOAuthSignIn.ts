import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Provider } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '../../../lib/supabase';
import { completeOAuthSessionFromUrl, getOAuthRedirectUri, setPendingOAuthProvider } from '../utils/oauth';

WebBrowser.maybeCompleteAuthSession();

type SupportedProvider = Extract<Provider, 'apple' | 'discord' | 'google'>;

type OAuthErrorState = string | null;

const formatErrorMessage = (input: unknown) =>
  input instanceof Error ? input.message : 'Unable to complete sign-in. Please try again.';

const PROVIDER_OPTIONS: Partial<Record<SupportedProvider, { scopes?: string }>> = {
  google: {
    scopes: 'openid email profile',
  },
};

export function useOAuthSignIn() {
  const [activeProvider, setActiveProvider] = useState<SupportedProvider | null>(null);
  const [error, setError] = useState<OAuthErrorState>(null);

  const redirectUri = useMemo(() => getOAuthRedirectUri(), []);

  const resolveSessionFromUrl = useCallback(async (url: string) => {
    try {
      const handled = await completeOAuthSessionFromUrl(url);

      if (handled) {
        setError(null);
      }

      return handled;
    } catch (caught) {
      setError(formatErrorMessage(caught));
      return false;
    }
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      void resolveSessionFromUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [resolveSessionFromUrl]);

  useEffect(() => {
    let isMounted = true;

    const checkInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();

      if (!initialUrl || !isMounted) {
        return;
      }

      await resolveSessionFromUrl(initialUrl);
    };

    void checkInitialUrl();

    return () => {
      isMounted = false;
    };
  }, [resolveSessionFromUrl]);

  const signInWithProvider = useCallback(
    async (provider: SupportedProvider) => {
      if (activeProvider) {
        return;
      }

      setActiveProvider(provider);
      setError(null);

      try {
        setPendingOAuthProvider(provider);
        const providerSpecificOptions = PROVIDER_OPTIONS[provider];

        const { data, error: authError } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: redirectUri,
            skipBrowserRedirect: true,
            ...providerSpecificOptions,
          },
        });

        if (authError) {
          throw authError;
        }

        if (!data?.url) {
          throw new Error('Unable to start the sign-in flow. Try again in a moment.');
        }

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);

        if (result.type === 'success' && result.url) {
          const handled = await resolveSessionFromUrl(result.url);

          if (!handled) {
            throw new Error('Sign-in did not return a valid session.');
          }

          return;
        }

        if (result.type === 'cancel' || result.type === 'dismiss') {
          throw new Error('Sign-in was canceled.');
        }

        throw new Error('Unable to complete the sign-in flow. Please try again.');
      } catch (caught) {
        setPendingOAuthProvider(null);
        setError(formatErrorMessage(caught));
        throw caught;
      } finally {
        setPendingOAuthProvider(null);
        setActiveProvider(null);
      }
    },
    [activeProvider, redirectUri, resolveSessionFromUrl]
  );

  return {
    signInWithProvider,
    activeProvider,
    error,
  };
}
