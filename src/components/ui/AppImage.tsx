import { useState } from 'react';
import { Image } from 'expo-image';
import type { ImageStyle } from 'expo-image';
import { PixelRatio, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useAuth } from '../../features/auth/providers/AuthProvider';
import { getTransformedImageUrl, toExpoImageSource } from '../../utils/supabase-image';
import { styles } from './AppImage.styles';

type AppImageProps = {
  url: string | null | undefined;
  width?: number;
  height?: number;
  contentFit?: 'cover' | 'contain';
  transition?: number;
  // Accept ViewStyle from callers; expo-image's Image will receive it cast to ImageStyle
  style?: ViewStyle | StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

export function AppImage({
  url,
  width,
  height,
  contentFit = 'cover',
  transition = 200,
  style,
  accessibilityLabel,
}: AppImageProps) {
  const { session } = useAuth();
  const [errored, setErrored] = useState(false);
  const accessToken = session?.access_token ?? null;

  const resolvedUrl = (() => {
    if (!url) return null;
    if (errored) return null;
    if (width != null && height != null) {
      const scale = Math.min(PixelRatio.get(), 3);
      return getTransformedImageUrl(url, {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        resize: contentFit,
      });
    }
    return url;
  })();
  const source = toExpoImageSource(resolvedUrl, accessToken);

  if (!source) {
    return <View style={[styles.placeholder, style]} />;
  }

  return (
    <Image
      source={source}
      style={[styles.imageBase, style] as StyleProp<ImageStyle>}
      contentFit={contentFit}
      transition={transition}
      recyclingKey={resolvedUrl ?? undefined}
      accessibilityLabel={accessibilityLabel}
      onError={() => setErrored(true)}
    />
  );
}
