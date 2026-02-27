import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import type { StyleProp, ViewStyle } from "react-native";

import { colors, spacing } from "../../theme";

interface KeyboardAwareFormWrapperProps {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/**
 * Scrollable form wrapper that automatically scrolls to keep the focused
 * TextInput visible above the keyboard on both iOS and Android.
 *
 * Powered by react-native-keyboard-controller's KeyboardAwareScrollView,
 * which requires <KeyboardProvider> in the app root.
 */
export function KeyboardAwareFormWrapper({
  children,
  contentContainerStyle,
}: KeyboardAwareFormWrapperProps) {
  return (
    <KeyboardAwareScrollView
      style={styles.wrapper}
      contentContainerStyle={[styles.defaultContainer, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
      bottomOffset={spacing.xl}
    >
      {children}
    </KeyboardAwareScrollView>
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
