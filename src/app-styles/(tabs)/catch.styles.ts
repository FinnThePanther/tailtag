import { StyleSheet } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

export const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.lg,
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 4,
    textTransform: 'uppercase',
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.foreground,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
  },
  cardSpacing: {
    marginBottom: spacing.lg,
  },
  pendingCard: {
    borderColor: colors.amber,
    borderWidth: 2,
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  helpText: {
    color: colors.textSubtle,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  errorContainer: {
    gap: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  errorMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    width: '100%',
  },
  errorText: {
    color: colors.destructive,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  sectionBody: {
    color: colors.textMuted,
    fontSize: 14,
    marginBottom: spacing.md,
    flexShrink: 1,
  },
  sectionHighlight: {
    color: colors.primary,
    fontWeight: '600',
  },
  pendingHighlight: {
    color: colors.amber,
    fontWeight: '600',
  },
  catchProgressNotice: {
    alignItems: 'flex-start',
    backgroundColor: colors.primarySurface,
    borderColor: colors.primaryBorder,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  catchProgressTextBlock: {
    flex: 1,
    gap: 2,
  },
  catchProgressTitle: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  catchProgressBody: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
  },
  postCatchInteractionPreferences: {
    marginBottom: spacing.md,
  },
  batchSummaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  batchSummaryPill: {
    flex: 1,
    backgroundColor: colors.surfaceMutedSoft,
    borderColor: colors.borderMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.sm,
  },
  batchSummaryValue: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
  },
  batchSummaryLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  batchResultList: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  batchResultRow: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMutedSoft,
    borderColor: colors.borderMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  batchResultAvatar: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
  },
  batchResultText: {
    flex: 1,
    gap: 2,
  },
  batchResultName: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '700',
  },
  batchResultStatus: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
  },
  lifecycleCard: {
    marginBottom: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    backgroundColor: colors.surfaceMutedSoft,
  },
  lifecycleTextBlock: {
    gap: spacing.xs,
  },
  lifecycleEyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  lifecycleCta: {
    alignSelf: 'flex-start',
  },
  buttonRow: {
    flexDirection: 'column',
    marginTop: spacing.md,
    alignItems: 'stretch',
  },
  stackedButtonSpacing: {
    marginBottom: spacing.sm,
  },
  codeInput: {
    ...typography.code,
    textTransform: 'uppercase',
    letterSpacing: 4,
    fontSize: 20,
  },
  fullWidthButton: {
    width: '100%',
  },
  reciprocalPromptGroup: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  promptCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryDark,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  pendingPromptCard: {
    marginBottom: spacing.md,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  promptLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.primary,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  pendingPromptLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.amber,
    marginBottom: spacing.xs,
    fontWeight: '600',
  },
  promptBody: {
    fontSize: 16,
    color: colors.foreground,
    lineHeight: 22,
  },
  postCatchProfileLink: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMutedSoft,
    borderColor: colors.borderDefault,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  pendingProfileLink: {
    borderColor: 'rgba(251, 191, 36, 0.35)',
  },
  postCatchProfileLinkPressed: {
    opacity: 0.9,
  },
  postCatchAvatar: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
  },
  postCatchProfileText: {
    flex: 1,
    gap: 2,
  },
  postCatchProfileName: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  postCatchProfileAction: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  photoCatchSpacing: {
    marginBottom: spacing.lg,
  },
  comingSoon: {
    color: colors.textFaint,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
