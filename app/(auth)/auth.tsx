import { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import { TailTagButton } from "../../src/components/ui/TailTagButton";
import { TailTagCard } from "../../src/components/ui/TailTagCard";
import { TailTagInput } from "../../src/components/ui/TailTagInput";
import { KeyboardAwareFormWrapper } from "../../src/components/ui/KeyboardAwareFormWrapper";
import { useOAuthSignIn } from "../../src/features/auth/hooks/useOAuthSignIn";
import { supabase } from "../../src/lib/supabase";
import { colors, spacing } from "../../src/theme";

const generateDefaultUsername = (rawEmail: string) => {
  const [localPart] = rawEmail.split("@");
  const cleaned =
    localPart?.toLowerCase().replace(/[^a-z0-9]+/g, "-") ?? "pilot";
  const suffix = Math.random().toString(36).slice(-4);
  return `${cleaned}-${suffix}`;
};

type AuthMode = "sign_in" | "sign_up";

const formatError = (input: unknown) => {
  if (input && typeof input === "object") {
    const maybeError = input as { message?: string };
    if (maybeError.message) {
      return maybeError.message;
    }
  }

  return input instanceof Error
    ? input.message
    : "Something went wrong. Try again later.";
};

export default function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signInWithProvider, activeProvider, error: oauthError } = useOAuthSignIn();

  const toggleMode = () => {
    setMode((current) => (current === "sign_in" ? "sign_up" : "sign_in"));
    setError(null);
  };

  useEffect(() => {
    if (oauthError) {
      setError(oauthError);
    }
  }, [oauthError]);

  const handleDiscordSignIn = async () => {
    if (isSubmitting) {
      return;
    }

    setError(null);

    try {
      await signInWithProvider("discord");
    } catch {
      // Error state handled inside useOAuthSignIn
    }
  };

  const isDiscordLoading = activeProvider === "discord";
  const isGoogleLoading = activeProvider === "google";

  const handleGoogleSignIn = async () => {
    if (isSubmitting) {
      return;
    }

    setError(null);

    try {
      await signInWithProvider("google");
    } catch {
      // Error state is surfaced by the hook
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    if (trimmedEmail.length === 0 || trimmedPassword.length === 0) {
      setError("Enter your email and password to continue.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === "sign_up") {
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
          const { error: signInError } = await supabase.auth.signInWithPassword(
            {
              email: trimmedEmail,
              password: trimmedPassword,
            }
          );

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
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>TailTag</Text>
          <Text style={styles.title}>
            {mode === "sign_in" ? "Welcome back" : "Create your TailTag"}
          </Text>
          <Text style={styles.subtitle}>
            {mode === "sign_in"
              ? "Log in with email and password to keep tagging suits."
              : "Sign up with email and password to start your TailTag collection."}
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
              autoComplete={mode === "sign_in" ? "password" : "password-new"}
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
            {mode === "sign_in" ? "Log in" : "Sign up"}
          </TailTagButton>

          <TailTagButton
            variant="ghost"
            onPress={toggleMode}
            disabled={isSubmitting}
          >
            {mode === "sign_in"
              ? "Need an account? Sign up"
              : "Already have an account? Log in"}
          </TailTagButton>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          <TailTagButton
            variant="outline"
            onPress={handleDiscordSignIn}
            loading={isDiscordLoading}
            disabled={isSubmitting}
            accessibilityLabel="Continue with Discord"
            accessibilityHint="Opens Discord to continue signing in."
          >
            Continue with Discord
          </TailTagButton>

          <TailTagButton
            variant="outline"
            onPress={handleGoogleSignIn}
            loading={isGoogleLoading}
            disabled={isSubmitting}
            accessibilityLabel="Continue with Google"
            accessibilityHint="Opens Google to continue signing in."
          >
            Continue with Google
          </TailTagButton>
        </TailTagCard>

        <View style={styles.footerHelper}>
          <Text style={styles.helperText}>
            Problems signing in? Email/password, Google, and Discord are all supported—
            make sure at least one provider is enabled for your account.
          </Text>
        </View>
      </KeyboardAwareFormWrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
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
    textTransform: "uppercase",
    color: colors.primary,
  },
  title: {
    color: colors.foreground,
    fontSize: 26,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: "rgba(203,213,225,0.9)",
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
    fontWeight: "600",
  },
  assistiveText: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 12,
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 14,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(148,163,184,0.4)",
  },
  dividerLabel: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  footerHelper: {
    marginTop: spacing.lg,
  },
  helperText: {
    color: "rgba(148,163,184,0.9)",
    fontSize: 13,
    lineHeight: 20,
  },
});
