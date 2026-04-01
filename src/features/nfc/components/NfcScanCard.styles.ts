import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  pendingCard: {
    borderColor: colors.amber,
    borderWidth: 2,
  },
  successCard: {
    alignItems: 'stretch',
    width: '100%',
  },
  iconContainer: {
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  catchNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  button: {
    width: '100%',
  },
  buttonRow: {
    flexDirection: 'column',
    marginTop: spacing.md,
    gap: spacing.sm,
    width: '100%',
  },
  promptCard: {
    marginBottom: spacing.md,
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primaryDark,
    width: '100%',
  },
  pendingPromptCard: {
    marginBottom: spacing.md,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderColor: 'rgba(251, 191, 36, 0.3)',
    width: '100%',
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
  fursuitCardWrapper: {
    width: '100%',
  },
  pendingFursuitBorder: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.amber,
    overflow: 'hidden',
    width: '100%',
  },
  bioSpacing: {
    marginTop: spacing.md,
    width: '100%',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  debugContainer: {
    backgroundColor: colors.backgroundElevated,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
    alignItems: 'center',
  },
  debugLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  debugValue: {
    fontSize: 18,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: colors.foreground,
    letterSpacing: 2,
  },
});
