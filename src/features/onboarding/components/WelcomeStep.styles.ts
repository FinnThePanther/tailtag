import { StyleSheet } from 'react-native';

import { colors, spacing, textPrimitives } from '../../../theme';

export const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  eyebrow: {
    ...textPrimitives.eyebrow,
    fontSize: 14,
    marginBottom: spacing.xs,
    letterSpacing: 3,
  },
  title: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  body: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 16,
    lineHeight: 22,
  },
  captionBlock: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    gap: 6,
  },
  captionTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  captionBody: {
    color: 'rgba(203,213,225,0.85)',
    fontSize: 15,
    lineHeight: 21,
  },
});
