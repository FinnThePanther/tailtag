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
    marginBottom: spacing.md,
  },
  search: {
    marginBottom: spacing.md,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  listHeaderText: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    maxHeight: 320,
    marginBottom: spacing.md,
  },
  listContent: {
    gap: spacing.sm,
  },
  listItem: {
    marginBottom: spacing.sm,
  },
  message: {
    color: 'rgba(148,163,184,0.85)',
    fontSize: 15,
  },
  error: {
    color: colors.destructive,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
});
