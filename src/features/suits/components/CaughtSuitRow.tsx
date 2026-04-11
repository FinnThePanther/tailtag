import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppAvatar } from '../../../components/ui/AppAvatar';
import { toDisplayDate } from '../../../utils/dates';
import { styles } from './CaughtSuitRow.styles';

type CaughtSuitRowProps = {
  name: string;
  species?: string | null;
  avatarUrl?: string | null;
  caughtAt?: string | null;
  onPress?: () => void;
};

export function CaughtSuitRow({ name, species, avatarUrl, caughtAt, onPress }: CaughtSuitRowProps) {
  const displaySpecies = species?.trim() || 'Species not set';
  const displayDate = toDisplayDate(caughtAt);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Opens catch details"
      onPress={onPress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
    >
      <AppAvatar
        url={avatarUrl}
        size="md"
        fallback="fursuit"
      />
      <View style={styles.textCol}>
        <Text
          style={styles.name}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={styles.species}
          numberOfLines={1}
        >
          {displaySpecies}
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
