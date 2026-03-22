import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { COLORS } from '../constants/colors';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor={COLORS.bg} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.bg },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: 'Courier' },
          contentStyle: { backgroundColor: COLORS.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ title: 'BREATHEALONG' }} />
        <Stack.Screen name="generate" options={{ title: 'GENERATING PATTERN' }} />
        <Stack.Screen
          name="session"
          options={{ title: 'SESSION', headerShown: false }}
        />
      </Stack>
    </>
  );
}
