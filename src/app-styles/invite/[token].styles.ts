import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    gap: spacing.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  header: {
    gap: spacing.xs,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    gap: spacing.md,
  },
  invitePhoto: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  metaGrid: {
    gap: spacing.sm,
  },
  metaItem: {
    gap: 2,
  },
  metaLabel: {
    color: colors.textFaint,
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  metaValue: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '800',
  },
  errorTitle: {
    color: colors.destructive,
    fontSize: 18,
    fontWeight: '800',
  },
  body: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    gap: spacing.md,
  },
  suitList: {
    gap: spacing.sm,
  },
  suitRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  suitRowSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(124,58,237,0.12)',
  },
  suitAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
  },
  suitTextBlock: {
    flex: 1,
    gap: 2,
  },
  suitName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '700',
  },
  suitSpecies: {
    color: colors.textMuted,
    fontSize: 13,
  },
  selectionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  actionError: {
    color: colors.destructive,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.sm,
  },
});
