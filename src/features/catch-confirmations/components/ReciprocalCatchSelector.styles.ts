import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  description: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
  },
  toggleButton: {
    minWidth: 92,
  },
  suitList: {
    gap: spacing.xs,
  },
  row: {
    alignItems: 'center',
    borderColor: colors.borderMuted,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowSelected: {
    backgroundColor: colors.primarySurface,
    borderColor: colors.primaryBorder,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  rowSpecies: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
});
