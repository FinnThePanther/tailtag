import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceMutedSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
