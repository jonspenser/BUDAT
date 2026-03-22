import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import DroneClickControl from '../components/DroneClickControl';
import { COLORS } from '../constants/colors';

export default function DroneScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← BACK</Text>
        </TouchableOpacity>
        <Text style={styles.title}>DRONE</Text>
        <View style={styles.backSpacer} />
      </View>

      <View style={styles.divider} />

      <DroneClickControl />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  back: {
    minWidth: 64,
  },
  backText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.dim,
    letterSpacing: 1,
  },
  title: {
    fontFamily: 'Courier',
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 4,
  },
  backSpacer: {
    minWidth: 64,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
  },
});
