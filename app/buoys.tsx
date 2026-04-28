import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useBuoyList } from '../hooks/useBuoyList';

export default function BuoysEditScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { activeStations, availableStations, addBuoy, removeBuoy, moveBuoy } = useBuoyList();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.accent }]}>← BACK</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.accent }]}>BUOYS</Text>
        <View style={styles.backBtn} />
      </View>
      <View style={[styles.divider, { backgroundColor: theme.accent }]} />

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Active list */}
        <Text style={[styles.sectionLabel, { color: theme.muted }]}>ACTIVE</Text>
        <View style={[styles.sectionDivider, { backgroundColor: theme.accentDim }]} />

        {activeStations.map((s, idx) => (
          <View key={s.id} style={styles.row}>
            <View style={styles.rowInfo}>
              <Text style={[styles.stationName, { color: theme.accent }]}>{s.name}</Text>
              <Text style={[styles.stationId, { color: theme.muted }]}>{s.id}</Text>
            </View>
            <View style={styles.rowActions}>
              <TouchableOpacity
                onPress={() => moveBuoy(s.id, -1)}
                disabled={idx === 0}
                style={[styles.iconBtn, idx === 0 && styles.disabled]}
              >
                <Text style={[styles.iconText, { color: idx === 0 ? theme.muted : theme.accent }]}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => moveBuoy(s.id, 1)}
                disabled={idx === activeStations.length - 1}
                style={[styles.iconBtn, idx === activeStations.length - 1 && styles.disabled]}
              >
                <Text style={[styles.iconText, { color: idx === activeStations.length - 1 ? theme.muted : theme.accent }]}>↓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => removeBuoy(s.id)}
                style={styles.iconBtn}
              >
                <Text style={[styles.iconText, { color: theme.muted }]}>×</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {activeStations.length === 0 && (
          <Text style={[styles.emptyText, { color: theme.muted }]}>No buoys. Add some below.</Text>
        )}

        {/* Available to add */}
        {availableStations.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.muted, marginTop: 24 }]}>ADD BUOY</Text>
            <View style={[styles.sectionDivider, { backgroundColor: theme.accentDim }]} />
            {availableStations.map(s => (
              <View key={s.id} style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={[styles.stationName, { color: theme.muted }]}>{s.name}</Text>
                  <Text style={[styles.stationId, { color: theme.muted }]}>{s.id}</Text>
                </View>
                <TouchableOpacity onPress={() => addBuoy(s.id)} style={styles.iconBtn}>
                  <Text style={[styles.iconText, { color: theme.accent }]}>+</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  backBtn: { width: 70 },
  backText: { fontFamily: 'Courier', fontWeight: 'bold', fontSize: 12, letterSpacing: 1 },
  title: { fontFamily: 'Courier', fontWeight: '900', fontSize: 18, letterSpacing: 4 },
  divider: { height: 1, opacity: 0.55 },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  sectionLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 6,
  },
  sectionDivider: { height: 1, opacity: 0.35, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.12)',
  },
  rowInfo: { flex: 1 },
  stationName: {
    fontFamily: 'Courier',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 2,
  },
  stationId: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 2,
  },
  rowActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontFamily: 'Courier',
    fontSize: 20,
    fontWeight: '700',
  },
  disabled: { opacity: 0.3 },
  emptyText: {
    fontFamily: 'Courier',
    fontSize: 11,
    letterSpacing: 1,
    fontStyle: 'italic',
    paddingVertical: 12,
  },
});
