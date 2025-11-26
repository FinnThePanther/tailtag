import { Pressable } from 'react-native';
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
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Fursuit',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={24} color={colors.primary} />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="edit" options={{ title: 'Edit Fursuit' }} />
      <Stack.Screen name="tags" options={{ title: 'NFC Tag' }} />
    </Stack>
  );
}
