import type { TextStyle, ViewStyle } from 'react-native';

import { colors } from './colors';
import { radius, spacing } from './layout';

export const surfacePrimitives: Record<string, ViewStyle> = {
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  cardStrong: {
    backgroundColor: colors.surfaceCardStrong,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  panel: {
    backgroundColor: colors.surfacePanel,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  inset: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  insetSoft: {
    backgroundColor: colors.surfaceMutedSoft,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  insetGhost: {
    backgroundColor: colors.surfaceMutedGhost,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDisabled,
  },
};

export const textPrimitives: Record<string, TextStyle> = {
  title: {
    color: colors.foreground,
    fontWeight: '600',
  },
  body: {
    color: colors.textMuted,
  },
  helper: {
    color: colors.textSubtle,
  },
  faint: {
    color: colors.textFaint,
  },
  eyebrow: {
    color: colors.primary,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
};

export const chipPrimitives: Record<string, ViewStyle | TextStyle> = {
  container: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMutedSoft,
  },
  selectedContainer: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySurfaceStrong,
  },
  label: {
    color: colors.textMutedStrong,
    fontSize: 13,
  },
  selectedLabel: {
    color: colors.primary,
    fontWeight: '600',
  },
  disabledLabel: {
    color: colors.textFaint,
  },
};
