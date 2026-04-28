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
import Svg, { Polygon, Circle } from 'react-native-svg';
import { NearshoreStation } from '../constants/buoys';

const WINTER_IDS = new Set(['51101', '51213', '51201', '51208']); // NW, Hanalei, Waimea Bay, Pauwela
const SUMMER_IDS = new Set(['51212']);                             // Lanai
import { Theme } from '../constants/colors';
import { BuoyReading } from '../hooks/useBuoyData';
import {
  formatHeight,
  formatPeriod,
  formatHawaiiTime,
  isOffline,
} from '../constants/formatters';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Direction arrow helper ────────────────────────────────────────────────────

function dirArrowPoints(cx: number, cy: number, size: number, travelDeg: number): string {
  const r = size * 0.44;
  const headW = size * 0.38;
  const headH = size * 0.42;
  const shaftW = size * 0.14;
  const pts: [number, number][] = [
    [0, -r],
    [headW / 2, -r + headH],
    [shaftW / 2, -r + headH],
    [shaftW / 2, r],
    [-shaftW / 2, r],
    [-shaftW / 2, -r + headH],
    [-headW / 2, -r + headH],
  ];
  const rad = (travelDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pts.map(([px, py]) => `${cx + px * cos - py * sin},${cy + px * sin + py * cos}`).join(' ');
}

interface DirArrowProps {
  mwd: number | null;   // "coming from" direction in degrees
  size: number;
  color: string;
  opacity?: number;
}

function DirArrow({ mwd, size, color, opacity = 1 }: DirArrowProps) {
  if (mwd === null) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={size * 0.15} fill={color} opacity={opacity * 0.5} />
      </Svg>
    );
  }
  const travelDeg = (mwd + 180) % 360;
  return (
    <Svg width={size} height={size}>
      <Polygon
        points={dirArrowPoints(size / 2, size / 2, size, travelDeg)}
        fill={color}
        opacity={opacity}
      />
    </Svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface DataScreenProps {
  stations: NearshoreStation[];
  nearshoreData: Record<string, BuoyReading | null>;
  nearshoreHistory: Record<string, BuoyReading[]>;
  height: number;
  refreshing: boolean;
  onRefresh: () => void;
  theme: Theme;
  onBuoyPress?: (id: string) => void;
  onEditPress?: () => void;
}

export default function DataScreen({
  stations,
  nearshoreData,
  nearshoreHistory,
  height,
  refreshing,
  onRefresh,
  theme,
  onBuoyPress,
  onEditPress,
}: DataScreenProps) {
  return (
    <ScrollView
      style={{ width: SCREEN_W, height, backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      directionalLockEnabled
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.accent}
          colors={[theme.accent]}
        />
      }
    >
      <View style={styles.screenHeader}>
        <Text style={[styles.screenTitle, { color: theme.accent }]}>WAVE DATA</Text>
        {onEditPress && (
          <TouchableOpacity onPress={onEditPress} activeOpacity={0.7}>
            <Text style={[styles.editBtn, { color: theme.muted }]}>EDIT ›</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={[styles.titleDivider, { backgroundColor: theme.accent }]} />

      {(['WINTER', 'SUMMER'] as const).map(season => {
        const ids = season === 'WINTER' ? WINTER_IDS : SUMMER_IDS;
        const sectionStations = stations.filter(s =>
          ids.has(s.id) && !isOffline(nearshoreData[s.id]?.timestamp)
        );
        if (sectionStations.length === 0) return null;
        return (
          <View key={season}>
            <Text style={[styles.sectionLabel, { color: theme.muted }]}>{season}</Text>
            <View style={[styles.sectionDivider, { backgroundColor: theme.accentDim }]} />
            {sectionStations.map((station) => {
        const r = nearshoreData[station.id];
        const ht = r?.SwH ?? r?.WVHT ?? null;
        const pd = r?.SwP ?? r?.DPD ?? null;
        const history = nearshoreHistory[station.id] ?? [];

        // Last 4 MWD readings (newest first from history)
        const recentDirs: (number | null)[] = history
          .slice(0, 4)
          .map(row => row.MWD ?? null);
        const currentDir = recentDirs[0] ?? null;
        const prevDirs = recentDirs.slice(1); // up to 3 prev readings

        return (
          <TouchableOpacity key={station.id} onPress={() => onBuoyPress?.(station.id)} activeOpacity={0.7}>
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
                  <View style={styles.arrowRow}>
                    {prevDirs.map((d, i) => (
                      <DirArrow key={i} mwd={d} size={22} color="#4488cc" opacity={0.35 + i * 0.15} />
                    ))}
                    <DirArrow mwd={currentDir} size={28} color={theme.accent} opacity={1} />
                  </View>
                </View>
              </View>
            </View>
            <View style={[styles.rowDivider, { backgroundColor: theme.accentDim }]} />
          </TouchableOpacity>
        );
      })}
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
  screenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  screenTitle: {
    fontSize: 18,
    fontFamily: 'Courier',
    fontWeight: '900',
    letterSpacing: 4,
  },
  editBtn: {
    fontSize: 11,
    fontFamily: 'Courier',
    letterSpacing: 1,
  },
  titleDivider: {
    height: 1,
    opacity: 0.55,
    marginBottom: 4,
  },
  sectionLabel: {
    fontFamily: 'Courier',
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 3,
    marginTop: 14,
    marginBottom: 4,
  },
  sectionDivider: {
    height: 1,
    opacity: 0.4,
    marginBottom: 2,
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
    flex: 1.6,
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
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  rowDivider: {
    height: 1,
    opacity: 0.5,
  },
});
