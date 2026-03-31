import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../theme';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  selectorCard: {
    gap: spacing.sm,
  },
  selectorEyebrow: {
    color: colors.slate200,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  selectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  selectorButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  summaryCard: {
    gap: spacing.lg,
  },
  summaryHeader: {
    gap: spacing.xs,
  },
  summaryEyebrow: {
    color: colors.slate200,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  summaryTitle: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: '600',
  },
  summaryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  summaryStat: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  statLabel: {
    color: colors.slate200,
    fontSize: 12,
    marginBottom: spacing.xs,
  },
  statValue: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '600',
  },
  progressBlock: {
    gap: spacing.sm,
  },
  progressFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressHelper: {
    color: colors.slate200,
    fontSize: 14,
  },
  countdownLabel: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  tasksCard: {
    gap: spacing.md,
  },
  tasksTitle: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '600',
  },
  message: {
    color: colors.slate200,
    fontSize: 14,
  },
  helper: {
    gap: spacing.sm,
  },
  error: {
    color: colors.destructive,
    fontSize: 14,
  },
  errorBlock: {
    gap: spacing.sm,
  },
  errorText: {
    color: colors.destructive,
    fontSize: 14,
    fontWeight: '500',
  },
  tasksList: {
    gap: spacing.md,
  },
  taskRow: {
    backgroundColor: colors.accent,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: spacing.sm,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  taskTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  taskBadgePending: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 0,
  },
  taskBadgeDone: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 0,
  },
  conventionBadgeRow: {
    flexDirection: 'row',
  },
  conventionBadge: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  taskDescription: {
    color: colors.slate200,
    fontSize: 14,
    lineHeight: 20,
  },
  taskProgress: {
    backgroundColor: 'rgba(148,163,184,0.18)',
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  taskProgressLabel: {
    color: colors.slate200,
    fontSize: 14,
    fontWeight: '500',
  },
  taskCompletionLabel: {
    color: colors.slate200,
    fontSize: 12,
  },
});
