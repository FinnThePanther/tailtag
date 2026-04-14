import { View } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

// Mirrors the 3-column grid in CatchPhotosList (thumbnailWrap: width '31%', aspectRatio 1).
export function CatchPhotosListSkeleton() {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: '31%',
            aspectRatio: 1,
            borderRadius: radius.lg,
            backgroundColor: colors.surfaceMuted,
          }}
        />
      ))}
    </View>
  );
}
