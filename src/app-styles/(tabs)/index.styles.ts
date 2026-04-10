import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../theme';

export const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backgroundGradient: {
    position: 'absolute',
    top: -120,
    left: -60,
    right: -60,
    height: 320,
    borderRadius: 240,
    opacity: 0.6,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  brand: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  caption: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroBlock: {
    marginBottom: spacing.xl,
  },
  nudgeCard: {
    marginBottom: spacing.xl,
  },
  nudgeCardAlert: {
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.5)',
    backgroundColor: 'rgba(127,29,29,0.35)',
  },
  nudgeContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  nudgeTextBlock: {
    flex: 1,
    gap: spacing.sm,
  },
  nudgeText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  nudgeTextAlert: {
    color: '#fecaca',
  },
  nudgeUsername: {
    fontWeight: '700',
    color: colors.foreground,
  },
  nudgeUsernameAlert: {
    color: '#fca5a5',
  },
  nudgeDismiss: {
    paddingTop: 2,
  },
  dailyCard: {
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  dailySummaryBlock: {
    gap: spacing.sm,
  },
  dailySummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dailySummaryText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  dailyProgressBar: {
    backgroundColor: colors.borderDefault,
    width: '100%',
  },
  dailyCountdown: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  dailyResetLabel: {
    color: 'rgba(203,213,225,0.8)',
    fontSize: 12,
  },
  dailyCta: {},
  achievementsCard: {
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  achievementSummary: {
    gap: spacing.sm,
  },
  achievementSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  achievementProgressLabel: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
  },
  achievementProgressBar: {
    height: 8,
    width: '100%',
    borderRadius: radius.md,
    backgroundColor: colors.borderDefault,
    overflow: 'hidden',
  },
  achievementProgressFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
  achievementFootnote: {
    color: 'rgba(203,213,225,0.75)',
    fontSize: 13,
  },
  achievementCta: {},
  badge: {
    alignSelf: 'flex-start',
    color: '#bae6fd',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.4)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    fontSize: 11,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 32,
    color: colors.foreground,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: 18,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  ctaRow: {
    gap: spacing.md,
  },
  leaderboardCard: {
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  leaderboardCta: {},
  loopCard: {
    marginBottom: spacing.xl,
  },
  sectionEyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  sectionSubheading: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.xs,
  },
  sectionBody: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
  },
  helper: {
    gap: spacing.sm,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  leaderboardContent: {
    gap: spacing.md,
  },
  leaderboardStack: {
    gap: spacing.lg,
  },
  leaderboardDivider: {
    height: 1,
    backgroundColor: colors.borderMuted,
    width: '100%',
  },
  leaderboardSection: {
    gap: spacing.sm,
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
  reloadButton: {},
  suitLeaderboardSection: {
    gap: spacing.sm,
  },
  leaderboardList: {
    gap: spacing.xs,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  leaderboardRowHighlight: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySurface,
  },
  leaderboardRowPressed: {
    opacity: 0.7,
  },
  leaderboardRank: {
    width: 36,
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  leaderboardDetails: {
    flex: 1,
    gap: 4,
  },
  avatarMargin: {
    marginRight: spacing.md,
  },
  leaderboardName: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  leaderboardCatchLabel: {
    color: 'rgba(203,213,225,0.8)',
    fontSize: 13,
  },
  leaderboardFootnote: {
    color: 'rgba(203,213,225,0.7)',
    fontSize: 12,
  },
  seeAllLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  seeAllLinkPressed: {
    opacity: 0.6,
  },
  seeAllText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  seeAllArrow: {
    color: colors.primary,
    fontSize: 13,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepRowSpacing: {
    marginBottom: spacing.md,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primarySurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  stepBadgeText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  stepDetails: {
    flex: 1,
  },
  stepTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  stepDescription: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
