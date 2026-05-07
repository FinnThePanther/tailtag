import { Dimensions, StyleSheet } from 'react-native';

import { colors, radius, spacing, typography } from '../../../theme';

const SCREEN_WIDTH = Dimensions.get('window').width;
const IS_COMPACT_SCREEN = SCREEN_WIDTH <= 430;

export const FURSUIT_CARD_IMAGE_SIZE = SCREEN_WIDTH * 0.5;

export const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceCardStrong,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: IS_COMPACT_SCREEN ? spacing.sm : spacing.md,
  },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: IS_COMPACT_SCREEN ? spacing.sm : spacing.md,
    marginBottom: IS_COMPACT_SCREEN ? spacing.sm : spacing.md,
  },
  avatarWrapper: {
    width: '50%',
    aspectRatio: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.textPlaceholder,
    textAlign: 'center',
  },
  details: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: colors.foreground,
    fontSize: IS_COMPACT_SCREEN ? 16 : 18,
    fontWeight: '600',
    marginBottom: IS_COMPACT_SCREEN ? 2 : 4,
  },
  species: {
    color: colors.textMuted,
    fontSize: IS_COMPACT_SCREEN ? 13 : 14,
    marginBottom: IS_COMPACT_SCREEN ? 2 : 4,
  },
  colors: {
    color: colors.textSubtle,
    fontSize: IS_COMPACT_SCREEN ? 12 : 13,
    marginBottom: IS_COMPACT_SCREEN ? 2 : 4,
  },
  timeline: {
    color: colors.textSubtle,
    fontSize: IS_COMPACT_SCREEN ? 11 : 12,
  },
  metaRow: {
    flexDirection: IS_COMPACT_SCREEN ? 'column' : 'row',
    alignItems: IS_COMPACT_SCREEN ? 'flex-start' : 'center',
    justifyContent: 'space-between',
    marginTop: IS_COMPACT_SCREEN ? spacing.sm : spacing.md,
    gap: IS_COMPACT_SCREEN ? spacing.sm : spacing.md,
  },
  codeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: IS_COMPACT_SCREEN ? 0 : 1,
    flexShrink: 1,
    minWidth: 0,
  },
  actionSlot: {
    flexShrink: 0,
    alignSelf: IS_COMPACT_SCREEN ? 'stretch' : 'auto',
    width: IS_COMPACT_SCREEN ? '100%' : 'auto',
  },
  codeLabel: {
    fontSize: IS_COMPACT_SCREEN ? 10 : 11,
    textTransform: 'uppercase',
    letterSpacing: IS_COMPACT_SCREEN ? 2 : 3,
    color: colors.textSubtle,
    marginRight: spacing.xs,
  },
  codeValue: {
    ...typography.code,
    color: colors.primary,
    fontSize: IS_COMPACT_SCREEN ? 14 : 16,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: IS_COMPACT_SCREEN ? spacing.xs : spacing.sm,
    paddingVertical: IS_COMPACT_SCREEN ? 2 : 4,
    borderRadius: radius.md,
  },
});
