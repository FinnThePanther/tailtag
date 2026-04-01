import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';

import { styles } from './SkipButton.styles';

type SkipButtonProps = {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function SkipButton({
  label = 'Skip for now',
  onPress,
  disabled = false,
  style,
}: SkipButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
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
