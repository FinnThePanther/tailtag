import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';

import { styles } from './SkipButton.styles';

type SkipButtonProps = {
  label?: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SkipButton({
  label = 'Skip for now',
  accessibilityLabel,
  onPress,
  disabled = false,
  style,
}: SkipButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
        style,
      ]}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}
