import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
    marginTop: spacing.lg,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  listStage: {
    position: 'relative',
  },
  rowPosition: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 88,
  },
  row: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    padding: spacing.md,
  },
  rowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceCardStrong,
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
  dragHandle: {
    width: 38,
    height: 38,
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
