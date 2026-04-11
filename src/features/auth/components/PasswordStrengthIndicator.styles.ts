import { StyleSheet } from 'react-native';

import { spacing } from '../../../theme';

export const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
    minWidth: 44,
  },
  checklist: {
    gap: 5,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkLabel: {
    fontSize: 12,
    color: 'rgba(148,163,184,0.6)',
  },
  checkLabelMet: {
    color: 'rgba(148,163,184,0.9)',
  },
});
