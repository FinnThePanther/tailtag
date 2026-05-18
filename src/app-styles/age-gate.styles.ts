import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../theme';

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  card: {
    gap: spacing.lg,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySurface,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.foreground,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  actionGroup: {
    gap: spacing.sm,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
    lineHeight: 20,
  },
});
