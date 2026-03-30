import { Image } from 'expo-image';
import { PixelRatio, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { getTransformedImageUrl } from '../../utils/supabase-image';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
type FallbackType = 'fursuit' | 'user';

type AppAvatarProps = {
  url: string | null | undefined;
  size: AvatarSize;
  fallback?: FallbackType;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

const SIZE_PX: Record<AvatarSize, number> = {
  xs: 40,
  sm: 44,
  md: 52,
  lg: 72,
  xl: 88,
  '2xl': 96,
};

const ICON_SIZE: Record<AvatarSize, number> = {
  xs: 20,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 36,
  '2xl': 48,
};

const FALLBACK_ICON: Record<FallbackType, React.ComponentProps<typeof Ionicons>['name']> = {
  fursuit: 'paw',
  user: 'person',
};

const FALLBACK_COLOR: Record<FallbackType, string> = {
  fursuit: 'rgba(148,163,184,0.4)',
  user: 'rgba(148,163,184,0.7)',
};

export function AppAvatar({
  url,
  size,
  fallback = 'fursuit',
  style,
  accessibilityLabel,
}: AppAvatarProps) {
  const logicalSize = SIZE_PX[size];
  const pixelSize = Math.round(logicalSize * Math.min(PixelRatio.get(), 3));
  const transformedUrl = getTransformedImageUrl(url, { width: pixelSize, height: pixelSize });

  const containerStyle: ViewStyle = {
    width: logicalSize,
    height: logicalSize,
    borderRadius: logicalSize / 2,
  };

  return (
    <View style={[styles.container, containerStyle, style]}>
      {transformedUrl ? (
        <Image
          source={transformedUrl}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={200}
          recyclingKey={transformedUrl}
          accessibilityLabel={accessibilityLabel}
        />
      ) : (
        <Ionicons
          name={FALLBACK_ICON[fallback]}
          size={ICON_SIZE[size]}
          color={FALLBACK_COLOR[fallback]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
