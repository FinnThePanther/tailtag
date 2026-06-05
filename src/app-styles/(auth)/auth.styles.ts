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
  modeSwitcher: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 8,
    backgroundColor: colors.surfaceInset,
  },
  modeOption: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: 6,
  },
  modeOptionActive: {
    backgroundColor: colors.primarySurfaceStrong,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  modeOptionPressed: {
    backgroundColor: colors.primarySurface,
  },
  modeOptionText: {
    color: colors.textSubtle,
    fontSize: 14,
    fontWeight: '600',
  },
  modeOptionTextActive: {
    color: colors.primary,
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
  policyAcceptance: {
    gap: spacing.sm,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: 8,
    backgroundColor: colors.surfaceInset,
  },
  checkboxRowPressed: {
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primarySurface,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkboxDisabled: {
    opacity: 0.6,
  },
  checkboxLabel: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  policyLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  policyLinkSeparator: {
    color: colors.textFaint,
    fontSize: 13,
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
