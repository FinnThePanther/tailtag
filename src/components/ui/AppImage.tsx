import { useState } from 'react';
import { Image } from 'expo-image';
import type { ImageStyle } from 'expo-image';
import { PixelRatio, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { getTransformedImageUrl } from '../../utils/supabase-image';

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
  transition = 300,
  style,
  accessibilityLabel,
}: AppImageProps) {
  const [errored, setErrored] = useState(false);

  const source = (() => {
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

  if (!source) {
    return <View style={[styles.placeholder, style]} />;
  }

  return (
    <Image
      source={source}
      style={style as StyleProp<ImageStyle>}
      contentFit={contentFit}
      transition={transition}
      recyclingKey={source}
      accessibilityLabel={accessibilityLabel}
      onError={() => setErrored(true)}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: 'rgba(30,41,59,0.8)',
  },
});
