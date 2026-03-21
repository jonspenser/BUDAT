import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Polygon, Line } from 'react-native-svg';
import { ISLANDS } from '../constants/hawaii';
import { BUOY_STATIONS, Season } from '../constants/buoys';
import { BuoyData } from '../hooks/useNDBCData';
import { COLORS } from '../constants/colors';

const { width: W, height: H } = Dimensions.get('window');
const MAP_W = W;
// Remaining height after safe area, header, dividers, tide section
const MAP_H = H * 0.56;
const COL = MAP_W / 3;
const ROW = MAP_H / 3;

// Island projection: scale islands to 1.8x the center cell, centered on map
const I_LON_MIN = -160.8;
const I_LON_MAX = -154.3;
const I_LAT_MAX = 22.55;
const I_LAT_MIN = 18.5;

const ISLAND_SCALE = 1.8;
const ISLAND_W = COL * ISLAND_SCALE;
const ISLAND_H = ROW * ISLAND_SCALE;
const ISLAND_X0 = MAP_W / 2 - ISLAND_W / 2;
const ISLAND_Y0 = MAP_H / 2 - ISLAND_H / 2;

function projectIsland(lon: number, lat: number) {
  return {
    x: ISLAND_X0 + ((lon - I_LON_MIN) / (I_LON_MAX - I_LON_MIN)) * ISLAND_W,
    y: ISLAND_Y0 + ((I_LAT_MAX - lat) / (I_LAT_MAX - I_LAT_MIN)) * ISLAND_H,
  };
}

// Arrow: encodes height (length), period (stroke width), direction (angle)
function ArrowSvg({
  size,
  directionDeg,
  heightFt,
  periodSec,
  scale = 1,
}: {
  size: number;
  directionDeg: number | null;
  heightFt: number | null;
  periodSec: number | null;
  scale?: number;
}) {
  if (directionDeg === null) return null;
  const cx = size / 2;
  const cy = size / 2;
  const travelDeg = (directionDeg + 180) % 360;
  const rad = (travelDeg - 90) * (Math.PI / 180);
  const len = Math.min(Math.max((heightFt ?? 3) * 6 * scale, 14), size * 0.46);
  const sw = Math.min(Math.max(((periodSec ?? 10) - 6) * 0.45, 1.2), 5.5);
  const tx = cx + Math.cos(rad) * len;
  const ty = cy + Math.sin(rad) * len;
  const hl = len * 0.34;
  const ha = 0.48;
  const ax1x = tx - hl * Math.cos(rad - ha);
  const ax1y = ty - hl * Math.sin(rad - ha);
  const ax2x = tx - hl * Math.cos(rad + ha);
  const ax2y = ty - hl * Math.sin(rad + ha);

  return (
    <Svg width={size} height={size}>
      <Line x1={cx} y1={cy} x2={tx} y2={ty} stroke={COLORS.primary} strokeWidth={sw} />
      <Line x1={tx} y1={ty} x2={ax1x} y2={ax1y} stroke={COLORS.primary} strokeWidth={sw} />
      <Line x1={tx} y1={ty} x2={ax2x} y2={ax2y} stroke={COLORS.primary} strokeWidth={sw} />
    </Svg>
  );
}

function getCornerPos(corner: 'NW' | 'NE' | 'SW' | 'SE') {
  switch (corner) {
    case 'NW': return { left: 0,       top: 0 };
    case 'NE': return { left: 2 * COL, top: 0 };
    case 'SW': return { left: 0,       top: 2 * ROW };
    case 'SE': return { left: 2 * COL, top: 2 * ROW };
  }
}

interface Props {
  buoyData: Record<string, BuoyData>;
  season: Season;
}

