import { View } from 'react-native';

import { TailTagSkeleton, TailTagSkeletonGroup } from '../../../components/ui/TailTagSkeleton';
import { colors, radius, spacing } from '../../../theme';

// ---------------------------------------------------------------------------
// ProfileHeaderSkeleton
// Mirrors profileHeader: avatar (full-width square) + username + bio lines
// ---------------------------------------------------------------------------
export function ProfileHeaderSkeleton() {
  return (
    <TailTagSkeletonGroup>
      <View style={{ gap: spacing.sm }}>
        {/* Full-width square avatar */}
        <View
          style={{
            width: '100%',
            aspectRatio: 1,
            borderRadius: radius.xl,
            backgroundColor: colors.surfaceMuted,
            marginBottom: spacing.xs,
          }}
        />
        {/* Username — fontSize 22 */}
        <TailTagSkeleton
          width="50%"
          height={22}
        />
        {/* Bio — two lines at fontSize 14 */}
        <TailTagSkeleton
          width="75%"
          height={14}
        />
        <TailTagSkeleton
          width="55%"
          height={14}
        />
      </View>
    </TailTagSkeletonGroup>
  );
}

// ---------------------------------------------------------------------------
// StatsGridSkeleton
// Mirrors statsGrid: two side-by-side stat cards
// ---------------------------------------------------------------------------
export function StatsGridSkeleton() {
  return (
    <TailTagSkeletonGroup>
      <View style={{ flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' }}>
        {[0, 1].map((i) => (
          <View
            key={i}
            style={{
              flexGrow: 1,
              flexBasis: 120,
              backgroundColor: colors.surfaceMutedSoft,
              borderRadius: radius.lg,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              gap: spacing.xs,
            }}
          >
            {/* statValue — fontSize 28 */}
            <TailTagSkeleton
              width="55%"
              height={28}
            />
            {/* statLabel — fontSize 13 */}
            <TailTagSkeleton
              width="82%"
              height={13}
            />
          </View>
        ))}
      </View>
    </TailTagSkeletonGroup>
  );
}

// ---------------------------------------------------------------------------
// FursuitsListSkeleton
// Mirrors suitsList: 2 fake FursuitCard-shaped rows
// ---------------------------------------------------------------------------
export function FursuitsListSkeleton() {
  return (
    <TailTagSkeletonGroup>
      <View style={{ gap: spacing.md }}>
        {[0, 1].map((i) => (
          <View
            key={i}
            style={{
              backgroundColor: colors.surfaceCardStrong,
              borderRadius: radius.xl,
              borderWidth: 1,
              borderColor: colors.borderDefault,
              padding: spacing.md,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.md,
                marginBottom: spacing.md,
              }}
            >
              {/* Avatar: 50% width square */}
              <View
                style={{
                  width: '50%',
                  aspectRatio: 1,
                  borderRadius: radius.xl,
                  backgroundColor: colors.surfaceMuted,
                }}
              />
              {/* Name, species, colors */}
              <View style={{ flex: 1, gap: 4 }}>
                <TailTagSkeleton
                  width="80%"
                  height={18}
                />
                <TailTagSkeleton
                  width="65%"
                  height={14}
                />
                <TailTagSkeleton
                  width="70%"
                  height={13}
                />
              </View>
            </View>
            {/* Catch code line */}
            <TailTagSkeleton
              width="50%"
              height={14}
            />
          </View>
        ))}
      </View>
    </TailTagSkeletonGroup>
  );
}

// ---------------------------------------------------------------------------
// AchievementsListSkeleton
// Mirrors achievementList: 3 fake rows (trophy circle + name + description)
// ---------------------------------------------------------------------------
export function AchievementsListSkeleton() {
  return (
    <TailTagSkeletonGroup>
      <View style={{ gap: spacing.sm }}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}
          >
            {/* Trophy icon circle (32×32) */}
            <TailTagSkeleton
              width={32}
              height={32}
              radius={16}
            />
            {/* Name + description */}
            <View style={{ flex: 1, gap: 2 }}>
              <TailTagSkeleton
                width="60%"
                height={14}
              />
              <TailTagSkeleton
                width="80%"
                height={13}
              />
            </View>
          </View>
        ))}
      </View>
    </TailTagSkeletonGroup>
  );
}
