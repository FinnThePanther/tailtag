import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, spacing } from '../../../theme';

type SkipButtonProps = {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
};

export function SkipButton({ label = 'Skip for now', onPress, disabled = false }: SkipButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
      ]}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  text: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
