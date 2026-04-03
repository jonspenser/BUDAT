import React from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { NEARSHORE_STATIONS } from '../constants/buoys';
import { Theme } from '../constants/colors';
import { BuoyReading } from '../hooks/useBuoyData';
import {
  formatHeight,
  formatPeriod,
  formatHawaiiTime,
} from '../constants/formatters';

const { width: SCREEN_W } = Dimensions.get('window');

function cardinalFromDeg(deg: number | null): string {
  if (deg === null) return '--';
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

interface DataScreenProps {
  nearshoreData: Record<string, BuoyReading | null>;
  height: number;
  refreshing: boolean;
  onRefresh: () => void;
  theme: Theme;
}

export default function DataScreen({ nearshoreData, height, refreshing, onRefresh, theme }: DataScreenProps) {
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
      <Text style={[styles.screenTitle, { color: theme.accent }]}>WAVE DATA</Text>
      <View style={[styles.titleDivider, { backgroundColor: theme.accent }]} />

      {NEARSHORE_STATIONS.map((station) => {
        const r = nearshoreData[station.id];
        const ht = r?.waveHeight ?? null;
        const pd = r?.dominantPeriod ?? null;
        const dir = r?.waveDirection ?? null;

        return (
          <View key={station.id}>
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={[styles.stationName, { color: theme.accent }]}>{station.name}</Text>
                <Text style={[styles.timestamp, { color: theme.muted }]}>
                  {r ? formatHawaiiTime(r.timestamp) + ' HST' : '--'}
                </Text>
              </View>
              <View style={styles.dataRow}>
                <View style={styles.dataCell}>
                  <Text style={[styles.dataLabel, { color: theme.muted }]}>HEIGHT</Text>
                  <Text style={[styles.dataValue, { color: theme.textPrimary }]}>{formatHeight(ht)}</Text>
                </View>
                <View style={[styles.cellDivider, { backgroundColor: theme.accentDim }]} />
                <View style={styles.dataCell}>
                  <Text style={[styles.dataLabel, { color: theme.muted }]}>PERIOD</Text>
                  <Text style={[styles.dataValue, { color: theme.textPrimary }]}>{formatPeriod(pd)}</Text>
                </View>
                <View style={[styles.cellDivider, { backgroundColor: theme.accentDim }]} />
                <View style={[styles.dataCell, styles.dirCell]}>
                  <Text style={[styles.dataLabel, { color: theme.muted }]}>DIRECTION</Text>
                  <Text style={[styles.dataValue, { color: theme.textPrimary }]}>
                    {dir !== null
                      ? `${cardinalFromDeg(dir)}  ${Math.round(dir)}°`
                      : '--'}
                  </Text>
                </View>
              </View>
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
  screenTitle: {
    fontSize: 18,
    fontFamily: 'Courier',
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 8,
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
  dirCell: {
    flex: 1.4,
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
  rowDivider: {
    height: 1,
    opacity: 0.5,
  },
});
