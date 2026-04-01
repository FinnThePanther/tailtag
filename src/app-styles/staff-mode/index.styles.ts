import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  eyebrow: {
    color: colors.primary,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  title: {
    color: colors.foreground,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(226,232,240,0.85)',
    fontSize: 14,
  },
  message: {
    color: 'rgba(148,163,184,0.95)',
    fontSize: 14,
    marginTop: spacing.sm,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
    marginTop: spacing.sm,
  },
  searchSection: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  helperText: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
    flex: 1,
  },
  resultsSection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(15,23,42,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  resultMeta: {
    flex: 1,
    gap: 2,
  },
  resultName: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
  },
  resultSub: {
    color: 'rgba(148,163,184,0.9)',
    fontSize: 12,
  },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
  },
  statusGood: {
    backgroundColor: 'rgba(34,197,94,0.12)',
  },
  statusBad: {
    backgroundColor: 'rgba(248,113,113,0.12)',
  },
  statusText: {
    color: colors.foreground,
    fontSize: 12,
    fontWeight: '700',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(148,163,184,0.2)',
    marginVertical: spacing.sm,
  },
  lastSection: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionButton: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
});
