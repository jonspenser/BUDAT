import React from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { LogEntry } from '../components/LogEntry';
import { useTransmissionLog } from '../hooks/useTransmissionLog';
import { COLORS } from '../constants/colors';
import { Transmission } from '../constants/types';

export default function LogScreen() {
  const { transmissions, loading } = useTransmissionLog();

  const inFlight = transmissions.filter(
    t => new Date(t.arrivalAt) > new Date(),
  ).length;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" backgroundColor="#000000" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← BACK</Text>
        </Pressable>
        <Text style={styles.title}>TRANSMISSIONS</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.divider} />

      {/* Count header */}
      {transmissions.length > 0 && (
        <View style={styles.countRow}>
          <Text style={styles.countText}>
            {inFlight} SIGNAL{inFlight !== 1 ? 'S' : ''} IN FLIGHT
          </Text>
          <Text style={styles.totalText}>
            {transmissions.length} TOTAL
          </Text>
        </View>
      )}

      {/* List */}
      {loading ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>LOADING...</Text>
        </View>
      ) : transmissions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>NO TRANSMISSIONS YET</Text>
          <Text style={styles.emptySubtext}>COMPOSE A MESSAGE TO BEGIN</Text>
        </View>
      ) : (
        <FlatList<Transmission>
          data={transmissions}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <LogEntry transmission={item} />}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    letterSpacing: 1,
    width: 70,
  },
  title: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.primary,
    letterSpacing: 2,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 70,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  countText: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.primary,
    letterSpacing: 1,
  },
  totalText: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    letterSpacing: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  emptyText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.dim,
    letterSpacing: 2,
  },
  emptySubtext: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.divider,
    letterSpacing: 1,
  },
  listContent: {
    paddingTop: 4,
  },
});
