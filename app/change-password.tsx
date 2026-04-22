import { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { KeyboardAwareFormWrapper } from '../src/components/ui/KeyboardAwareFormWrapper';
import { PasswordInput } from '../src/components/ui/PasswordInput';
import { ScreenHeader } from '../src/components/ui/ScreenHeader';
import { TailTagButton } from '../src/components/ui/TailTagButton';
import { TailTagCard } from '../src/components/ui/TailTagCard';
import { PasswordStrengthIndicator } from '../src/features/auth/components/PasswordStrengthIndicator';
import { useAuth } from '../src/features/auth';
import { supabase } from '../src/lib/supabase';
import { captureHandledException } from '../src/lib/sentry';
import { mapAuthError, validatePassword } from '../src/utils/authValidation';
import { styles } from '../src/app-styles/reset-password.styles';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const hasPasswordIdentity = Boolean(
    session?.user?.identities?.some((identity) => identity.provider === 'email'),
  );
  const email = session?.user?.email?.trim() ?? '';
  const hasEmailAddress = email.length > 0;
  const screenTitle = hasPasswordIdentity ? 'Change password' : 'Set password';
  const successTitle = hasPasswordIdentity ? 'Password changed' : 'Password set';
  const successSubtitle = hasPasswordIdentity
    ? 'Your password has been updated successfully.'
    : 'You can now sign in with email and password.';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const validation = validatePassword(newPassword);
    if (!validation.isAcceptable) {
      setSubmitError("Your new password doesn't meet all the requirements shown below.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setSubmitError('Passwords do not match.');
      return;
    }

    if (hasPasswordIdentity && currentPassword.trim().length === 0) {
      setSubmitError('Enter your current password to continue.');
      return;
    }

    if (hasPasswordIdentity && newPassword === currentPassword) {
      setSubmitError('New password must be different from your current password.');
      return;
    }

    if (!hasEmailAddress) {
      captureHandledException(new Error('Change password: no email on session'), {
        scope: 'auth.changePassword',
      });
      setSubmitError('Password sign-in is unavailable because this account has no email address.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (hasPasswordIdentity) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });

        if (signInError) {
          const isCredentialsError =
            signInError.message === 'Invalid login credentials' || signInError.status === 400;
          setSubmitError(
            isCredentialsError ? 'Current password is incorrect.' : mapAuthError(signInError),
          );
          return;
        }
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
    } catch (caught) {
      captureHandledException(caught, { scope: 'auth.changePassword' });
      setSubmitError(mapAuthError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={['bottom']}
      >
        <ScreenHeader
          title={screenTitle}
          onBack={() => router.back()}
        />
        <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{successTitle}</Text>
            <Text style={styles.subtitle}>{successSubtitle}</Text>
          </View>

          <TailTagCard style={styles.formCard}>
            <TailTagButton onPress={() => router.back()}>Back to settings</TailTagButton>
          </TailTagCard>
        </KeyboardAwareFormWrapper>
      </SafeAreaView>
    );
  }

  if (!hasEmailAddress) {
    return (
      <SafeAreaView
        style={styles.safeArea}
        edges={['bottom']}
      >
        <ScreenHeader
          title={screenTitle}
          onBack={() => router.back()}
        />
        <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
          <TailTagCard style={styles.formCard}>
            <Text style={styles.errorText}>
              Password sign-in is unavailable because this account does not have an email address.
            </Text>
            <TailTagButton onPress={() => router.back()}>Back to settings</TailTagButton>
          </TailTagCard>
        </KeyboardAwareFormWrapper>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={['bottom']}
    >
      <ScreenHeader
        title={screenTitle}
        onBack={() => router.back()}
      />
      <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
        <TailTagCard style={styles.formCard}>
          {hasPasswordIdentity ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Current password</Text>
              <PasswordInput
                value={currentPassword}
                onChangeText={setCurrentPassword}
                autoComplete="password"
                placeholder="Enter your current password"
                editable={!isSubmitting}
                returnKeyType="next"
              />
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>New password</Text>
            <PasswordInput
              value={newPassword}
              onChangeText={setNewPassword}
              autoComplete="password-new"
              placeholder="8+ chars, mixed case, number, symbol"
              editable={!isSubmitting}
              returnKeyType={hasPasswordIdentity ? 'next' : 'done'}
              onSubmitEditing={hasPasswordIdentity ? undefined : handleSubmit}
            />
            <PasswordStrengthIndicator password={newPassword} />
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
