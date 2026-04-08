import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import type { Provider } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from '../../../lib/supabase';
import { completeOAuthSessionFromUrl, getOAuthRedirectUri, setPendingOAuthProvider } from '../utils/oauth';

WebBrowser.maybeCompleteAuthSession();

type SupportedProvider = Extract<Provider, 'apple' | 'discord' | 'google'>;

type OAuthErrorState = string | null;

const formatErrorMessage = (input: unknown) =>
  input instanceof Error ? input.message : 'Unable to complete sign-in. Please try again.';

const generateAppleNonce = () => {
  const bytes = new Uint8Array(16);
  Crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const hashAppleNonce = async (nonce: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);

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

  const signInWithAppleNative = useCallback(async () => {
    // Check if Apple Authentication is available
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Sign in with Apple is not available on this device.');
    }

    try {
      const rawNonce = generateAppleNonce();
      const hashedNonce = await hashAppleNonce(rawNonce);

      // Request Apple credential
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error('Apple sign-in did not return an identity token.');
      }


      // Exchange credential with Supabase
      const { data, error: authError } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        access_token: credential.authorizationCode ?? undefined,
        nonce: rawNonce,
      });

      if (authError) {
        throw authError;
      }

      if (!data.session) {
        throw new Error('Sign-in did not return a valid session.');
      }

      // Apple only provides fullName on the first sign-in attempt
      // Capture and save it immediately if available
      if (credential.fullName) {
        const fullName = [
          credential.fullName.givenName,
          credential.fullName.familyName,
        ]
          .filter(Boolean)
          .join(' ');

        const { error: updateError } = await supabase.auth.updateUser({
          data: {
            full_name: fullName || undefined,
            given_name: credential.fullName.givenName || undefined,
            family_name: credential.fullName.familyName || undefined,
          },
        });

        if (updateError) {
          // Name update is optional; silently ignore failure
        }
      }

      return;
    } catch (caught) {
      // Handle user cancellation gracefully
      if (
        caught instanceof Error &&
        (caught.message.includes('cancel') ||
          caught.message.includes('dismiss') ||
          caught.message.includes('1001'))
      ) {
        throw new Error('Sign-in was canceled.');
      }

      throw caught;
    }
  }, []);

  const signInWithProvider = useCallback(
    async (provider: SupportedProvider) => {
      if (activeProvider) {
        return;
      }

      setActiveProvider(provider);
      setError(null);

      try {
        setPendingOAuthProvider(provider);

        // Apple uses native authentication flow, not web OAuth
        if (provider === 'apple') {
          if (Platform.OS !== 'ios') {
            throw new Error('Sign in with Apple is only available on iOS devices.');
          }

          await signInWithAppleNative();
          setPendingOAuthProvider(null);
          setActiveProvider(null);
          return;
        }

        // Google and Discord use web-based OAuth
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
    [activeProvider, redirectUri, resolveSessionFromUrl, signInWithAppleNative]
  );

  return {
    signInWithProvider,
    activeProvider,
    error,
  };
}
