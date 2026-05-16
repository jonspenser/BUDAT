import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SwellLogProvider } from '../contexts/SwellLogContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SwellLogProvider>
        <StatusBar style="light" backgroundColor="#000000" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="buoy/[id]" options={{ gestureEnabled: true, gestureDirection: 'horizontal' }} />
          <Stack.Screen name="buoys" options={{ gestureEnabled: true, gestureDirection: 'horizontal' }} />
          <Stack.Screen name="forecast" options={{ gestureEnabled: true, gestureDirection: 'horizontal' }} />
          <Stack.Screen name="logbook" options={{ gestureEnabled: false }} />
          <Stack.Screen name="alerts" options={{ gestureEnabled: true, gestureDirection: 'horizontal' }} />
          <Stack.Screen name="micwind" options={{ gestureEnabled: true, gestureDirection: 'horizontal' }} />
        </Stack>
      </SwellLogProvider>
    </GestureHandlerRootView>
  );
}
