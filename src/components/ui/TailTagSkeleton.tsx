import { createContext, useContext, useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, radius as themeRadius } from '../../theme';
import { styles } from './TailTagSkeleton.styles';

const SHIMMER_DURATION_MS = 1400;
const SHIMMER_COLORS = ['transparent', 'rgba(255,255,255,0.08)', 'transparent'] as const;

// ---------------------------------------------------------------------------
// Group context — shares a single shimmer clock across children
// ---------------------------------------------------------------------------

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

type SkeletonGroupContextValue = ReturnType<typeof useSharedValue<number>> | null;
const SkeletonGroupContext = createContext<SkeletonGroupContextValue>(null);

type TailTagSkeletonGroupProps = {
  children: ReactNode;
};

export function TailTagSkeletonGroup({ children }: TailTagSkeletonGroupProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: SHIMMER_DURATION_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [progress]);

  return (
    <SkeletonGroupContext.Provider value={progress}>
      {children}
    </SkeletonGroupContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// TailTagSkeleton
// ---------------------------------------------------------------------------

type TailTagSkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function TailTagSkeleton({
  width = '100%',
  height = 16,
  radius: radiusProp = themeRadius.sm,
  style,
}: TailTagSkeletonProps) {
  const groupProgress = useContext(SkeletonGroupContext);

  // If no group parent, drive our own shimmer clock.
  const ownProgress = useSharedValue(0);

  useEffect(() => {
    if (groupProgress !== null) return;
    ownProgress.value = withRepeat(
      withTiming(1, { duration: SHIMMER_DURATION_MS, easing: Easing.linear }),
      -1,
      false,
    );
  }, [groupProgress, ownProgress]);

  const progress = groupProgress ?? ownProgress;

  // We need a numeric container width to drive translateX. We read it from
  // the style/width prop when it is numeric; otherwise fall back to a
  // generous constant. The shimmer just travels slightly wider than needed
  // for percentage widths, which is imperceptible.
  const containerWidth = typeof width === 'number' ? width : 300;

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: (progress.value * 2 - 1) * containerWidth,
      },
    ],
  }));

  return (
    <View
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius: radiusProp,
          backgroundColor: colors.surfaceMuted,
        },
        style,
      ]}
    >
      <AnimatedLinearGradient
        colors={SHIMMER_COLORS}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.shimmer, shimmerStyle]}
      />
    </View>
  );
}
