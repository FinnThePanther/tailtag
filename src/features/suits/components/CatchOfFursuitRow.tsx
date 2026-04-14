import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppAvatar } from '../../../components/ui/AppAvatar';
import { toDisplayDate } from '../../../utils/dates';
import { styles } from './CatchOfFursuitRow.styles';

type CatchOfFursuitRowProps = {
  catchPhotoUrl?: string | null;
  catcherUsername?: string | null;
  catcherAvatarUrl?: string | null;
  caughtAt?: string | null;
  onPress?: () => void;
};

export function CatchOfFursuitRow({
  catchPhotoUrl,
  catcherUsername,
  catcherAvatarUrl,
  caughtAt,
  onPress,
}: CatchOfFursuitRowProps) {
  const displayName = catcherUsername?.trim() || 'Someone';
  const displayDate = toDisplayDate(caughtAt);
  const thumbnailUrl = catchPhotoUrl ?? catcherAvatarUrl;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens catch details"
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <AppAvatar
        url={thumbnailUrl}
        size="md"
        fallback="user"
      />
      <View style={styles.textCol}>
        <Text
          style={styles.name}
          numberOfLines={1}
        >
          {displayName}
        </Text>
        {displayDate ? (
          <Text
            style={styles.date}
            numberOfLines={1}
          >
            {displayDate}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name="chevron-forward"
        size={16}
        color="rgba(148,163,184,0.5)"
      />
    </Pressable>
  );
}
