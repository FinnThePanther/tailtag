import { View } from 'react-native';

import { TailTagSkeleton, TailTagSkeletonGroup } from '../../../components/ui/TailTagSkeleton';
import { radius, spacing } from '../../../theme';

const ROW_COUNT = 5;

const rowStyle = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.sm,
  borderRadius: radius.md,
  backgroundColor: 'rgba(15,23,42,0.6)',
};

export function LeaderboardSectionSkeleton() {
  return (
    <TailTagSkeletonGroup>
      <View style={{ gap: spacing.xs }}>
        {Array.from({ length: ROW_COUNT }).map((_, i) => (
          <View
            key={i}
            style={rowStyle}
          >
            {/* Rank */}
            <TailTagSkeleton
              width={28}
              height={14}
            />
            {/* Name + catch count */}
            <View style={{ flex: 1, marginLeft: spacing.sm, gap: 4 }}>
              <TailTagSkeleton
                width="60%"
                height={14}
              />
              <TailTagSkeleton
                width="35%"
                height={12}
              />
            </View>
          </View>
        ))}
      </View>
    </TailTagSkeletonGroup>
  );
}
