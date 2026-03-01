import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { KeyboardAwareFormWrapper } from "../../src/components/ui/KeyboardAwareFormWrapper";
import { TailTagButton } from "../../src/components/ui/TailTagButton";
import { TailTagCard } from "../../src/components/ui/TailTagCard";
import { TailTagInput } from "../../src/components/ui/TailTagInput";
import { supabase } from "../../src/lib/supabase";
import { colors, spacing } from "../../src/theme";
import { isValidEmail, mapAuthError } from "../../src/utils/authValidation";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const trimmedEmail = email.trim();

    if (trimmedEmail.length === 0) {
      setError("Enter your email address to continue.");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: "tailtag://reset-password",
        });

      if (resetError) {
        throw resetError;
      }

      // Always show confirmation even if email doesn't exist (prevents enumeration)
      setEmailSent(true);
    } catch (caught) {
      setError(mapAuthError(caught));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (emailSent) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>TailTag</Text>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              If an account exists for{" "}
              <Text style={styles.emailHighlight}>{email}</Text>, we sent a
              password reset link. Check your inbox and follow the link to set a
              new password.
            </Text>
          </View>

          <TailTagCard style={styles.formCard}>
            <TailTagButton onPress={() => router.replace("/auth")}>
              Back to sign in
            </TailTagButton>
          </TailTagCard>
        </KeyboardAwareFormWrapper>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>TailTag</Text>
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>
            Enter the email address associated with your account and we'll send
            you a reset link.
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
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TailTagButton onPress={handleSubmit} loading={isSubmitting}>
            Send reset link
          </TailTagButton>

          <TailTagButton
            variant="ghost"
            onPress={() => router.replace("/auth")}
            disabled={isSubmitting}
          >
            Back to sign in
          </TailTagButton>
        </TailTagCard>
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
  emailHighlight: {
    color: colors.primary,
    fontWeight: "600",
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
  errorText: {
    color: "#fca5a5",
    fontSize: 14,
  },
});
