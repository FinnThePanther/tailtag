import { StyleSheet } from 'react-native';

import { colors, radius, spacing } from '../../../theme';

export const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surfaceCardStrong,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.amber,
    padding: spacing.md,
    position: 'relative',
  },
  expiredContainer: {
    borderColor: colors.destructive,
    opacity: 0.7,
  },
  expiredOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15,23,42,0.95)',
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    zIndex: 10,
  },
  expiredTitle: {
    color: colors.destructive,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  expiredSubtitle: {
    color: colors.textSubtle,
    fontSize: 13,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  catcherInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  textInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  username: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textSubtle,
    fontSize: 13,
    marginTop: 2,
  },
  fursuitName: {
    color: colors.primary,
    fontWeight: '500',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251,191,36,0.15)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.md,
  },
  timeText: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '500',
  },
  expiredText: {
    color: colors.destructive,
  },
  catchPhoto: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  contextContainer: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fursuitContextText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '500',
  },
  contextText: {
    color: colors.textDim,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  rejectButton: {
    borderColor: colors.borderInteractive,
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenPhoto: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
