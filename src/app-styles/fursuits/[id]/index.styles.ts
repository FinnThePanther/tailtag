import { StyleSheet } from 'react-native';

import { colors, radius, spacing, typography } from '../../../theme';

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
  },
  errorBlock: {
    gap: spacing.sm,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  detailStack: {
    gap: spacing.md,
  },
  avatarWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMutedSoft,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.textPlaceholder,
    textAlign: 'center',
  },
  leadDetails: {
    flex: 1,
    minWidth: 0,
  },
  leadName: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  leadMeta: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: 2,
  },
  leadTimeline: {
    color: colors.textSubtle,
    fontSize: 12,
  },
  codeValue: {
    ...typography.code,
    color: colors.primary,
    fontSize: 16,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  sectionItem: {
    color: colors.textMuted,
    fontSize: 14,
  },
  headerButton: {
    color: colors.primary,
    fontSize: 17,
  },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceMutedSoft,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderMuted,
  },
  ownerRowPressed: {
    opacity: 0.7,
  },
  ownerLabel: {
    color: colors.textSubtle,
    fontSize: 13,
    fontWeight: '500',
  },
  ownerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ownerName: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
