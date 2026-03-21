import { Stack } from 'expo-router';

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#050510' },
        headerTintColor: '#6C63FF',
        headerTitleStyle: { fontFamily: 'Courier', fontWeight: 'bold' },
        contentStyle: { backgroundColor: '#050510' },
      }}
    />
  );
}
