import { StyleSheet } from 'react-native';

import { colors, spacing } from '../../theme';

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
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
    lineHeight: 22,
  },
  emailHighlight: {
    color: colors.primary,
    fontWeight: '600',
  },
  formCard: {
    gap: spacing.lg,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    color: colors.foreground,
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 14,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.borderEmphasis,
  },
  dividerLabel: {
    color: colors.textSubtle,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  footerHelper: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  helperText: {
    color: colors.textSubtle,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  link: {
    color: colors.primary,
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
});
