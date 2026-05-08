import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../theme';

export const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  summaryPill: {
    minWidth: 92,
    flexGrow: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.surfaceInset,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
  },
  summaryValue: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  searchInput: {
    minHeight: 44,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.surfaceInset,
    paddingHorizontal: spacing.sm,
  },
  filterButtonActive: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySurface,
  },
  filterButtonPressed: {
    opacity: 0.72,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  filterTextActive: {
    color: colors.primary,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: 'rgba(15,23,42,0.72)',
    padding: spacing.md,
  },
  rowPressed: {
    opacity: 0.72,
  },
  rowDetails: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  suitName: {
    flex: 1,
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.surfaceMutedSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  badgeSuccess: {
    borderColor: 'rgba(74,222,128,0.38)',
    backgroundColor: 'rgba(22,101,52,0.24)',
  },
  badgeText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  badgeTextSuccess: {
    color: '#86efac',
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  errorBlock: {
    gap: spacing.sm,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
    lineHeight: 20,
  },
});
