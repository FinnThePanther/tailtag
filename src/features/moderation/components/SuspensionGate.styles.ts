import { StyleSheet } from 'react-native';

import { colors, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  content: {
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 340,
  },
  iconContainer: {
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  reason: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  duration: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  contact: {
    color: 'rgba(148,163,184,0.8)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  contactLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  signOutButton: {
    marginTop: spacing.lg,
    minWidth: 160,
  },
});
