import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";

import type { StyleProp, ViewStyle } from "react-native";

import { colors, spacing } from "../../theme";

interface KeyboardAwareFormWrapperProps {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  extraScrollHeight?: number;
  enableOnAndroid?: boolean;
  enableAutomaticScroll?: boolean;
}

/**
 * A reusable wrapper component that handles keyboard avoidance for forms.
 * Uses react-native-keyboard-aware-scroll-view for robust cross-platform behavior.
 *
 * This component automatically:
 * - Scrolls to focused text inputs
 * - Accounts for tab bar and safe area insets
 * - Works on both iOS and Android
 * - Dismisses keyboard on tap outside inputs
 */
export function KeyboardAwareFormWrapper({
  children,
  contentContainerStyle,
  extraScrollHeight = 150,
  enableOnAndroid = true,
  enableAutomaticScroll = true,
}: KeyboardAwareFormWrapperProps) {
  return (
    <KeyboardAwareScrollView
      style={styles.wrapper}
      contentContainerStyle={[styles.defaultContainer, contentContainerStyle]}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={enableOnAndroid}
      enableAutomaticScroll={enableAutomaticScroll}
      extraScrollHeight={extraScrollHeight}
      extraHeight={150}
      viewIsInsideTabBar={true}
      showsVerticalScrollIndicator={true}
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
