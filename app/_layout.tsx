import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as Notifications from 'expo-notifications';
import { SwellLogProvider } from '../contexts/SwellLogContext';
import { registerSwellAlertTask } from '../tasks/swellAlertTask'; // defineTask runs at module load

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    registerSwellAlertTask().catch(() => {});
  }, []);

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
