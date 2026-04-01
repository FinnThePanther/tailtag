import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../theme';

export const styles = StyleSheet.create({
  conventionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfacePanel,
    gap: spacing.md,
  },
  conventionRowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
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
  conventionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  conventionName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  endedBadge: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  conventionMetaText: {
    color: colors.textSubtle,
    fontSize: 13,
  },
  verificationText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  conventionBadge: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderInteractive,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.surfaceMuted,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  conventionBadgeActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  conventionBadgeDisabled: {
    borderColor: colors.borderEmphasis,
    backgroundColor: colors.surfacePanelMuted,
  },
  conventionBadgeText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
