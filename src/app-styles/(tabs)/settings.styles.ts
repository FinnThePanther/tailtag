import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../theme';

export const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  header: {
    flex: 1,
    gap: spacing.xs,
  },
  menuButton: {
    padding: spacing.xs,
    marginTop: 2,
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
    color: colors.textMuted,
  },
  updateNotice: {
    gap: spacing.md,
    backgroundColor: colors.surfaceMutedSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    padding: spacing.lg,
  },
  updateNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  updateNoticeIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
  },
  updateNoticeText: {
    flex: 1,
    gap: spacing.xs,
  },
  updateNoticeTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '700',
  },
  updateNoticeBody: {
    color: colors.textSubtle,
    fontSize: 13,
    lineHeight: 20,
  },
  updateNoticeError: {
    color: '#fca5a5',
    fontSize: 12,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
  },
  statsSection: {
    gap: spacing.md,
  },
  conventionSection: {
    gap: spacing.md,
  },
  accountSection: {
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  toggleText: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  sectionDescription: {
    color: colors.textSubtle,
    fontSize: 13,
    lineHeight: 20,
  },
  sectionSubtitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHint: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  warning: {
    color: '#ef4444',
    fontSize: 12,
  },
  fieldGroup: {
    marginBottom: spacing.md,
  },
  bioInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  usernameInput: {
    height: 48,
    lineHeight: 20,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  helperColumn: {
    gap: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: spacing.lg,
    flexWrap: 'wrap',
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 140,
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
  conventionList: {
    gap: spacing.sm,
  },
  suitListingPrompt: {
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySurface,
    padding: spacing.md,
  },
  suitListingPromptText: {
    gap: spacing.xs,
  },
  suitListingPromptTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '700',
  },
  suitListingPromptBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  suitListingPromptActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pastConventionList: {
    gap: spacing.sm,
  },
  pastConventionCard: {
    gap: spacing.md,
    backgroundColor: colors.surfaceMutedSoft,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderMuted,
    padding: spacing.md,
  },
  pastConventionCardPressed: {
    opacity: 0.72,
  },
  pastConventionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  pastConventionTitleBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  pastConventionName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '700',
  },
  pastConventionMeta: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  rankBadge: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  rankBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  recapStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  recapStat: {
    flexGrow: 1,
    flexBasis: 96,
    gap: 2,
  },
  recapStatValue: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
  },
  recapStatLabel: {
    color: colors.textSubtle,
    fontSize: 11,
  },
  recapCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  recapCtaText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  success: {
    color: '#67e8f9',
    fontSize: 14,
  },
  usernameChecking: {
    color: colors.textSubtle,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  usernameAvailable: {
    color: '#4ade80',
    fontSize: 12,
    marginTop: spacing.xs,
  },
  usernameTaken: {
    color: '#fca5a5',
    fontSize: 12,
    marginTop: spacing.xs,
  },
  usernameInvalid: {
    color: '#fca5a5',
    fontSize: 12,
    marginTop: spacing.xs,
  },
  usernameError: {
    color: colors.textSubtle,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  usernameGuidance: {
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySurface,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  usernameGuidanceTextBlock: {
    gap: spacing.xs,
  },
  usernameGuidanceEyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  usernameGuidanceTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '700',
  },
  usernameGuidanceBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  keepUsernameButton: {},
  avatarSection: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  avatarButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: 'hidden',
  },
  avatarButtonPressed: {
    opacity: 0.7,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderInteractive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPlaceholderText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '500',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialList: {
    gap: spacing.md,
  },
  socialRow: {
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderMuted,
    backgroundColor: colors.surfaceInset,
    padding: spacing.md,
  },
  socialPlatformChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  socialPlatformChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderInteractive,
    backgroundColor: colors.surfaceMutedSoft,
  },
  socialPlatformChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  socialPlatformChipDisabled: {
    opacity: 0.4,
  },
  socialPlatformChipText: {
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: '500',
  },
  socialPlatformChipTextSelected: {
    color: colors.primary,
  },
  socialPlatformChipTextDisabled: {
    color: 'rgba(148,163,184,0.5)',
  },
  socialInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  socialCustomInputs: {
    gap: spacing.sm,
  },
  socialInput: {
    flex: 1,
  },
  socialRemoveButton: {
    flexShrink: 0,
  },
  saveSocialLinksButton: {
    marginTop: spacing.sm,
  },
  helperLabel: {
    color: colors.textPlaceholder,
    fontSize: 13,
  },
});
