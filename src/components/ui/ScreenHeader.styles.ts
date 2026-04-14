import { StyleSheet } from 'react-native';

import { colors } from '../../theme';

export const HEADER_HEIGHT = 44;
export const SIDE_SLOT_WIDTH = 56;

export const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.accent,
  },
  inner: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  leftSlot: {
    width: SIDE_SLOT_WIDTH,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.foreground,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  rightSlot: {
    width: SIDE_SLOT_WIDTH,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
