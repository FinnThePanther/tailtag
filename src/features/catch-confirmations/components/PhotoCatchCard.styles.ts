import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 13,
    lineHeight: 18,
  },
  cameraButton: {
    borderColor: colors.primary,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cameraButtonText: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 15,
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  processingText: {
    color: colors.textDim,
    fontSize: 14,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  photoPreview: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  previewActions: {
    flex: 1,
    gap: spacing.xs,
  },
  previewLabel: {
    color: colors.foreground,
    fontWeight: '600',
    fontSize: 14,
  },
  retakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  retakeText: {
    color: colors.textDim,
    fontSize: 13,
  },
  pickerSection: {
    gap: spacing.sm,
  },
  pickerLabel: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  pickerScroll: {
    maxHeight: 280,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  errorText: {
    color: colors.destructive,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  submitButton: {
    width: '100%',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    color: colors.textFaint,
    fontSize: 12,
    flex: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
});
