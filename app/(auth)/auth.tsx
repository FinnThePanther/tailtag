import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { TailTagButton } from '../../src/components/ui/TailTagButton';
import { TailTagCard } from '../../src/components/ui/TailTagCard';
import { TailTagInput } from '../../src/components/ui/TailTagInput';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing } from '../../src/theme';

const generateDefaultUsername = (rawEmail: string) => {
  const [localPart] = rawEmail.split('@');
  const cleaned = localPart?.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? 'pilot';
  const suffix = Math.random().toString(36).slice(-4);
  return `${cleaned}-${suffix}`;
};

type AuthMode = 'sign_in' | 'sign_up';

const formatError = (input: unknown) => {
  if (input && typeof input === 'object') {
    const maybeError = input as { message?: string };
    if (maybeError.message) {
      return maybeError.message;
    }
  }

  return input instanceof Error ? input.message : 'Something went wrong. Try again later.';
};

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMode = () => {
    setMode((current) => (current === 'sign_in' ? 'sign_up' : 'sign_in'));
    setError(null);
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (trimmedEmail.length === 0 || trimmedPassword.length === 0) {
      setError('Enter your email and password to continue.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === 'sign_up') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password: trimmedPassword,
          options: {
            data: {
              username: generateDefaultUsername(trimmedEmail),
            },
          },
        });

        if (signUpError) {
          throw signUpError;
        }

        if (!data.session) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password: trimmedPassword,
          });

          if (signInError) {
            throw signInError;
          }
        }

        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword,
      });

      if (signInError) {
        throw signInError;
      }
    } catch (caught) {
      setError(formatError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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
            <TailTagInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'sign_in' ? 'password' : 'password-new'}
              placeholder="Enter at least 6 characters"
              editable={!isSubmitting}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            <Text style={styles.assistiveText}>
              Keep it simple for now—TailTag uses straightforward email login.
            </Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TailTagButton onPress={handleSubmit} loading={isSubmitting}>
            {mode === 'sign_in' ? 'Log in' : 'Sign up'}
          </TailTagButton>

          <TailTagButton variant="ghost" onPress={toggleMode} disabled={isSubmitting}>
            {mode === 'sign_in'
              ? 'Need an account? Sign up'
              : 'Already have an account? Log in'}
          </TailTagButton>
        </TailTagCard>

        <View style={styles.footerHelper}>
          <Text style={styles.helperText}>
            Problems signing in? Make sure email auth is enabled for your account.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.lg,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  title: {
    color: colors.foreground,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 15,
    lineHeight: 22,
  },
  formCard: {
    gap: spacing.lg,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  assistiveText: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  footerHelper: {
    marginTop: spacing.lg,
  },
  helperText: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
    lineHeight: 20,
  },
});

