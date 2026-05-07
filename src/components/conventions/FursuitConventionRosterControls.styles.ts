import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../theme';

export const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.surfaceInset,
    padding: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700',
  },
  helper: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  disabledText: {
    color: colors.textSubtle,
  },
});
