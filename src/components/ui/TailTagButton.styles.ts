import { StyleSheet } from 'react-native';

import { radius } from '../../theme';

export const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    alignSelf: 'stretch',
  },
  text: {
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
});
