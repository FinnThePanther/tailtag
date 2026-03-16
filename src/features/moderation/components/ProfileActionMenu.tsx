import { useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../../theme';
import { useBlockUser } from '../hooks/useBlockUser';
import { ReportModal } from './ReportModal';

type ProfileActionMenuProps = {
  profileId: string;
  profileUsername?: string | null;
};

export function ProfileActionMenu({ profileId, profileUsername }: ProfileActionMenuProps) {
  const [reportVisible, setReportVisible] = useState(false);
  const blockMutation = useBlockUser();

  const confirmBlock = () => {
    const displayName = profileUsername || 'this user';
    Alert.alert(
      `Block ${displayName}?`,
      'They won\'t be able to catch your fursuits, and you won\'t see them on leaderboards. You can unblock them later in Settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            blockMutation.mutate(profileId, {
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
    const options = ['Block user', 'Report user', 'Cancel'];
    const destructiveButtonIndex = 0;
    const cancelButtonIndex = 2;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex,
          cancelButtonIndex,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) confirmBlock();
          if (buttonIndex === 1) setReportVisible(true);
        },
      );
    } else {
      Alert.alert('Actions', undefined, [
        { text: 'Block user', style: 'destructive', onPress: confirmBlock },
        { text: 'Report user', onPress: () => setReportVisible(true) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <>
      <Pressable
        onPress={showMenu}
        hitSlop={8}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
      >
        <Ionicons name="ellipsis-horizontal" size={24} color={colors.foreground} />
      </Pressable>
      <ReportModal
        visible={reportVisible}
        onClose={() => setReportVisible(false)}
        reportedUserId={profileId}
      />
    </>
  );
}
