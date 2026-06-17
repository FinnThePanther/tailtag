import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  editor: {
    gap: spacing.md,
  },
  introText: {
    color: colors.textSubtle,
    fontSize: 12,
    lineHeight: 18,
  },
  optionGroup: {
    gap: spacing.sm,
  },
  optionGroupTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '700',
  },
  signalOption: {
    alignItems: 'center',
    backgroundColor: colors.surfaceInset,
    borderColor: colors.borderMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  signalOptionSelected: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primary,
  },
  signalOptionPressed: {
    opacity: 0.72,
  },
  signalOptionIcon: {
    alignItems: 'center',
    borderColor: colors.borderMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  signalOptionIconSelected: {
    backgroundColor: colors.primarySurfaceStrong,
    borderColor: colors.primaryBorder,
  },
  signalOptionText: {
    flex: 1,
    gap: 2,
  },
  signalOptionLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700',
  },
  signalOptionLabelSelected: {
    color: colors.primary,
  },
  signalOptionDescription: {
    color: colors.textSubtle,
    fontSize: 12,
    lineHeight: 17,
  },
  clearSignalButton: {
    alignSelf: 'flex-start',
  },
  badgeGroup: {
    gap: spacing.xs,
  },
  badgeGroupTitle: {
    color: colors.textMutedStrong,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  badgeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badgeChip: {
    backgroundColor: colors.surfaceMutedSoft,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  badgeChipSelected: {
    backgroundColor: colors.primarySurfaceStrong,
    borderColor: colors.primary,
  },
  badgeChipDisabled: {
    opacity: 0.45,
  },
  badgeChipText: {
    color: colors.textMutedStrong,
    fontSize: 13,
    fontWeight: '600',
  },
  badgeChipTextSelected: {
    color: colors.primary,
  },
  selectionHint: {
    color: colors.textSubtle,
    fontSize: 12,
    lineHeight: 18,
  },
  summary: {
    backgroundColor: colors.surfaceMutedSoft,
    borderColor: colors.borderMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  summaryTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '700',
  },
  summaryBody: {
    color: colors.textSubtle,
    fontSize: 12,
    lineHeight: 18,
  },
  summarySignal: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summarySignalDot: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  summarySignalLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700',
  },
  summaryBadgeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  summaryBadge: {
    backgroundColor: colors.surfaceInset,
    borderColor: colors.borderMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  summaryBadgeText: {
    color: colors.textMutedStrong,
    fontSize: 12,
    fontWeight: '600',
  },
});
