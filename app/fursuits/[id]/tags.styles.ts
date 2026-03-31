import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../src/theme';

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
  message: {
    color: colors.textMuted,
    fontSize: 14,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  tagSection: {
    gap: spacing.md,
  },
  tagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  tagInfo: {
    gap: spacing.xs / 2,
  },
  tagLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textDim,
  },
  tagUid: {
    fontFamily: 'monospace',
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
    letterSpacing: 1,
  },
  tagDate: {
    fontSize: 14,
    color: colors.foreground,
  },
  tagActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  warningBox: {
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  warningText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  emptySection: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
  },
  emptyBody: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  registerButton: {
    marginTop: spacing.sm,
  },
  registerNewSection: {
    gap: spacing.sm,
  },
  qrSection: {
    gap: spacing.md,
  },
  qrMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  qrPreview: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCanvas: {
    backgroundColor: '#ffffff',
    padding: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  qrDescription: {
    color: colors.textMuted,
    fontSize: 14,
  },
  qrButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
