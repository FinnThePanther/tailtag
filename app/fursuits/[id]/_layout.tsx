import { Pressable, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../../../src/theme';

export default function FursuitIdLayout() {
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.foreground, fontWeight: '600' },
        headerBackTitle: ' ',
        contentStyle: { backgroundColor: colors.background },
        // Custom back button for better Android touch handling
        headerLeft: () => (
          <Pressable
            onPress={() => router.back()}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            style={{ paddingHorizontal: Platform.OS === 'android' ? 8 : 0 }}
          >
            <Ionicons
              name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
              size={24}
              color={colors.primary}
            />
          </Pressable>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Fursuit' }} />
      <Stack.Screen name="edit" options={{ title: 'Edit Fursuit' }} />
      <Stack.Screen name="tags" options={{ title: 'NFC Tag' }} />
    </Stack>
  );
}
