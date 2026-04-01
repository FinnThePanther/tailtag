import { StyleSheet } from 'react-native';

import { radius } from '../../theme';

export const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radius.md,
  },
});
