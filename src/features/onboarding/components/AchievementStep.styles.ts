import { StyleSheet } from 'react-native';

import { colors, spacing } from '../../../theme';

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
  summary: {
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderRadius: 18,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  summaryTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryText: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(148,163,184,0.4)',
  },
  dotPrimary: {
    backgroundColor: colors.primary,
  },
  dotMuted: {
    backgroundColor: 'rgba(148,163,184,0.4)',
  },
  error: {
    color: colors.destructive,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
});
