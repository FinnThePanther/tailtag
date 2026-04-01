import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  sectionGroup: {
    gap: spacing.xs,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    color: colors.textFaint,
    fontSize: 14,
  },
  tagCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMutedFaint,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  tagInfo: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  tagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tagUid: {
    fontFamily: 'monospace',
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    flex: 1,
  },
  tagDate: {
    fontSize: 12,
    color: colors.textFaint,
    marginLeft: 28,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMutedGhost,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderDisabled,
    borderStyle: 'dashed',
  },
  emptyContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  qrLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    flex: 1,
  },
  qrCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfacePanelMuted,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  qrActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  qrEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: colors.borderDisabled,
    backgroundColor: colors.surfaceMutedGhost,
  },
  showQrButton: {
    marginTop: spacing.sm,
  },
});
