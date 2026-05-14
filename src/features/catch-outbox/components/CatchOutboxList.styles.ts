import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  compactContainer: {
    marginBottom: spacing.lg,
    borderColor: 'rgba(147,197,253,0.35)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  title: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '700',
  },
  badge: {
    minWidth: 28,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    backgroundColor: 'rgba(147,197,253,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.35)',
  },
  badgeText: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '700',
  },
  description: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.sm,
  },
  listItemSpacing: {
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148,163,184,0.16)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 150,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  statusText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
