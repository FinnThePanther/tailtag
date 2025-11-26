import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";

import type { StyleProp, ViewStyle } from "react-native";

import { colors, spacing } from "../../theme";

interface KeyboardAwareFormWrapperProps {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * A reusable wrapper component that handles keyboard avoidance for forms.
 * Uses native KeyboardAvoidingView for platform-specific behavior.
 *
 * This component:
 * - Adjusts layout when keyboard appears (padding on iOS, height on Android)
 * - Works on both iOS and Android
 * - Dismisses keyboard on tap outside inputs
 */
export function KeyboardAwareFormWrapper({
  children,
  contentContainerStyle,
}: KeyboardAwareFormWrapperProps) {
  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <ScrollView
        contentContainerStyle={[styles.defaultContainer, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  defaultContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
});
