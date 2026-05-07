import { Dimensions, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

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
  guidanceCard: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySurface,
  },
  guidanceEyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  guidanceTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
  },
  guidanceBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  guidanceSuccess: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  guidanceActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  guidanceSuitList: {
    gap: spacing.sm,
  },
  guidanceSuitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceInset,
    padding: spacing.md,
  },
  guidanceSuitRowPressed: {
    opacity: 0.75,
  },
  guidanceSuitTextBlock: {
    flex: 1,
    gap: 2,
  },
  guidanceSuitName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '700',
  },
  guidanceSuitMeta: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  guidanceSuitAction: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  cardSpacing: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionMeta: {
    color: colors.textSubtle,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
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
});
