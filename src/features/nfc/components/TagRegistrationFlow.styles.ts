import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  iconContainer: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: 'rgba(203,213,225,0.9)',
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    lineHeight: 20,
  },
  button: {
    width: '100%',
    marginTop: spacing.xs,
  },
  debugContainer: {
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  debugLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  debugValue: {
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: colors.foreground,
    letterSpacing: 1,
  },
});
