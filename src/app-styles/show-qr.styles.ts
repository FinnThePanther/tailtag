import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../theme';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  carouselWrapper: {
    flex: 1,
  },
  page: {
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  pageContent: {
    gap: spacing.md,
    alignItems: 'center',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
  },
  pageSubtitle: {
    color: colors.textMuted,
    fontSize: 16,
  },
  pageMeta: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
  },
  largeQrCanvas: {
    backgroundColor: '#ffffff',
    padding: spacing.lg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  avatarMargin: {
    marginVertical: spacing.sm,
  },
  pageDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  pageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.borderEmphasis,
  },
  pageDotActive: {
    backgroundColor: colors.primary,
  },
  footerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.md,
  },
});
