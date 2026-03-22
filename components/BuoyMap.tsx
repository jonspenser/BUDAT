import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent, TouchableOpacity, Modal, Pressable } from 'react-native';
import Svg, { Polygon, Line } from 'react-native-svg';
import { ISLANDS } from '../constants/hawaii';
import { BUOY_STATIONS, BuoyStation, Season } from '../constants/buoys';
import { BuoyData } from '../hooks/useNDBCData';
import { COLORS } from '../constants/colors';

// Island bounds — zoomed to fill center cell
const I_LON_MIN = -160.5;
const I_LON_MAX = -154.6;
const I_LAT_MAX = 23.0;
const I_LAT_MIN = 18.8;

function ArrowSvg({
  size,
  directionDeg,
  heightFt,
  periodSec,
}: {
  size: number;
  directionDeg: number | null;
  heightFt: number | null;
  periodSec: number | null;
}) {
  if (directionDeg === null) return <View style={{ width: size, height: size }} />;
  const cx = size / 2;
  const cy = size / 2;
  const travelDeg = (directionDeg + 180) % 360;
  const rad = (travelDeg - 90) * (Math.PI / 180);
  const len = Math.min(Math.max((heightFt ?? 3) * 4, 12), size * 0.44);
  const sw = Math.min(Math.max(((periodSec ?? 10) - 6) * 0.45, 1.2), 5);
  const tx = cx + Math.cos(rad) * len;
  const ty = cy + Math.sin(rad) * len;
  const hl = len * 0.35;
  const ha = 0.5;
  return (
    <Svg width={size} height={size}>
      <Line x1={cx} y1={cy} x2={tx} y2={ty} stroke={COLORS.primary} strokeWidth={sw} />
      <Line
        x1={tx} y1={ty}
        x2={tx - hl * Math.cos(rad - ha)} y2={ty - hl * Math.sin(rad - ha)}
        stroke={COLORS.primary} strokeWidth={sw}
      />
      <Line
        x1={tx} y1={ty}
        x2={tx - hl * Math.cos(rad + ha)} y2={ty - hl * Math.sin(rad + ha)}
        stroke={COLORS.primary} strokeWidth={sw}
      />
    </Svg>
  );
}

function cornerPos(corner: string, col: number, row: number) {
  switch (corner) {
    case 'NW': return { left: 0,       top: 0 };
    case 'NE': return { left: 2 * col, top: 0 };
    case 'SW': return { left: 0,       top: 2 * row };
    case 'SE': return { left: 2 * col, top: 2 * row };
    default:   return { left: 0,       top: 0 };
  }
}

interface Props {
  buoyData: Record<string, BuoyData>;
  season: Season;
  currentTideHeight?: number | null;
}

