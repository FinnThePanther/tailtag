import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';

import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../src/components/ui/TailTagInput';
import { PasswordInput } from '../../src/components/ui/PasswordInput';
import { KeyboardAwareFormWrapper } from '../../src/components/ui/KeyboardAwareFormWrapper';
import { OAuthProviderButton } from '../../src/features/auth/components/OAuthProviderButton';
import { PasswordStrengthIndicator } from '../../src/features/auth/components/PasswordStrengthIndicator';
import { useOAuthSignIn } from '../../src/features/auth/hooks/useOAuthSignIn';
import {
  CURRENT_LEGAL_TERMS_VERSION,
  updateLegalTermsAcceptance,
} from '../../src/features/legal-consent';
import { buildGeneratedUsername, createProfileQueryOptions } from '../../src/features/profile';
import type { ProfileSummary } from '../../src/features/profile';
import { supabase } from '../../src/lib/supabase';
import { isValidEmail, mapAuthError, validatePassword } from '../../src/utils/authValidation';
import { styles } from '../../src/app-styles/(auth)/auth.styles';

type AuthMode = 'sign_in' | 'sign_up';

const TERMS_URL = 'https://playtailtag.com/terms';
const PRIVACY_URL = 'https://playtailtag.com/privacy';
const CHILD_SAFETY_URL = 'https://playtailtag.com/child-safety';
const POLICY_ACCEPTANCE_ERROR =
  "Please confirm that you're at least 13 and accept TailTag's policies before signing up.";
const APPLE_BUTTON_CORNER_RADIUS = 18;

