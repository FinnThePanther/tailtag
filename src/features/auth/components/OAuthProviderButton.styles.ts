import { StyleSheet } from 'react-native';

import { radius } from '../../../theme';

export const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    borderRadius: radius.lg,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  google: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#747775',
  },
  discord: {
    backgroundColor: '#5865f2',
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.6,
  },
  content: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  discordLogo: {
    width: 92,
    height: 14,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  googleLabel: {
    color: '#1f1f1f',
  },
  discordLabel: {
    color: '#ffffff',
  },
});
