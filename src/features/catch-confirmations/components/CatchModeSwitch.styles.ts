import { StyleSheet } from 'react-native';

import { colors, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  textContainer: {
    flex: 1,
    gap: spacing.xs,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    color: colors.textSubtle,
    fontSize: 12,
    lineHeight: 16,
  },
});
