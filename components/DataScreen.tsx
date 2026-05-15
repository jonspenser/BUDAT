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

const WINTER_IDS = new Set(['51001', '51000', '51213', '51201', '51208']); // NW, NE, Hanalei, Waimea Bay, Pauwela
const SUMMER_IDS = new Set(['51212', '51205', '51002', '51004']);           // Lanai, Barbers Pt, SW, SE
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
  overlayData?: Record<string, BuoyReading | null>;
  overlayDate?: Date | null;
  overlayLoading?: boolean;
  height: number;
  refreshing: boolean;
  onRefresh: () => void;
  theme: Theme;
  onBuoyPress?: (id: string) => void;
  onEditPress?: () => void;
  onOverlayPress?: () => void;
  onOverlayClear?: () => void;
}

export default function DataScreen({
  stations,
  nearshoreData,
  nearshoreHistory,
  overlayData,
  overlayDate,
  overlayLoading,
  height,
  refreshing,
  onRefresh,
  theme,
  onBuoyPress,
  onEditPress,
  onOverlayPress,
  onOverlayClear,
}: DataScreenProps) {
  const overlayActive = overlayDate != null && overlayData != null;

  // Format overlay date label (short: "MON MAY 4")
  const overlayLabel = overlayDate ? (() => {
    const d = new Date(overlayDate.getTime() - 10 * 3600000); // HST
    const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const h = overlayDate.getUTCHours() - 10; // approx HST hour
    const hr24 = ((h % 24) + 24) % 24;
    const isPm = hr24 >= 12;
    const hr12 = hr24 % 12 || 12;
    return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${d.getUTCDate()} ${hr12}${isPm ? 'p' : 'a'}`;
  })() : '';

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
        <View style={styles.headerBtns}>
          {overlayActive ? (
            <TouchableOpacity onPress={onOverlayClear} activeOpacity={0.7}>
              <Text style={[styles.editBtn, { color: theme.accent }]}>× COMPARE</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={onOverlayPress} activeOpacity={0.7}>
              <Text style={[styles.editBtn, { color: theme.muted }]}>COMPARE</Text>
            </TouchableOpacity>
          )}
          {onEditPress && (
            <TouchableOpacity onPress={onEditPress} activeOpacity={0.7}>
              <Text style={[styles.editBtn, { color: theme.muted }]}>EDIT ›</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      {overlayActive && (
        <View style={[styles.overlayBanner, { backgroundColor: theme.accentDim + '44', borderColor: theme.accentDim }]}>
          {overlayLoading ? (
            <Text style={[styles.overlayBannerText, { color: theme.muted }]}>LOADING...</Text>
          ) : (
            <Text style={[styles.overlayBannerText, { color: theme.muted }]}>
              {'PAST: '}{overlayLabel}
            </Text>
          )}
        </View>
      )}
      <View style={[styles.titleDivider, { backgroundColor: theme.accent }]} />

      {(['WINTER', 'SUMMER'] as const).map(season => {
        const ids = season === 'WINTER' ? WINTER_IDS : SUMMER_IDS;
        const sectionStations = stations.filter(s => ids.has(s.id));
        if (sectionStations.length === 0) return null;
        return (
          <View key={season}>
            <Text style={[styles.sectionLabel, { color: theme.muted }]}>{season}</Text>
            <View style={[styles.sectionDivider, { backgroundColor: theme.accentDim }]} />
            {sectionStations.map((station) => {
        const r = nearshoreData[station.id];
        const swellHt = r?.SwH ?? null;
        const waveHt  = r?.WVHT ?? null;
        const swellPd = r?.SwP ?? null;
        const domPd   = r?.DPD ?? null;
        const swellDir = r?.SwD ?? null;
        const meanDir  = r?.MWD ?? null;
        const history = nearshoreHistory[station.id] ?? [];

        // Past 3 readings (history[0] = current, history[1-3] = past)
        const pastReadings = history.slice(1, 4);
        const HIST_OPACITIES = [0.52, 0.32, 0.18];

        // Overlay (historical compare)
        const ov = overlayActive ? (overlayData?.[station.id] ?? null) : null;
        const ovHt  = ov?.SwH ?? ov?.WVHT ?? null;
        const ovPd  = ov?.SwP ?? ov?.DPD ?? null;
        const ovDir = ov?.SwD ?? ov?.MWD ?? null;

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

                {/* HEIGHT — swell + wave */}
                <View style={styles.dataCell}>
                  <Text style={[styles.dataLabel, { color: theme.muted }]}>SWELL · WAVE</Text>
                  <View style={styles.dualRow}>
                    <Text style={[styles.dataValue, { color: theme.textPrimary }]}>{formatHeight(swellHt)}</Text>
                    {waveHt !== null && <Text style={[styles.dataValueSec, { color: theme.muted }]}>{formatHeight(waveHt)}</Text>}
                  </View>
                  {overlayActive && (
                    <Text style={[styles.overlayValue, { color: theme.accent }]}>{ovHt != null ? formatHeight(ovHt) : '--'}</Text>
                  )}
                  {!overlayActive && pastReadings.map((hr, i) => (
                    <Text key={i} style={[styles.dataValue, { color: theme.textPrimary, opacity: HIST_OPACITIES[i], marginTop: 2 }]}>
                      {formatHeight(hr.SwH ?? null)}
                    </Text>
                  ))}
                </View>

                <View style={[styles.cellDivider, { backgroundColor: theme.accentDim }]} />

                {/* PERIOD — swell + dominant */}
                <View style={styles.dataCell}>
                  <Text style={[styles.dataLabel, { color: theme.muted }]}>SwP · DPD</Text>
                  <View style={styles.dualRow}>
                    <Text style={[styles.dataValue, { color: theme.textPrimary }]}>{formatPeriod(swellPd)}</Text>
                    {domPd !== null && <Text style={[styles.dataValueSec, { color: theme.muted }]}>{formatPeriod(domPd)}</Text>}
                  </View>
                  {overlayActive && (
                    <Text style={[styles.overlayValue, { color: theme.accent }]}>{ovPd != null ? formatPeriod(ovPd) : '--'}</Text>
                  )}
                  {!overlayActive && pastReadings.map((hr, i) => (
                    <Text key={i} style={[styles.dataValue, { color: theme.textPrimary, opacity: HIST_OPACITIES[i], marginTop: 2 }]}>
                      {formatPeriod(hr.SwP ?? null)}
                    </Text>
                  ))}
                </View>

                <View style={[styles.cellDivider, { backgroundColor: theme.accentDim }]} />

                {/* DIRECTION — swell + mean arrows */}
                <View style={[styles.dataCell, styles.dirCell]}>
                  <Text style={[styles.dataLabel, { color: theme.muted }]}>SwD · MWD</Text>
                  <View style={styles.dualRow}>
                    <DirArrow mwd={swellDir} size={26} color={theme.accent} opacity={1} />
                    {meanDir !== null && <DirArrow mwd={meanDir} size={20} color={theme.muted} opacity={0.6} />}
                  </View>
                  {overlayActive && (
                    <DirArrow mwd={ovDir} size={22} color={theme.accent} opacity={0.55} />
                  )}
                  {!overlayActive && pastReadings.map((hr, i) => (
                    <DirArrow key={i} mwd={hr.SwD ?? hr.MWD ?? null} size={22} color={theme.accent} opacity={HIST_OPACITIES[i]} />
                  ))}
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
    alignItems: 'flex-start',
  },
  dataCell: {
    flex: 1,
  },
  dirCell: {
    flex: 1.6,
  },
  cellDivider: {
    width: 1,
    alignSelf: 'stretch',
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
  dataValueSec: {
    fontSize: 12,
    fontFamily: 'Courier',
    letterSpacing: 1,
    alignSelf: 'flex-end',
    marginBottom: 1,
    marginLeft: 4,
  },
  dualRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  rowDivider: {
    height: 1,
    opacity: 0.5,
  },
  headerBtns: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
  },
  overlayBanner: {
    marginBottom: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 3,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  overlayBannerText: {
    fontFamily: 'Courier',
    fontSize: 9,
    letterSpacing: 2,
  },
  overlayValue: {
    fontSize: 13,
    fontFamily: 'Courier',
    fontWeight: '600',
    letterSpacing: 1,
    opacity: 0.55,
    marginTop: 3,
  },
});
