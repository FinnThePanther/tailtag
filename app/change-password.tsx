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

    if (newPassword === currentPassword) {
      setSubmitError('New password must be different from your current password.');
      return;
    }

    const email = session?.user?.email;
    if (!email) {
      captureHandledException(new Error('Change password: no email on session'), {
        scope: 'auth.changePassword',
      });
      setSubmitError('Something went wrong. Please try again.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (signInError) {
        setSubmitError('Current password is incorrect.');
        return;
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
          title="Change password"
          onBack={() => router.back()}
        />
        <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Password changed</Text>
            <Text style={styles.subtitle}>Your password has been updated successfully.</Text>
          </View>

          <TailTagCard style={styles.formCard}>
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
        title="Change password"
        onBack={() => router.back()}
      />
      <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
        <TailTagCard style={styles.formCard}>
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

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>New password</Text>
            <PasswordInput
              value={newPassword}
              onChangeText={setNewPassword}
              autoComplete="password-new"
              placeholder="8+ chars, mixed case, number, symbol"
              editable={!isSubmitting}
              returnKeyType="next"
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
