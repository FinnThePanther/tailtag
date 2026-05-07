import type { ReactNode } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';

import { spacing } from '../../theme';
import { styles } from './KeyboardAwareFormWrapper.styles';

interface KeyboardAwareFormWrapperProps {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
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
  keyboardShouldPersistTaps = 'always',
}: KeyboardAwareFormWrapperProps) {
  return (
    <KeyboardAwareScrollView
      style={styles.wrapper}
      contentContainerStyle={[styles.defaultContainer, contentContainerStyle]}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator
      bottomOffset={spacing.xl}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}
