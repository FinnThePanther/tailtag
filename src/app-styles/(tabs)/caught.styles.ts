import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(203,213,225,0.9)',
  },
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  helper: {
    gap: spacing.sm,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  collectionControls: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  filterRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  filterButton: {
    minWidth: 132,
    minHeight: 52,
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.surfaceInset,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  filterButtonActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySurface,
  },
  filterButtonPressed: {
    opacity: 0.72,
  },
  filterLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  filterLabelActive: {
    color: colors.primary,
  },
  filterMeta: {
    color: colors.textFaint,
    fontSize: 12,
    marginTop: 2,
  },
  filterMetaActive: {
    color: colors.textMutedStrong,
  },
  folderSummary: {
    gap: 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.surfacePanelMuted,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  folderTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '700',
  },
  folderMeta: {
    color: colors.textSubtle,
    fontSize: 13,
  },
  separator: {
    height: spacing.xs,
  },
});
