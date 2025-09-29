import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ConventionSummary } from '../../features/conventions';
import { formatConventionDateRange } from '../../features/conventions/utils';
import { colors, spacing, radius } from '../../theme';

export type ConventionToggleProps = {
  convention: ConventionSummary;
  selected: boolean;
  pending: boolean;
  disabled?: boolean;
  badgeText?: string;
  onToggle: () => void;
};

export function ConventionToggle({
  convention,
  selected,
  pending,
  disabled = false,
  badgeText,
  onToggle,
}: ConventionToggleProps) {
  const dateRange = formatConventionDateRange(convention.start_date ?? null, convention.end_date ?? null);
  const shouldDisable = disabled || pending;
  const showDisabledBadge = !selected && !pending && disabled;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: shouldDisable, selected }}
      onPress={onToggle}
      disabled={shouldDisable}
      style={({ pressed }) => [
        styles.conventionRow,
        selected && styles.conventionRowSelected,
        shouldDisable && styles.conventionRowDisabled,
        pressed && !shouldDisable ? styles.conventionRowPressed : null,
      ]}
    >
      <View style={styles.conventionInfo}>
        <Text style={styles.conventionName}>{convention.name}</Text>
        {convention.location ? (
          <Text style={styles.conventionMetaText}>{convention.location}</Text>
        ) : null}
        {dateRange ? <Text style={styles.conventionMetaText}>{dateRange}</Text> : null}
      </View>
      <View
        style={[
          styles.conventionBadge,
          selected && styles.conventionBadgeActive,
          showDisabledBadge ? styles.conventionBadgeDisabled : null,
        ]}
      >
        {pending ? (
          <ActivityIndicator size="small" color={colors.foreground} />
        ) : (
          <Text style={styles.conventionBadgeText}>
            {badgeText ?? (selected ? 'Assigned' : 'Tap to assign')}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  conventionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.25)',
    backgroundColor: 'rgba(15,23,42,0.7)',
    gap: spacing.md,
  },
  conventionRowSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  conventionRowDisabled: {
    opacity: 0.6,
  },
  conventionRowPressed: {
    opacity: 0.9,
  },
  conventionInfo: {
    flex: 1,
    gap: 2,
  },
  conventionName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  conventionMetaText: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
  },
  conventionBadge: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: 'rgba(30,41,59,0.8)',
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conventionBadgeActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(56,189,248,0.15)',
  },
  conventionBadgeDisabled: {
    borderColor: 'rgba(148,163,184,0.4)',
    backgroundColor: 'rgba(15,23,42,0.5)',
  },
  conventionBadgeText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
