import { View } from 'react-native';

import { TailTagSkeleton, TailTagSkeletonGroup } from '../../../components/ui/TailTagSkeleton';
import { radius, spacing } from '../../../theme';

export function AchievementsSummarySkeleton() {
  return (
    <TailTagSkeletonGroup>
      <View style={{ gap: spacing.sm }}>
        {/* "X / Y unlocked" (large) and "X% complete" header */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <TailTagSkeleton
            width="42%"
            height={18}
          />
          <TailTagSkeleton
            width="22%"
            height={14}
          />
        </View>
        {/* Progress bar */}
        <TailTagSkeleton
          width="100%"
          height={8}
          radius={radius.md}
        />
        {/* "Last unlock: ..." footnote */}
        <TailTagSkeleton
          width="60%"
          height={13}
        />
      </View>
    </TailTagSkeletonGroup>
  );
}
