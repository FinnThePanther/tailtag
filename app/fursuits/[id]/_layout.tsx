import { Stack } from 'expo-router';

import { colors } from '../../../src/theme';

export default function FursuitIdLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="edit" />
      <Stack.Screen name="tags" />
    </Stack>
  );
}
