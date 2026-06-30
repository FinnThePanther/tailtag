import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerButton: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  headerButtonPressed: {
    opacity: 0.5,
  },
  headerButtonDisabled: {
    opacity: 0.45,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
  },
  list: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    padding: spacing.md,
  },
  rank: {
    width: 24,
    color: colors.textSubtle,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    minWidth: 0,
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '700',
  },
  species: {
    color: colors.textMuted,
    fontSize: 13,
  },
  hiddenBadge: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySurface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  hiddenBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceInset,
  },
  iconButtonPressed: {
    opacity: 0.72,
  },
  iconButtonDisabled: {
    opacity: 0.45,
  },
  messageBlock: {
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
});
