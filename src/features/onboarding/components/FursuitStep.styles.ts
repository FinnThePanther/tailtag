import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  body: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  ctaRow: {
    flexDirection: 'column',
    gap: spacing.sm,
  },
  fullWidthCta: {
    alignSelf: 'stretch',
  },
  form: {
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  helperLabel: {
    color: colors.textSubtle,
    fontSize: 12,
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
  descriptionInput: {
    height: 90,
    textAlignVertical: 'top',
  },
  photoSection: {
    gap: spacing.sm,
  },
  photoPreview: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  photo: {
    width: 140,
    height: 140,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  photoProcessing: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  error: {
    color: colors.destructive,
    fontSize: 14,
  },
  formCtaRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
});
