import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#000" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }} />
    </>
  );
}
