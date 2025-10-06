import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { colors, radius } from '../../theme';

type TailTagProgressBarProps = {
  value: number;
  trackColor?: string;
  indicatorColor?: string;
  style?: StyleProp<ViewStyle>;
  fillStyle?: StyleProp<ViewStyle>;
};

export function TailTagProgressBar({
  value,
  trackColor = 'rgba(148,163,184,0.25)',
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

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.md,
  },
});
