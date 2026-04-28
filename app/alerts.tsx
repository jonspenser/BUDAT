import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useAlertSettings } from '../hooks/useAlertSettings';
import { NEARSHORE_STATIONS } from '../constants/buoys';

const HEIGHT_OPTIONS = [2, 3, 4, 6, 8, 10, 15];

export default function AlertsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { settings, update } = useAlertSettings();

  const toggleStation = (id: string) => {
    const current = settings.stationIds;
    if (current.length === 0) {
      // "all" mode — switching to explicit list excluding this one
      const next = NEARSHORE_STATIONS.map(s => s.id).filter(s => s !== id);
      update({ stationIds: next });
    } else if (current.includes(id)) {
      const next = current.filter(s => s !== id);
      update({ stationIds: next });
    } else {
      update({ stationIds: [...current, id] });
    }
  };

  const isStationOn = (id: string) =>
    settings.stationIds.length === 0 || settings.stationIds.includes(id);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.accent }]}>← BACK</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.accent }]}>ALERTS</Text>
        <View style={styles.backBtn} />
      </View>
      <View style={[styles.divider, { backgroundColor: theme.accent }]} />

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Master toggle */}
        <Text style={[styles.sectionLabel, { color: theme.muted }]}>NEW SWELL ALERTS</Text>
        <View style={[styles.sectionDivider, { backgroundColor: theme.accentDim }]} />
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>Enabled</Text>
          <Switch
            value={settings.enabled}
            onValueChange={val => update({ enabled: val })}
            thumbColor={settings.enabled ? theme.accent : theme.muted}
            trackColor={{ false: theme.accentDim, true: theme.accentDim }}
          />
        </View>
        <Text style={[styles.hint, { color: theme.muted }]}>
          Alerts fire when a new swell is detected (height rises ≥50% above the 6–18hr baseline and crosses a size category).
        </Text>

        {/* Min height */}
        <Text style={[styles.sectionLabel, { color: theme.muted, marginTop: 24 }]}>MIN HEIGHT</Text>
        <View style={[styles.sectionDivider, { backgroundColor: theme.accentDim }]} />
        <View style={styles.chipRow}>
          {HEIGHT_OPTIONS.map(ft => (
            <TouchableOpacity
              key={ft}
              onPress={() => update({ minHeightFt: ft })}
              style={[
                styles.chip,
                { borderColor: settings.minHeightFt === ft ? theme.accent : theme.accentDim },
              ]}
            >
              <Text style={[styles.chipText, { color: settings.minHeightFt === ft ? theme.accent : theme.muted }]}>
                {ft}ft
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Station toggles */}
        <Text style={[styles.sectionLabel, { color: theme.muted, marginTop: 24 }]}>WATCH STATIONS</Text>
        <View style={[styles.sectionDivider, { backgroundColor: theme.accentDim }]} />
        {NEARSHORE_STATIONS.map(s => (
          <View key={s.id} style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.textPrimary }]}>{s.name}</Text>
            <Switch
              value={isStationOn(s.id)}
              onValueChange={() => toggleStation(s.id)}
              thumbColor={isStationOn(s.id) ? theme.accent : theme.muted}
              trackColor={{ false: theme.accentDim, true: theme.accentDim }}
            />
          </View>
        ))}
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
  sectionLabel: { fontFamily: 'Courier', fontSize: 10, letterSpacing: 2, marginBottom: 6 },
  sectionDivider: { height: 1, opacity: 0.35, marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(128,128,128,0.12)',
  },
  rowLabel: { fontFamily: 'Courier', fontSize: 13, letterSpacing: 1 },
  hint: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 0.5,
    lineHeight: 16,
    marginTop: 8,
    opacity: 0.7,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 12 },
  chip: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { fontFamily: 'Courier', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
});
