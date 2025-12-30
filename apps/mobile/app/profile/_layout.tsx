import { Stack } from 'expo-router';

export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#FF6B6B' },
        headerTintColor: '#fff',
        headerBackTitle: '뒤로',
      }}
    />
  );
}
