import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../theme';

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
  pendingCardBorder: {
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: colors.amber,
    overflow: 'hidden',
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
  bioSpacing: {
    marginTop: spacing.md,
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
    textTransform: 'uppercase',
    letterSpacing: 4,
    fontSize: 20,
  },
  fullWidthButton: {
    width: '100%',
  },
  promptCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryDark,
  },
  pendingPromptCard: {
    marginBottom: spacing.md,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
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
