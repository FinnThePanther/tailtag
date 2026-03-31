import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.2)',
  },
  title: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '600',
  },
  cancelText: {
    color: colors.primary,
    fontSize: 16,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  label: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  typeList: {
    gap: spacing.sm,
  },
  typeOption: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.3)',
    backgroundColor: 'rgba(30,41,59,0.6)',
  },
  typeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(56,189,248,0.12)',
  },
  typeOptionText: {
    color: 'rgba(203,213,225,0.9)',
    fontSize: 15,
  },
  typeOptionTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
});
