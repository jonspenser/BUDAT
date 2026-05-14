import React from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { NEARSHORE_STATIONS } from '../constants/buoys';
import { Theme } from '../constants/colors';
import { WindReading } from '../hooks/useWindData';
import { formatHawaiiTime } from '../constants/formatters';

const { width: SCREEN_W } = Dimensions.get('window');

function cardinalFromDeg(deg: number | null): string {
  if (deg === null) return '--';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

/** m/s → knots, formatted as "X.Xkts" */
function formatKnots(ms: number | null): string {
  if (ms === null) return '--';
  return `${(ms * 1.944).toFixed(1)}kts`;
}

interface WindScreenProps {
  windData: Record<string, WindReading | null>;
  height: number;
  refreshing: boolean;
  onRefresh: () => void;
  theme: Theme;
}

export default function WindScreen({ windData, height, refreshing, onRefresh, theme }: WindScreenProps) {
  const router = useRouter();
  return (
    <ScrollView
      style={{ width: SCREEN_W, height, backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.accent}
          colors={[theme.accent]}
        />
      }
    >
      <View style={styles.titleRow}>
        <Text style={[styles.screenTitle, { color: theme.accent }]}>WIND DATA</Text>
        <TouchableOpacity
          onPress={() => router.push('/micwind')}
          style={[styles.micBtn, { borderColor: theme.accent }]}
          activeOpacity={0.7}
        >
          <Text style={[styles.micBtnText, { color: theme.accent }]}>MIC</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.titleDivider, { backgroundColor: theme.accent }]} />

      {NEARSHORE_STATIONS.map((station) => {
        const r = windData[station.id];
        const wdir = r?.windDirection ?? null;
        const wspd = r?.windSpeed ?? null;
        const wgst = r?.windGust ?? null;
        const hasData = wspd !== null || wdir !== null;

        return (
          <View key={station.id}>
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={[styles.stationName, { color: theme.accent }]}>{station.name}</Text>
                <Text style={[styles.timestamp, { color: theme.muted }]}>
                  {r ? formatHawaiiTime(r.timestamp) + ' HST' : '--'}
                </Text>
              </View>
              {hasData ? (
                <View style={styles.dataRow}>
                  <View style={styles.dataCell}>
                    <Text style={[styles.dataLabel, { color: theme.muted }]}>FROM</Text>
                    <Text style={[styles.dataValue, { color: theme.textPrimary }]}>
                      {wdir !== null
                        ? `${cardinalFromDeg(wdir)}  ${Math.round(wdir)}°`
                        : '--'}
                    </Text>
                  </View>
                  <View style={[styles.cellDivider, { backgroundColor: theme.accentDim }]} />
                  <View style={styles.dataCell}>
                    <Text style={[styles.dataLabel, { color: theme.muted }]}>SPEED</Text>
                    <Text style={[styles.dataValue, { color: theme.textPrimary }]}>{formatKnots(wspd)}</Text>
                  </View>
                  <View style={[styles.cellDivider, { backgroundColor: theme.accentDim }]} />
                  <View style={styles.dataCell}>
                    <Text style={[styles.dataLabel, { color: theme.muted }]}>GUST</Text>
                    {/* Gust gets accent color as a mild alert cue */}
                    <Text style={[styles.dataValue, { color: wgst !== null ? theme.accent : theme.textPrimary }]}>
                      {formatKnots(wgst)}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={[styles.noData, { color: theme.accentDim }]}>NO WIND DATA</Text>
              )}
            </View>
            <View style={[styles.rowDivider, { backgroundColor: theme.accentDim }]} />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  screenTitle: {
    fontSize: 18,
    fontFamily: 'Courier',
    fontWeight: '900',
    letterSpacing: 4,
  },
  micBtn: {
    borderWidth: 1.5,
    borderRadius: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  micBtnText: {
    fontSize: 11,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 2,
  },
  titleDivider: {
    height: 1,
    opacity: 0.55,
    marginBottom: 4,
  },
  row: {
    paddingVertical: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  stationName: {
    fontSize: 13,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 2,
  },
  timestamp: {
    fontSize: 10,
    fontFamily: 'Courier',
    letterSpacing: 1,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dataCell: {
    flex: 1,
  },
  cellDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 10,
  },
  dataLabel: {
    fontSize: 9,
    fontFamily: 'Courier',
    letterSpacing: 1,
    marginBottom: 3,
  },
  dataValue: {
    fontSize: 15,
    fontFamily: 'Courier',
    fontWeight: '600',
    letterSpacing: 1,
  },
  noData: {
    fontSize: 11,
    fontFamily: 'Courier',
    letterSpacing: 2,
  },
  rowDivider: {
    height: 1,
    opacity: 0.5,
  },
});
