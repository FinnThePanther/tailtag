import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

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
  centeredMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButton: {
    color: colors.primary,
    fontSize: 17,
  },
  profileHeader: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarContainer: {
    marginBottom: spacing.xs,
  },
  username: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  bio: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  sectionTitle: {
    color: colors.primary,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.lg,
    flexWrap: 'wrap',
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 120,
    backgroundColor: colors.surfaceMutedSoft,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderMuted,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  statValue: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    color: colors.textSubtle,
    fontSize: 13,
  },
  socialList: {
    gap: spacing.sm,
  },
  socialLink: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceMutedSoft,
  },
  socialLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  socialUrl: {
    color: colors.primary,
    fontSize: 13,
  },
  suitsList: {
    gap: spacing.md,
  },
  achievementList: {
    gap: spacing.sm,
  },
  achievementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  achievementIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  achievementText: {
    flex: 1,
    gap: 2,
  },
  achievementName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  achievementDescription: {
    color: colors.textSubtle,
    fontSize: 13,
    lineHeight: 18,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
  },
  errorBlock: {
    gap: spacing.sm,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
});
