import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';

import { colors } from '../../theme';
import { styles } from './TailTagProgressBar.styles';

type TailTagProgressBarProps = {
  value: number;
  trackColor?: string;
  indicatorColor?: string;
  style?: StyleProp<ViewStyle>;
  fillStyle?: StyleProp<ViewStyle>;
};

export function TailTagProgressBar({
  value,
  trackColor = colors.borderDefault,
  indicatorColor = colors.primary,
  style,
  fillStyle,
}: TailTagProgressBarProps) {
  const clamped = Math.min(Math.max(value, 0), 1);
  const widthPercent = `${Math.round(clamped * 100)}%` as `${number}%`;

  return (
    <View style={[styles.track, { backgroundColor: trackColor }, style]}>
      <View
        style={[
          styles.fill,
          { backgroundColor: indicatorColor, width: widthPercent },
          fillStyle,
        ]}
      />
    </View>
  );
}
