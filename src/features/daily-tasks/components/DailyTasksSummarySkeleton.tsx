import { View } from 'react-native';

import { TailTagSkeleton, TailTagSkeletonGroup } from '../../../components/ui/TailTagSkeleton';
import { radius, spacing } from '../../../theme';

export function DailyTasksSummarySkeleton() {
  return (
    <TailTagSkeletonGroup>
      <View style={{ gap: spacing.sm }}>
        {/* "X / Y complete" and "Resets in ..." header */}
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <TailTagSkeleton
            width="45%"
            height={14}
          />
          <TailTagSkeleton
            width="28%"
            height={13}
          />
        </View>
        {/* Progress bar */}
        <TailTagSkeleton
          width="100%"
          height={8}
          radius={radius.md}
        />
        {/* "X tasks remaining" */}
        <TailTagSkeleton
          width="55%"
          height={14}
        />
        {/* "Next reset at ..." */}
        <TailTagSkeleton
          width="40%"
          height={12}
        />
      </View>
    </TailTagSkeletonGroup>
  );
}
