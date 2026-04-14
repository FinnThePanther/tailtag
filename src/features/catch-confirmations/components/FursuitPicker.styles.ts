import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  searchInput: {
    marginBottom: spacing.xs,
  },
  center: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textPlaceholder,
    fontSize: 14,
  },
  emptyTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  emptySubtitle: {
    color: colors.textPlaceholder,
    fontSize: 13,
    textAlign: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(148,163,184,0.1)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  rowSelected: {
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  avatarFlexShrink: {
    flexShrink: 0,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  rowSpecies: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
});
