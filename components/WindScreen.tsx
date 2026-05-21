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
import { WindReading } from '../hooks/useWindData';
import { formatHawaiiTime, getCardinalDirection } from '../constants/formatters';

const { width: SCREEN_W } = Dimensions.get('window');

function formatKnots(knots: number | null): string {
  if (knots === null) return '--';
  return `${knots.toFixed(1)}kts`;
}

interface WindScreenProps {
  windData: Record<string, WindReading | null>;
  height: number;
  refreshing: boolean;
  onRefresh: () => void;
  theme: Theme;
}

export default function WindScreen({ windData, height, refreshing, onRefresh, theme }: WindScreenProps) {
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
      <Text style={[styles.screenTitle, { color: theme.accent }]}>WIND DATA</Text>
      <View style={[styles.titleDivider, { backgroundColor: theme.accent }]} />

      {NEARSHORE_STATIONS.map((station) => {
        const r = windData[station.id];
        const wdir = r?.dir ?? null;
        const wspd = r?.speed ?? null;
        const wgst = r?.gust ?? null;
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
                        ? `${getCardinalDirection(wdir) ?? '--'}  ${Math.round(wdir)}°`
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
