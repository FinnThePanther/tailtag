import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../theme';

export const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(15,23,42,0.6)',
  },
  rowHighlight: {
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  rowPressed: {
    opacity: 0.7,
  },
  rank: {
    width: 36,
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
  details: {
    flex: 1,
    gap: 4,
  },
  name: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  catchLabel: {
    color: 'rgba(203,213,225,0.8)',
    fontSize: 13,
  },
  avatarMargin: {
    marginRight: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(148,163,184,0.2)',
    marginVertical: spacing.lg,
  },
  message: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 14,
  },
  errorRow: {
    gap: spacing.sm,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
});
