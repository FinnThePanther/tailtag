import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../../theme';
import { styles } from './ScreenHeader.styles';

type ScreenHeaderProps = {
  title: string;
  onBack: () => void;
  right?: ReactNode;
};

export function ScreenHeader({ title, onBack, right }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.inner}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.leftSlot, { opacity: pressed ? 0.5 : 1 }]}
        >
          <Ionicons
            name="chevron-back"
            size={28}
            color={colors.primary}
          />
        </Pressable>
        <Text
          style={styles.title}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View style={styles.rightSlot}>{right ?? null}</View>
      </View>
    </View>
  );
}
