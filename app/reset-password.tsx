import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareFormWrapper } from '../src/components/ui/KeyboardAwareFormWrapper';
import { PasswordInput } from '../src/components/ui/PasswordInput';
import { TailTagButton } from '../src/components/ui/TailTagButton';
import { TailTagCard } from '../src/components/ui/TailTagCard';
import { PasswordStrengthIndicator } from '../src/features/auth/components/PasswordStrengthIndicator';
import {
  completeRecoverySessionFromUrl,
  getRecoverySessionTokens,
  RECOVERY_SESSION_READY_PARAM,
  RECOVERY_SESSION_READY_VALUE,
} from '../src/features/auth/utils/recovery';
import { supabase } from '../src/lib/supabase';
import { colors } from '../src/theme';
import { mapAuthError, validatePassword } from '../src/utils/authValidation';
import { styles } from '../src/app-styles/reset-password.styles';

type SessionState = 'loading' | 'ready' | 'error';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  const params = useLocalSearchParams();
  const recoverySessionParam = params[RECOVERY_SESSION_READY_PARAM];
  const hasReadyRecoverySessionParam =
    recoverySessionParam === RECOVERY_SESSION_READY_VALUE ||
    (Array.isArray(recoverySessionParam) &&
      recoverySessionParam.includes(RECOVERY_SESSION_READY_VALUE));
  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const resolveSession = async (incomingUrl: string | null | undefined) => {
      if (!isMounted) return;

      try {
        const hasRecoveryTokens = Boolean(getRecoverySessionTokens(incomingUrl));

        if (hasRecoveryTokens) {
          await completeRecoverySessionFromUrl(incomingUrl);

          if (isMounted) {
            setSessionState('ready');
          }

          return;
        }

        if (hasReadyRecoverySessionParam) {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!isMounted) return;

          if (session) {
            setSessionState('ready');
          } else {
            setSessionState('error');
            setSessionError('This reset link has expired. Please request a new password reset.');
          }
        } else {
          setSessionState('error');
          setSessionError('This reset link has expired or is invalid. Please request a new one.');
        }
      } catch {
        if (isMounted) {
          setSessionState('error');
          setSessionError('Something went wrong. Please try again later.');
        }
      }
    };

    if (url) {
      void resolveSession(url);
    } else {
      void Linking.getInitialURL()
        .then((initialUrl) => resolveSession(initialUrl))
        .catch(() => resolveSession(null));
    }

    return () => {
      isMounted = false;
    };
  }, [hasReadyRecoverySessionParam, url]);

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const validation = validatePassword(password);
    if (!validation.isAcceptable) {
      setSubmitError("Your new password doesn't meet all the requirements shown below.");
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
    } catch (caught) {
      setSubmitError(mapAuthError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (sessionState === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator
          size="large"
          color={colors.primary}
        />
        <Text style={styles.statusText}>Verifying your reset link…</Text>
      </View>
    );
  }

  if (sessionState === 'error') {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={['top', 'bottom']}
      >
        <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>TailTag</Text>
            <Text style={styles.title}>Link expired</Text>
            <Text style={styles.subtitle}>
              {sessionError ?? 'This reset link is no longer valid. Please request a new one.'}
            </Text>
          </View>

          <TailTagCard style={styles.formCard}>
            <TailTagButton onPress={() => router.replace('/forgot-password')}>
              Request new link
            </TailTagButton>
            <TailTagButton
              variant="ghost"
              onPress={() => router.replace('/auth')}
            >
              Back to sign in
            </TailTagButton>
          </TailTagCard>
        </KeyboardAwareFormWrapper>
      </SafeAreaView>
    );
  }

  if (success) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={['top', 'bottom']}
      >
        <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>TailTag</Text>
            <Text style={styles.title}>Password updated</Text>
            <Text style={styles.subtitle}>
              Your password has been changed successfully. You're now signed in.
            </Text>
          </View>

          <TailTagCard style={styles.formCard}>
            <TailTagButton onPress={() => router.replace('/')}>Continue to app</TailTagButton>
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
          <Text style={styles.title}>Set new password</Text>
          <Text style={styles.subtitle}>Choose a strong password for your account.</Text>
        </View>

        <TailTagCard style={styles.formCard}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>New password</Text>
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              autoComplete="password-new"
              placeholder="8+ chars, mixed case, number, symbol"
              editable={!isSubmitting}
              returnKeyType="next"
            />
            <PasswordStrengthIndicator password={password} />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Confirm new password</Text>
            <PasswordInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              autoComplete="password-new"
              placeholder="Re-enter your new password"
              editable={!isSubmitting}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {submitError ? <Text style={styles.errorText}>{submitError}</Text> : null}

          <TailTagButton
            onPress={handleSubmit}
            loading={isSubmitting}
          >
            Update password
          </TailTagButton>
        </TailTagCard>
      </KeyboardAwareFormWrapper>
    </SafeAreaView>
  );
}
