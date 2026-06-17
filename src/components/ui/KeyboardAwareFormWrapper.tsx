import { forwardRef, type ReactNode } from 'react';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import type { ScrollView, ScrollViewProps, StyleProp, ViewStyle } from 'react-native';

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
export const KeyboardAwareFormWrapper = forwardRef<ScrollView, KeyboardAwareFormWrapperProps>(
  function KeyboardAwareFormWrapper(
    { children, contentContainerStyle, keyboardShouldPersistTaps = 'handled' },
    ref,
  ) {
    return (
      <KeyboardAwareScrollView
        ref={ref}
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
  },
);
