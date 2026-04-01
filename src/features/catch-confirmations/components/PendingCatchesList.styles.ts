import { StyleSheet } from 'react-native';

import { colors, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  description: {
    color: colors.textSubtle,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  list: {
    gap: 0,
  },
  listItemSpacing: {
    marginBottom: spacing.md,
  },
});
