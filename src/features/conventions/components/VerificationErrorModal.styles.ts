import { StyleSheet } from 'react-native';

import { colors, spacing } from '@/theme';

export const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  cardWrapper: {
    width: '100%',
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  body: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 14,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  conventionInfo: {
    alignItems: 'center',
    gap: 2,
    marginBottom: spacing.md,
  },
  conventionName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '700',
  },
  conventionLocation: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 13,
  },
  actions: {
    gap: spacing.sm,
  },
});
