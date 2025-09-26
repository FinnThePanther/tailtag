import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import type { TextStyle } from 'react-native';
import type { GestureResponderEvent } from 'react-native';

import { colors, radius, spacing } from '../../theme';

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

type TailTagButtonProps = {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
};

const VARIANT_STYLES: Record<ButtonVariant, { container: ViewStyle; text: TextStyle }> = {
  primary: {
    container: {
      backgroundColor: colors.primary,
    },
    text: {
      color: '#0f172a',
    },
  },
  outline: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: 'rgba(148,163,184,0.4)',
    },
    text: {
      color: colors.foreground,
    },
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
    },
    text: {
      color: colors.foreground,
    },
  },
  destructive: {
    container: {
      backgroundColor: colors.destructive,
    },
    text: {
      color: '#0f172a',
    },
  },
};

const SIZE_STYLES: Record<ButtonSize, { paddingVertical: number; paddingHorizontal: number; fontSize: number }> = {
  sm: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    fontSize: 14,
  },
  md: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
  },
  lg: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    fontSize: 18,
  },
};

export function TailTagButton({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
}: TailTagButtonProps) {
  const sizeStyles = SIZE_STYLES[size];
  const variantStyles = VARIANT_STYLES[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        {
          paddingVertical: sizeStyles.paddingVertical,
          paddingHorizontal: sizeStyles.paddingHorizontal,
          opacity: pressed && !isDisabled ? 0.9 : 1,
        },
        variantStyles.container,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyles.text.color ?? colors.foreground} />
      ) : (
        <Text
          style={[
            styles.text,
            {
              fontSize: sizeStyles.fontSize,
            },
            variantStyles.text,
          ]}
        >
          {children}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  text: {
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
});
