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
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  centeredContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  helperColumn: {
    gap: spacing.sm,
  },
  errorText: {
    color: colors.destructive,
    fontSize: 14,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  heroSection: {
    gap: spacing.sm,
  },
  heroEyebrow: {
    color: colors.primary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  heroTitle: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: '700',
  },
  heroMeta: {
    color: colors.textSubtle,
    fontSize: 13,
  },
  heroStatsRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroPrimaryStat: {
    color: colors.textMutedStrong,
    fontSize: 18,
    fontWeight: '600',
  },
  heroRankBadge: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: colors.primarySurface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  heroSummary: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '600',
  },
  sectionSubTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    minWidth: 140,
    flexGrow: 1,
    backgroundColor: colors.surfaceMutedSoft,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  statValue: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  statLabel: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  itemList: {
    gap: spacing.sm,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMutedSoft,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowCardPressed: {
    opacity: 0.72,
  },
  rowAvatar: {
    marginRight: spacing.sm,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  rowSubtle: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  followUpCard: {
    gap: spacing.xs,
    backgroundColor: colors.surfaceMutedSoft,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  followUpHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  followUpTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  followUpProfileLink: {
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.md,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  followUpProfileLinkPressed: {
    opacity: 0.72,
  },
  followUpProfileLinkText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  followUpBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  socialLinksList: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  socialLink: {
    gap: 2,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  socialLinkPressed: {
    opacity: 0.72,
  },
  socialLabel: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '600',
  },
  awardsList: {
    gap: spacing.sm,
  },
  awardCard: {
    gap: 4,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  awardTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  awardDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  dayChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  dayChip: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  dayChipLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  achievementsSection: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  achievementList: {
    gap: spacing.xs,
  },
  achievementRow: {
    gap: 2,
    backgroundColor: colors.surfaceMutedSoft,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  achievementTitle: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '600',
  },
  achievementDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  footerActions: {
    gap: spacing.sm,
  },
});
