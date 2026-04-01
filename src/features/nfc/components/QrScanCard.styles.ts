import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
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
  button: {
    width: '100%',
  },
  scannerFrame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.borderInteractive,
    marginBottom: spacing.md,
  },
  scannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  scannerText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
  },
  successCard: {
    alignItems: 'stretch',
    width: '100%',
  },
  pendingCard: {
    borderColor: colors.amber,
    borderWidth: 2,
    width: '100%',
  },
  catchNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: spacing.sm,
    textAlign: 'center',
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
  buttonRow: {
    flexDirection: 'column',
    marginTop: spacing.md,
    gap: spacing.sm,
    width: '100%',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  bioSpacing: {
    marginTop: spacing.md,
  },
  fursuitCardWrapper: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  pendingFursuitBorder: {
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.amber,
    overflow: 'hidden',
  },
});