export default function BuoyMap({ buoyData, season }: Props) {
  const stations = BUOY_STATIONS.filter(s => s.season.includes(season));
  const cornerStations = stations.filter(s => s.corner);
  const nearshoreStations = stations.filter(s => !s.corner);

  return (
    <View style={[styles.container, { width: MAP_W, height: MAP_H }]}>

      {/* SVG layer: island outlines + grid lines */}
      <Svg width={MAP_W} height={MAP_H} style={StyleSheet.absoluteFill}>
        {/* Grid lines */}
        <Line x1={COL}     y1={0}     x2={COL}     y2={MAP_H} stroke={COLORS.divider} strokeWidth={0.5} />
        <Line x1={2 * COL} y1={0}     x2={2 * COL} y2={MAP_H} stroke={COLORS.divider} strokeWidth={0.5} />
        <Line x1={0}       y1={ROW}   x2={MAP_W}   y2={ROW}   stroke={COLORS.divider} strokeWidth={0.5} />
        <Line x1={0}       y1={2*ROW} x2={MAP_W}   y2={2*ROW} stroke={COLORS.divider} strokeWidth={0.5} />

        {/* Hawaii island outlines in center cell */}
        {ISLANDS.map(island => {
          const pts = island.coords
            .map(([lon, lat]) => {
              const { x, y } = projectIsland(lon, lat);
              return `${x},${y}`;
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
        const pos = getCornerPos(station.corner!);
        const isRight = station.corner === 'NE' || station.corner === 'SE';

        return (
          <View
            key={station.id}
            style={[
              styles.cornerCell,
              { left: pos.left, top: pos.top, width: COL, height: ROW },
              isRight ? styles.cornerRight : styles.cornerLeft,
            ]}
          >
            <Text style={styles.cornerDeg}>
              {d?.directionDeg !== null && d?.directionDeg !== undefined
                ? `${Math.round(d.directionDeg)} °`
                : '--'}
            </Text>
            <ArrowSvg
              size={80}
              directionDeg={d?.directionDeg ?? null}
              heightFt={d?.waveHeightFt ?? null}
              periodSec={d?.periodSec ?? null}
              scale={1.2}
            />
            <Text style={styles.cornerName}>{station.name}</Text>
            {d?.waveHeightFt !== null && d?.waveHeightFt !== undefined ? (
              <Text style={styles.cornerData}>
                {d.waveHeightFt}ft  {d.periodSec !== null ? `${d.periodSec}s` : ''}
              </Text>
            ) : (
              <Text style={styles.cornerData}>--</Text>
            )}
            {d?.timestamp && (
              <Text style={styles.cornerTime}>{d.timestamp}</Text>
            )}
          </View>
        );
      })}

      {/* Nearshore buoys overlaid on island map */}
      {nearshoreStations.map(station => {
        const d = buoyData[station.id];
        const { x, y } = projectIsland(station.lon, station.lat);

        return (
          <View
            key={station.id}
            style={[styles.nearshoreWrap, { left: x - 45, top: y - 40 }]}
          >
            <Text style={styles.nearshoreDeg}>
              {d?.directionDeg !== null && d?.directionDeg !== undefined
                ? `${Math.round(d.directionDeg)}°`
                : ''}
            </Text>
            <ArrowSvg
              size={52}
              directionDeg={d?.directionDeg ?? null}
              heightFt={d?.waveHeightFt ?? null}
              periodSec={d?.periodSec ?? null}
              scale={0.7}
            />
            <Text style={styles.nearshoreName}>{station.name}</Text>
            {d?.waveHeightFt !== null && d?.waveHeightFt !== undefined && (
              <Text style={styles.nearshoreData}>
                {d.waveHeightFt}ft  {d.periodSec !== null ? `${d.periodSec}s` : ''}
              </Text>
            )}
            {d?.timestamp && (
              <Text style={styles.nearshoreTime}>{d.timestamp}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  cornerCell: {
    position: 'absolute',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cornerLeft: {
    alignItems: 'flex-start',
  },
  cornerRight: {
    alignItems: 'flex-end',
  },
  cornerDeg: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: COLORS.dim,
    letterSpacing: 0.5,
  },
  cornerName: {
    fontFamily: 'Courier',
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 2,
  },
  cornerData: {
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  cornerTime: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    marginTop: 2,
  },
  nearshoreWrap: {
    position: 'absolute',
    width: 90,
    alignItems: 'flex-start',
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
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  nearshoreTime: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
  },
});
