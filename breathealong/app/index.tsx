import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import BreatheAlong from '../components/BreatheAlong';
import { COLORS } from '../constants/colors';

export default function Index() {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      <View style={styles.header}>
        <Text style={styles.title}>BREATHE</Text>
        <Text style={styles.subtitle}>GUIDED BREATHING</Text>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  title: {
    fontFamily: 'Courier',
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 3,
  },
  subtitle: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    letterSpacing: 2,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
  },
});
