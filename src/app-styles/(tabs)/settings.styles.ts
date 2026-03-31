import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../theme';

export const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
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