export default function AuthScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AuthMode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hasAcceptedSignUpPolicies, setHasAcceptedSignUpPolicies] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendError, setResendError] = useState<string | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { signInWithProvider, activeProvider, error: oauthError } = useOAuthSignIn();

  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    setResendCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleResendEmail = useCallback(async () => {
    if (resendCooldown > 0) return;
    setResendError(null);
    try {
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
      });
      if (resendErr) throw resendErr;
      startCooldown();
    } catch (caught) {
      setResendError(mapAuthError(caught));
    }
  }, [email, resendCooldown, startCooldown]);

  const toggleMode = () => {
    setMode((current) => (current === 'sign_in' ? 'sign_up' : 'sign_in'));
    setError(null);
    setConfirmPassword('');
    setEmailSent(false);
    setHasAcceptedSignUpPolicies(false);
  };

  useEffect(() => {
    if (oauthError) {
      setError(oauthError);
    }
  }, [oauthError]);

  const openPolicyUrl = useCallback(async (url: string) => {
    await Linking.openURL(url);
  }, []);

  const recordAcceptedSignUpPolicies = useCallback(
    async (userId: string) => {
      const result = await updateLegalTermsAcceptance(userId);
      const profileQueryKey = createProfileQueryOptions(userId).queryKey;

      queryClient.setQueryData<ProfileSummary | null>(profileQueryKey, (current) =>
        current
          ? {
              ...current,
              legal_terms_accepted_at: result.acceptedAt,
              legal_terms_version: result.version,
            }
          : current,
      );
      await queryClient.invalidateQueries({ queryKey: profileQueryKey });
    },
    [queryClient],
  );

  const canStartSignUpAuth = useCallback(() => {
    if (mode === 'sign_up' && !hasAcceptedSignUpPolicies) {
      setError(POLICY_ACCEPTANCE_ERROR);
      return false;
    }

    return true;
  }, [hasAcceptedSignUpPolicies, mode]);

  const handleDiscordSignIn = async () => {
    if (isSubmitting) return;
    if (!canStartSignUpAuth()) return;
    setError(null);
    try {
      await signInWithProvider('discord', {
        recordLegalAcceptance: mode === 'sign_up' && hasAcceptedSignUpPolicies,
      });
    } catch {
      // Error state handled inside useOAuthSignIn
    }
  };

  const isDiscordLoading = activeProvider === 'discord';
  const isGoogleLoading = activeProvider === 'google';
  const isAppleLoading = activeProvider === 'apple';

  const handleGoogleSignIn = async () => {
    if (isSubmitting) return;
    if (!canStartSignUpAuth()) return;
    setError(null);
    try {
      await signInWithProvider('google', {
        recordLegalAcceptance: mode === 'sign_up' && hasAcceptedSignUpPolicies,
      });
    } catch {
      // Error state is surfaced by the hook
    }
  };

  const handleAppleSignIn = async () => {
    if (isSubmitting) return;
    if (!canStartSignUpAuth()) return;
    setError(null);
    try {
      await signInWithProvider('apple', {
        recordLegalAcceptance: mode === 'sign_up' && hasAcceptedSignUpPolicies,
      });
    } catch {
      // Error state is surfaced by the hook
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const trimmedEmail = email.trim();

    if (trimmedEmail.length === 0 || password.length === 0) {
      setError('Enter your email and password to continue.');
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (mode === 'sign_up') {
      if (!hasAcceptedSignUpPolicies) {
        setError(POLICY_ACCEPTANCE_ERROR);
        return;
      }

      const validation = validatePassword(password);
      if (!validation.isAcceptable) {
        setError("Your password doesn't meet all the requirements shown below.");
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === 'sign_up') {
        const legalTermsAcceptedAt = new Date().toISOString();
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              username: buildGeneratedUsername(trimmedEmail.split('@')[0], {
                forceSuffix: true,
              }),
              legal_terms_accepted_at: legalTermsAcceptedAt,
              legal_terms_version: CURRENT_LEGAL_TERMS_VERSION,
            },
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        if (!data.session) {
          // Email confirmation is enabled — show confirmation message
          setEmailSent(true);
          startCooldown();
          return;
        }

        await recordAcceptedSignUpPolicies(data.session.user.id);

        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInError) {
        throw signInError;
      }
    } catch (caught) {
      setError(mapAuthError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (emailSent) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={['top', 'bottom']}
      >
        <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>TailTag</Text>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              We sent a confirmation link to <Text style={styles.emailHighlight}>{email}</Text>. Tap
              the link to activate your account, then come back and sign in.
            </Text>
          </View>

          <TailTagCard style={styles.formCard}>
            <TailTagButton
              variant="outline"
              onPress={handleResendEmail}
              disabled={resendCooldown > 0}
            >
              {resendCooldown > 0
                ? `Resend email (${resendCooldown}s)`
                : 'Resend confirmation email'}
            </TailTagButton>

            {resendError ? <Text style={styles.errorText}>{resendError}</Text> : null}

            <TailTagButton
              variant="ghost"
              onPress={() => {
                setEmailSent(false);
                setResendError(null);
                setMode('sign_in');
              }}
            >
              Back to sign in
            </TailTagButton>
          </TailTagCard>
        </KeyboardAwareFormWrapper>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['top', 'bottom']}
    >
      <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>TailTag</Text>
          <Text style={styles.title}>
            {mode === 'sign_in' ? 'Welcome back' : 'Create your TailTag'}
          </Text>
          <Text style={styles.subtitle}>
            {mode === 'sign_in'
              ? 'Log in with email and password to keep tagging suits.'
              : 'Sign up with email and password to start your TailTag collection.'}
          </Text>
        </View>

        <TailTagCard style={styles.formCard}>
          <View style={styles.modeSwitcher}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'sign_in' }}
              onPress={() => {
                setMode('sign_in');
                setError(null);
                setConfirmPassword('');
                setHasAcceptedSignUpPolicies(false);
              }}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.modeOption,
                mode === 'sign_in' && styles.modeOptionActive,
                pressed && !isSubmitting && styles.modeOptionPressed,
              ]}
            >
              <Text
                style={[styles.modeOptionText, mode === 'sign_in' && styles.modeOptionTextActive]}
              >
                Log in
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: mode === 'sign_up' }}
              onPress={() => {
                setMode('sign_up');
                setError(null);
                setConfirmPassword('');
              }}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.modeOption,
                mode === 'sign_up' && styles.modeOptionActive,
                pressed && !isSubmitting && styles.modeOptionPressed,
              ]}
            >
              <Text
                style={[styles.modeOptionText, mode === 'sign_up' && styles.modeOptionTextActive]}
              >
                Sign up
              </Text>
            </Pressable>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TailTagInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              editable={!isSubmitting}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              autoComplete={mode === 'sign_in' ? 'password' : 'password-new'}
              placeholder={
                mode === 'sign_up' ? '8+ chars, mixed case, number, symbol' : 'Enter your password'
              }
              editable={!isSubmitting}
              returnKeyType={mode === 'sign_up' ? 'next' : 'done'}
              onSubmitEditing={mode === 'sign_in' ? handleSubmit : undefined}
            />
            {mode === 'sign_up' && <PasswordStrengthIndicator password={password} />}
          </View>

          {mode === 'sign_up' && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm password</Text>
              <PasswordInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                autoComplete="password-new"
                placeholder="Re-enter your password"
                editable={!isSubmitting}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>
          )}

          {mode === 'sign_up' && (
            <View style={styles.policyAcceptance}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: hasAcceptedSignUpPolicies }}
                onPress={() => setHasAcceptedSignUpPolicies((current) => !current)}
                disabled={isSubmitting}
                style={({ pressed }) => [
                  styles.checkboxRow,
                  pressed && !isSubmitting && styles.checkboxRowPressed,
                ]}
              >
                <View
                  style={[
                    styles.checkbox,
                    hasAcceptedSignUpPolicies && styles.checkboxChecked,
                    isSubmitting && styles.checkboxDisabled,
                  ]}
                >
                  {hasAcceptedSignUpPolicies ? (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color="#0f172a"
                    />
                  ) : null}
                </View>
                <Text style={styles.checkboxLabel}>
                  I confirm I am at least 13 years old and agree to TailTag's Terms, Privacy Policy,
                  and Child Safety Standards.
                </Text>
              </Pressable>

              <View style={styles.policyLinks}>
                <Text
                  style={styles.link}
                  onPress={() => void openPolicyUrl(TERMS_URL)}
                >
                  Terms
                </Text>
                <Text style={styles.policyLinkSeparator}>/</Text>
                <Text
                  style={styles.link}
                  onPress={() => void openPolicyUrl(PRIVACY_URL)}
                >
                  Privacy
                </Text>
                <Text style={styles.policyLinkSeparator}>/</Text>
                <Text
                  style={styles.link}
                  onPress={() => void openPolicyUrl(CHILD_SAFETY_URL)}
                >
                  Child Safety
                </Text>
              </View>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TailTagButton
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting || (mode === 'sign_up' && !hasAcceptedSignUpPolicies)}
          >
            {mode === 'sign_in' ? 'Log in' : 'Sign up'}
          </TailTagButton>

          <TailTagButton
            variant="ghost"
            onPress={toggleMode}
            disabled={isSubmitting}
          >
            {mode === 'sign_in' ? 'Need an account? Sign up' : 'Already have an account? Log in'}
          </TailTagButton>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>
              {mode === 'sign_in' ? 'or log in with' : 'or sign up with'}
            </Text>
            <View style={styles.dividerLine} />
          </View>

          {Platform.OS === 'ios' && (
            <View
              pointerEvents={isSubmitting || isAppleLoading ? 'none' : 'auto'}
              style={[
                styles.appleButtonWrapper,
                (isSubmitting || isAppleLoading) && styles.disabled,
              ]}
            >
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={
                  mode === 'sign_in'
                    ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                    : AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                }
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={APPLE_BUTTON_CORNER_RADIUS}
                onPress={handleAppleSignIn}
                style={styles.appleButton}
                accessibilityLabel={mode === 'sign_in' ? 'Log in with Apple' : 'Sign up with Apple'}
                accessibilityHint={
                  mode === 'sign_in'
                    ? 'Signs in with your Apple ID.'
                    : 'Creates a TailTag account with your Apple ID.'
                }
                accessibilityState={{ disabled: isSubmitting || isAppleLoading }}
              />
              {isAppleLoading ? (
                <View style={styles.appleLoadingOverlay}>
                  <ActivityIndicator color="#ffffff" />
                </View>
              ) : null}
            </View>
          )}

          <OAuthProviderButton
            provider="google"
            onPress={handleGoogleSignIn}
            loading={isGoogleLoading}
            disabled={isSubmitting}
            label={mode === 'sign_in' ? 'Sign in with Google' : 'Sign up with Google'}
            accessibilityLabel={mode === 'sign_in' ? 'Log in with Google' : 'Sign up with Google'}
            accessibilityHint={
              mode === 'sign_in'
                ? 'Opens Google to log in.'
                : 'Opens Google to create a TailTag account.'
            }
          />

          <OAuthProviderButton
            provider="discord"
            onPress={handleDiscordSignIn}
            loading={isDiscordLoading}
            disabled={isSubmitting}
            label={mode === 'sign_in' ? 'Sign in with' : 'Sign up with'}
            accessibilityLabel={mode === 'sign_in' ? 'Log in with Discord' : 'Sign up with Discord'}
            accessibilityHint={
              mode === 'sign_in'
                ? 'Opens Discord to log in.'
                : 'Opens Discord to create a TailTag account.'
            }
          />
        </TailTagCard>

        <View style={styles.footerHelper}>
          <Text style={styles.helperText}>
            Having trouble logging in?{' '}
            <Text
              style={styles.link}
              onPress={() => router.push('/forgot-password')}
            >
              Reset password
            </Text>
          </Text>
        </View>
      </KeyboardAwareFormWrapper>
    </SafeAreaView>
  );
}
