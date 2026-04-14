import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable } from 'react-native';
import type { ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { TailTagButton } from '../../../components/ui/TailTagButton';
import { colors } from '../../../theme';
import { useBlockUser } from '../hooks/useBlockUser';
import { ReportModal } from './ReportModal';

type TriggerKind = 'icon' | 'button';

type ContentActionMenuProps = {
  currentUserId?: string | null;
  reportedUserId?: string | null;
  reportedFursuitId?: string | null;
  conventionId?: string | null;
  targetName?: string | null;
  reportLabel: string;
  reportTitle?: string;
  blockLabel?: string;
  triggerKind?: TriggerKind;
  triggerLabel?: string;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
};

type MenuAction = {
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

export function ContentActionMenu({
  currentUserId,
  reportedUserId,
  reportedFursuitId,
  conventionId,
  targetName,
  reportLabel,
  reportTitle,
  blockLabel = 'Block user',
  triggerKind = 'icon',
  triggerLabel,
  disabled = false,
  style,
}: ContentActionMenuProps) {
  const [reportVisible, setReportVisible] = useState(false);
  const blockMutation = useBlockUser();

  const isSignedIn = Boolean(currentUserId);
  const isSelfTarget = Boolean(currentUserId && reportedUserId && currentUserId === reportedUserId);
  const reportableUserId = isSelfTarget ? undefined : (reportedUserId ?? undefined);
  const canReport = Boolean(isSignedIn && (reportedFursuitId || reportableUserId));
  const canBlock = Boolean(isSignedIn && reportableUserId);

  if (!canReport && !canBlock) {
    return null;
  }

  const confirmBlock = () => {
    if (!reportableUserId) {
      return;
    }

    const displayName = targetName?.trim() || 'this user';
    Alert.alert(
      `Block ${displayName}?`,
      "They won't be able to catch your fursuits, and you won't see them on leaderboards. You can unblock them later in Settings.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            blockMutation.mutate(reportableUserId, {
              onSuccess: () => {
                Alert.alert('Blocked', `${displayName} has been blocked.`);
              },
              onError: (error: Error) => {
                Alert.alert('Could not block user', error.message);
              },
            });
          },
        },
      ],
    );
  };

  const showMenu = () => {
    if (disabled) {
      return;
    }

    const actions: MenuAction[] = [];

    if (canReport) {
      actions.push({ label: reportLabel, onPress: () => setReportVisible(true) });
    }

    if (canBlock) {
      actions.push({ label: blockLabel, destructive: true, onPress: confirmBlock });
    }

    if (Platform.OS === 'ios') {
      const options = [...actions.map((action) => action.label), 'Cancel'];
      const destructiveButtonIndex = actions.findIndex((action) => action.destructive);

      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: destructiveButtonIndex >= 0 ? destructiveButtonIndex : undefined,
        },
        (buttonIndex) => {
          actions[buttonIndex]?.onPress();
        },
      );
    } else {
      Alert.alert('Actions', undefined, [
        ...actions.map((action) => ({
          text: action.label,
          style: action.destructive ? ('destructive' as const) : ('default' as const),
          onPress: action.onPress,
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]);
    }
  };

  return (
    <>
      {triggerKind === 'button' ? (
        <TailTagButton
          variant="outline"
          size="sm"
          disabled={disabled}
          onPress={showMenu}
          style={style}
          accessibilityLabel={triggerLabel ?? reportLabel}
        >
          {triggerLabel ?? reportLabel}
        </TailTagButton>
      ) : (
        <Pressable
          onPress={showMenu}
          disabled={disabled}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Content actions"
          style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.5 : 1 })}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={24}
            color={colors.foreground}
          />
        </Pressable>
      )}

      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        reportedUserId={reportableUserId}
        reportedFursuitId={reportedFursuitId ?? undefined}
        conventionId={conventionId}
        title={reportTitle ?? reportLabel}
      />
    </>
  );
}
