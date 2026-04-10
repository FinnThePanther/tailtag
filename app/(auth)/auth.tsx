import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, View } from "react-native";

import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { TailTagButton } from "../../src/components/ui/TailTagButton";
import { TailTagCard } from "../../src/components/ui/TailTagCard";
import { TailTagInput } from "../../src/components/ui/TailTagInput";
import { PasswordInput } from "../../src/components/ui/PasswordInput";
import { KeyboardAwareFormWrapper } from "../../src/components/ui/KeyboardAwareFormWrapper";
import { PasswordStrengthIndicator } from "../../src/features/auth/components/PasswordStrengthIndicator";
import { useOAuthSignIn } from "../../src/features/auth/hooks/useOAuthSignIn";
import { buildGeneratedUsername } from "../../src/features/profile";
import { supabase } from "../../src/lib/supabase";
import {
  isValidEmail,
  mapAuthError,
  validatePassword,
} from "../../src/utils/authValidation";
import { styles } from "../../src/app-styles/(auth)/auth.styles";

type AuthMode = "sign_in" | "sign_up";

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign_up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendError, setResendError] = useState<string | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const {
    signInWithProvider,
    activeProvider,
    error: oauthError,
  } = useOAuthSignIn();

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
        type: "signup",
        email: email.trim(),
      });
      if (resendErr) throw resendErr;
      startCooldown();
    } catch (caught) {
      setResendError(mapAuthError(caught));
    }
  }, [email, resendCooldown, startCooldown]);

  const toggleMode = () => {
    setMode((current) => (current === "sign_in" ? "sign_up" : "sign_in"));
    setError(null);
    setConfirmPassword("");
    setEmailSent(false);
  };

  useEffect(() => {
    if (oauthError) {
      setError(oauthError);
    }
  }, [oauthError]);

  const handleDiscordSignIn = async () => {
    if (isSubmitting) return;
    setError(null);
    try {
      await signInWithProvider("discord");
    } catch {
      // Error state handled inside useOAuthSignIn
    }
  };

  const isDiscordLoading = activeProvider === "discord";
  const isGoogleLoading = activeProvider === "google";
  const isAppleLoading = activeProvider === "apple";

  const handleGoogleSignIn = async () => {
    if (isSubmitting) return;
    setError(null);
    try {
      await signInWithProvider("google");
    } catch {
      // Error state is surfaced by the hook
    }
  };

  const handleAppleSignIn = async () => {
    if (isSubmitting) return;
    setError(null);
    try {
      await signInWithProvider("apple");
    } catch {
      // Error state is surfaced by the hook
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    const trimmedEmail = email.trim();

    if (trimmedEmail.length === 0 || password.length === 0) {
      setError("Enter your email and password to continue.");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (mode === "sign_up") {
      const validation = validatePassword(password);
      if (!validation.isAcceptable) {
        setError(
          "Your password doesn't meet all the requirements shown below.",
        );
        return;
      }

      if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (mode === "sign_up") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              username: buildGeneratedUsername(trimmedEmail.split("@")[0], {
                forceSuffix: true,
              }),
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
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <KeyboardAwareFormWrapper contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>TailTag</Text>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              We sent a confirmation link to{" "}
              <Text style={styles.emailHighlight}>{email}</Text>. Tap the link
              to activate your account, then come back and sign in.
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
                : "Resend confirmation email"}
            </TailTagButton>

            {resendError ? (
              <Text style={styles.errorText}>{resendError}</Text>
            ) : null}

            <TailTagButton
              variant="ghost"
              onPress={() => {
                setEmailSent(false);
                setResendError(null);
                setMode("sign_in");
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
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              autoComplete={mode === "sign_in" ? "password" : "password-new"}
              placeholder={
                mode === "sign_up"
                  ? "8+ chars, mixed case, number, symbol"
                  : "Enter your password"
              }
              editable={!isSubmitting}
              returnKeyType={mode === "sign_up" ? "next" : "done"}
              onSubmitEditing={mode === "sign_in" ? handleSubmit : undefined}
            />
            {mode === "sign_up" && (
              <PasswordStrengthIndicator password={password} />
            )}
          </View>

          {mode === "sign_up" && (
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

          {Platform.OS === "ios" && (
            <TailTagButton
              variant="outline"
              onPress={handleAppleSignIn}
              loading={isAppleLoading}
              disabled={isSubmitting}
              accessibilityLabel="Continue with Apple"
              accessibilityHint="Signs in with your Apple ID."
            >
              Continue with Apple
            </TailTagButton>
          )}

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
            Having trouble logging in?{" "}
            <Text
              style={styles.link}
              onPress={() => router.push("/forgot-password")}
            >
              Reset password
            </Text>
          </Text>
        </View>
      </KeyboardAwareFormWrapper>
    </SafeAreaView>
  );
}
