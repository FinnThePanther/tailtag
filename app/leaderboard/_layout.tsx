import { Stack } from 'expo-router';

import { colors } from '../../src/theme';

export default function LeaderboardLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="[conventionId]" />
    </Stack>
  );
}
