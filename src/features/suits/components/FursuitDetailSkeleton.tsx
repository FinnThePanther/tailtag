import { View } from 'react-native';

import { TailTagSkeleton, TailTagSkeletonGroup } from '../../../components/ui/TailTagSkeleton';
import { colors, radius, spacing } from '../../../theme';

export function FursuitDetailSkeleton() {
  return (
    <View style={{ gap: spacing.md }}>
      {/* Square avatar placeholder — static base color, shimmer travels over text below */}
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
          borderRadius: radius.xl,
          backgroundColor: colors.surfaceMuted,
        }}
      />

      <TailTagSkeletonGroup>
        <View style={{ gap: spacing.md }}>
          {/* leadDetails: name, species, colors, added date */}
          <View style={{ gap: 4 }}>
            <TailTagSkeleton
              width="55%"
              height={18}
            />
            <TailTagSkeleton
              width="40%"
              height={14}
            />
            <TailTagSkeleton
              width="48%"
              height={14}
            />
            <TailTagSkeleton
              width="32%"
              height={12}
            />
          </View>

          {/* Catch code section */}
          <View style={{ gap: spacing.xs }}>
            <TailTagSkeleton
              width="28%"
              height={16}
            />
            <TailTagSkeleton
              width="48%"
              height={30}
              radius={radius.md}
            />
          </View>

          {/* Bio sections: pronouns, likes & interests */}
          <View style={{ gap: spacing.sm }}>
            <TailTagSkeleton
              width="25%"
              height={14}
            />
            <TailTagSkeleton
              width="65%"
              height={14}
            />
            <TailTagSkeleton
              width="35%"
              height={14}
            />
            <TailTagSkeleton
              width="100%"
              height={14}
            />
            <TailTagSkeleton
              width="80%"
              height={14}
            />
          </View>

          {/* Catch stats */}
          <View style={{ gap: spacing.xs }}>
            <TailTagSkeleton
              width="32%"
              height={16}
            />
            <TailTagSkeleton
              width="38%"
              height={14}
            />
          </View>

          {/* Convention appearances */}
          <View style={{ gap: spacing.xs }}>
            <TailTagSkeleton
              width="50%"
              height={16}
            />
            <TailTagSkeleton
              width="62%"
              height={14}
            />
          </View>
        </View>
      </TailTagSkeletonGroup>
    </View>
  );
}
