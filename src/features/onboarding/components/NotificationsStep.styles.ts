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
  notificationList: {
    backgroundColor: 'rgba(15,23,42,0.65)',
    borderRadius: 18,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  emoji: {
    fontSize: 18,
    width: 28,
    textAlign: 'center',
  },
  notificationLabel: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 14,
    flex: 1,
  },
  skipButton: {
    marginTop: spacing.sm,
  },
});
