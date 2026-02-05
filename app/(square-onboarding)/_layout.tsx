import { Stack } from 'expo-router';

export default function SquareOnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#fff' },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
