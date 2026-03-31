import { Dimensions, StyleSheet } from 'react-native';

import { colors, spacing } from '../../../src/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const IS_SMALL_SCREEN = SCREEN_WIDTH <= 375;

export const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: IS_SMALL_SCREEN ? spacing.md : spacing.lg,
    paddingTop: IS_SMALL_SCREEN ? spacing.lg : spacing.xl,
    paddingBottom: spacing.xxl,
    gap: IS_SMALL_SCREEN ? spacing.md : spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.foreground,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
  },
  helperRow: {
    flexDirection: IS_SMALL_SCREEN ? 'column' : 'row',
    alignItems: IS_SMALL_SCREEN ? 'flex-start' : 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  helperText: {
    color: colors.textMuted,
    flex: IS_SMALL_SCREEN ? 0 : 1,
    fontSize: 14,
  },
  cardSpacing: {
    marginBottom: spacing.lg,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
  },
  helperColumn: {
    gap: spacing.sm,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  list: {
    marginTop: spacing.md,
  },
  listItemSpacing: {
    marginBottom: spacing.md,
  },
  deleteLink: {
    fontSize: IS_SMALL_SCREEN ? 10 : 11,
    textTransform: 'uppercase',
    letterSpacing: IS_SMALL_SCREEN ? 2 : 3,
    color: colors.destructive,
    fontWeight: '600',
  },
});
