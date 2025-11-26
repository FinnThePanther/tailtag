import { Stack } from 'expo-router';

/**
 * Layout for /fursuits/* routes.
 * This passes through to nested layouts without adding its own header.
 */
export default function FursuitsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
