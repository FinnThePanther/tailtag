import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../src/theme';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  summaryCard: {
    gap: spacing.md,
  },
  summaryHeader: {
    gap: spacing.xs,
  },
  summaryEyebrow: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  summaryTitle: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: '700',
  },
  summaryContent: {
    gap: spacing.md,
  },
  progressHeadline: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '700',
  },
  progressSubhead: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 14,
  },
  progressBar: {
    height: 10,
    width: '100%',
    borderRadius: radius.lg,
    backgroundColor: colors.borderDefault,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  message: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 14,
  },
  errorBlock: {
    gap: spacing.sm,
  },
  helperBlock: {
    gap: spacing.sm,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(148,163,184,0.18)',
    marginVertical: spacing.md,
  },
  groupBlock: {
    gap: spacing.md,
  },
  conventionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  conventionBadge: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  categoryBlock: {
    gap: spacing.sm,
  },
  categoryLabel: {
    color: colors.textSubtle,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  achievementRow: {
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  achievementUnlocked: {
    backgroundColor: colors.primarySurface,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.35)',
  },
  achievementLocked: {
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  achievementContent: {
    gap: spacing.xs,
  },
  achievementName: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  achievementDescription: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 14,
  },
  achievementMeta: {
    color: 'rgba(148,163,184,0.85)',
    fontSize: 13,
  },
  achievementUnlockedAt: {
    color: colors.primary,
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