export default function BuoyMap({ buoyData, season, currentTideHeight }: Props) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [selected, setSelected] = useState<{ station: BuoyStation; data: BuoyData | null } | null>(null);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  }, []);

  const { w, h } = size;
  const col = w / 3;
  const row = h / 3;

  const stations = BUOY_STATIONS.filter(s => s.season.includes(season));
  const cornerStations = stations.filter(s => s.corner);
  const nearshoreStations = stations.filter(s => !s.corner);

  function projectIsland(lon: number, lat: number) {
    return {
      x: col + ((lon - I_LON_MIN) / (I_LON_MAX - I_LON_MIN)) * col,
      y: row + ((I_LAT_MAX - lat) / (I_LAT_MAX - I_LAT_MIN)) * row,
    };
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      {w > 0 && h > 0 && (
        <>
          <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
            {/* Grid lines */}
            <Line x1={col}     y1={0} x2={col}     y2={h} stroke={COLORS.divider} strokeWidth={0.5} />
            <Line x1={2 * col} y1={0} x2={2 * col} y2={h} stroke={COLORS.divider} strokeWidth={0.5} />
            <Line x1={0} y1={row}     x2={w} y2={row}     stroke={COLORS.divider} strokeWidth={0.5} />
            <Line x1={0} y1={2 * row} x2={w} y2={2 * row} stroke={COLORS.divider} strokeWidth={0.5} />

            {/* Island outlines in center cell */}
            {ISLANDS.map(island => {
              const pts = island.coords
                .map(([lon, lat]) => {
                  const p = projectIsland(lon, lat);
                  return `${p.x},${p.y}`;
                })
                .join(' ');
              return (
                <Polygon
                  key={island.name}
                  points={pts}
                  fill="none"
                  stroke={COLORS.mapOutline}
                  strokeWidth={1}
                />
              );
            })}
          </Svg>

          {/* Corner buoys */}
          {cornerStations.map(station => {
            const d = buoyData[station.id];
            const pos = cornerPos(station.corner!, col, row);
            const isRight = station.corner === 'NE' || station.corner === 'SE';

            return (
              <TouchableOpacity
                key={station.id}
                activeOpacity={0.7}
                onPress={() => setSelected({ station, data: d ?? null })}
                style={[
                  styles.cornerCell,
                  { left: pos.left, top: pos.top, width: col, height: row },
                  isRight ? styles.alignRight : styles.alignLeft,
                ]}
              >
                <Text style={styles.cornerDeg}>
                  {d?.directionDeg != null ? `${Math.round(d.directionDeg)} °` : '--'}
                </Text>
                <ArrowSvg
                  size={72}
                  directionDeg={d?.directionDeg ?? null}
                  heightFt={d?.waveHeightFt ?? null}
                  periodSec={d?.periodSec ?? null}
                />
                <Text style={styles.cornerName}>{station.name}</Text>
                <Text style={styles.cornerData}>
                  {d?.waveHeightFt != null ? `${d.waveHeightFt}ft` : '--'}
                  {'  '}
                  {d?.periodSec != null ? `${d.periodSec}s` : ''}
                </Text>
                {d?.timestamp ? <Text style={styles.cornerTime}>{d.timestamp}</Text> : null}
              </TouchableOpacity>
            );
          })}

          {/* Nearshore buoys over island map */}
          {nearshoreStations.map(station => {
            const d = buoyData[station.id];
            const p = projectIsland(station.lon, station.lat);

            return (
              <TouchableOpacity
                key={station.id}
                activeOpacity={0.7}
                onPress={() => setSelected({ station, data: d ?? null })}
                style={[styles.nearshoreWrap, { left: p.x - 40, top: p.y - 14 }]}
              >
                <Text style={styles.nearshoreDeg}>
                  {d?.directionDeg != null ? `${Math.round(d.directionDeg)}°` : ''}
                </Text>
                <ArrowSvg
                  size={46}
                  directionDeg={d?.directionDeg ?? null}
                  heightFt={d?.waveHeightFt ?? null}
                  periodSec={d?.periodSec ?? null}
                />
                <Text style={styles.nearshoreName}>{station.name}</Text>
                {d?.waveHeightFt != null && (
                  <Text style={styles.nearshoreData}>
                    {d.waveHeightFt}ft{'  '}{d.periodSec != null ? `${d.periodSec}s` : ''}
                  </Text>
                )}
                {d?.timestamp ? <Text style={styles.nearshoreTime}>{d.timestamp}</Text> : null}
              </TouchableOpacity>
            );
          })}
          {/* Kahului — bottom center cell */}
          <View style={[styles.kahului, { left: col, top: 2 * row, width: col, height: row }]}>
            <Text style={styles.kahuluiName}>KAHULUI</Text>
            {currentTideHeight != null && (
              <Text style={styles.kahuluiTide}>{currentTideHeight.toFixed(1)} ft</Text>
            )}
          </View>
        </>
      )}
      {/* Station detail modal */}
      <Modal
        visible={selected !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{selected?.station.name}</Text>
            <Text style={styles.modalId}>STATION {selected?.station.id}</Text>
            <View style={styles.modalDivider} />
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>HEIGHT</Text>
              <Text style={styles.modalValue}>
                {selected?.data?.waveHeightFt != null ? `${selected.data.waveHeightFt} ft` : '-- ft'}
              </Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>PERIOD</Text>
              <Text style={styles.modalValue}>
                {selected?.data?.periodSec != null ? `${selected.data.periodSec} s` : '-- s'}
              </Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>DIRECTION</Text>
              <Text style={styles.modalValue}>
                {selected?.data?.directionDeg != null ? `${Math.round(selected.data.directionDeg)} °` : '--'}
              </Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>UPDATED</Text>
              <Text style={styles.modalValue}>
                {selected?.data?.timestamp ?? '--'}
              </Text>
            </View>
            <TouchableOpacity style={styles.modalClose} onPress={() => setSelected(null)}>
              <Text style={styles.modalCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  cornerCell: {
    position: 'absolute',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  alignLeft:  { alignItems: 'flex-start' },
  alignRight: { alignItems: 'flex-end' },
  cornerDeg: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: COLORS.dim,
  },
  cornerName: {
    fontFamily: 'Courier',
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  cornerData: {
    fontFamily: 'Courier',
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  cornerWind: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    marginTop: 1,
  },
  cornerTime: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    marginTop: 2,
  },
  nearshoreWrap: {
    position: 'absolute',
    width: 95,
  },
  nearshoreDeg: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
  },
  nearshoreName: {
    fontFamily: 'Courier',
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  nearshoreData: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  nearshoreTime: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
  },
  kahului: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kahuluiName: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 1,
  },
  kahuluiTide: {
    fontFamily: 'Courier',
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#0D0D0D',
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 4,
    padding: 20,
    width: 260,
  },
  modalTitle: {
    fontFamily: 'Courier',
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  modalId: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    letterSpacing: 1,
    marginTop: 2,
  },
  modalDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginVertical: 12,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalLabel: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.dim,
    letterSpacing: 1,
  },
  modalValue: {
    fontFamily: 'Courier',
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  modalClose: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: COLORS.divider,
    paddingVertical: 8,
    alignItems: 'center',
  },
  modalCloseText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.dim,
    letterSpacing: 2,
  },
});
