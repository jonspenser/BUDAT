import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import BreatheAlong from '../components/BreatheAlong';
import { COLORS } from '../constants/colors';

export default function BreatheScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>BREATHE</Text>
          <Text style={styles.subtitle}>GUIDED BREATHING</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <View style={styles.divider} />

      <BreatheAlong />
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerText: {
    alignItems: 'center',
  },
  backBtn: {
    width: 40,
    alignItems: 'center',
  },
  backArrow: {
    fontFamily: 'Courier',
    fontSize: 22,
    color: COLORS.primary,
  },
  title: {
    fontFamily: 'Courier',
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
  },
});
