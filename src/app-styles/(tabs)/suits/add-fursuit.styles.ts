import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  limitBanner: {
    gap: spacing.md,
  },
  limitBannerText: {
    fontSize: 14,
    color: '#fca5a5',
    lineHeight: 20,
  },
  formCard: {
    gap: spacing.lg,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  photoRow: {
    alignItems: 'stretch',
  },
  photoPreview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderInteractive,
  },
  photoProcessing: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  photoPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderInteractive,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMutedSoft,
  },
  photoPlaceholderText: {
    color: colors.textSubtle,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  photoButtons: {
    gap: spacing.sm,
  },
  textArea: {
    minHeight: 96,
  },
  pronounChipList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  helperColumn: {
    gap: spacing.sm,
  },
  colorSelectedList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  colorSelectedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: 'rgba(37,99,235,0.18)',
  },
  colorSelectedText: {
    color: colors.foreground,
    fontSize: 13,
    fontWeight: '600',
  },
  colorSelectedRemove: {
    marginLeft: spacing.xs,
    color: colors.textSubtle,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  colorOptionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  colorChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMutedSoft,
  },
  colorChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurfaceStrong,
  },
  colorChipDisabled: {
    opacity: 0.4,
  },
  colorChipLabel: {
    color: colors.textMutedStrong,
    fontSize: 13,
  },
  colorChipLabelSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  colorChipLabelDisabled: {
    color: colors.textFaint,
  },
  speciesSuggestionSection: {
    gap: spacing.xs,
  },
  speciesSuggestionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  conventionList: {
    gap: spacing.sm,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  helperLabel: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  socialList: {
    gap: spacing.md,
  },
  socialRow: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  socialPlatformChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  socialPlatformChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMutedSoft,
  },
  socialPlatformChipSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(99,102,241,0.2)',
  },
  socialPlatformChipDisabled: {
    opacity: 0.5,
  },
  socialPlatformChipText: {
    color: colors.foreground,
    fontSize: 12,
  },
  socialPlatformChipTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  socialPlatformChipTextDisabled: {
    color: colors.textPlaceholder,
  },
  socialInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  socialCustomInputs: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  socialInput: {
    flex: 1,
  },
  socialRemoveButton: {},
});
