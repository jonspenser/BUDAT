import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon, Circle, Text as SvgText } from 'react-native-svg';
import { MAP_BOUNDS, NearshoreStation } from '../constants/buoys';
import { BuoyReading } from '../hooks/useBuoyData';
import { formatHeight, formatPeriod, formatHawaiiTime } from '../constants/formatters';
import { Theme } from '../constants/colors';

interface Props {
  width: number;
  height: number;
  nearshoreStations: NearshoreStation[];
  nearshoreData: Record<string, BuoyReading | null>;
  theme: Theme;
}

const ISLANDS: { name: string; points: [number, number][] }[] = [
  {
    name: 'Kauai',
    points: [
      [-159.78, 22.04], [-159.68, 22.23], [-159.49, 22.24], [-159.32, 22.13],
      [-159.29, 21.94], [-159.42, 21.84], [-159.65, 21.85], [-159.78, 22.04],
    ],
  },
  {
    name: 'Niihau',
    points: [
      [-160.24, 21.98], [-160.14, 22.06], [-160.08, 21.88], [-160.18, 21.82],
      [-160.24, 21.98],
    ],
  },
  {
    name: 'Oahu',
    points: [
      [-158.28, 21.71], [-158.11, 21.72], [-157.95, 21.73], [-157.65, 21.65],
      [-157.63, 21.27], [-157.75, 21.24], [-158.02, 21.25], [-158.16, 21.43],
      [-158.28, 21.71],
    ],
  },
  {
    name: 'Molokai',
    points: [
      [-157.33, 21.22], [-156.69, 21.22], [-156.69, 21.10], [-156.82, 21.04],
      [-157.10, 21.04], [-157.33, 21.10], [-157.33, 21.22],
    ],
  },
  {
    name: 'Lanai',
    points: [
      [-157.06, 20.94], [-156.83, 20.95], [-156.82, 20.72], [-157.00, 20.70],
      [-157.06, 20.94],
    ],
  },
  {
    name: 'Kahoolawe',
    points: [
      [-156.70, 20.59], [-156.55, 20.60], [-156.47, 20.51], [-156.62, 20.44],
      [-156.70, 20.52], [-156.70, 20.59],
    ],
  },
  {
    name: 'Maui',
    points: [
      [-156.70, 21.04], [-156.59, 21.02], [-156.44, 20.94], [-156.37, 20.76],
      [-156.43, 20.64], [-156.58, 20.61],
      [-156.18, 20.57], [-155.98, 20.66], [-155.98, 20.85], [-156.12, 20.98],
      [-156.36, 21.01], [-156.58, 20.94],
      [-156.70, 21.04],
    ],
  },
  {
    name: 'BigIsland',
    points: [
      [-156.06, 20.27], [-155.82, 20.27], [-155.60, 19.99], [-155.50, 19.73],
      [-155.49, 19.38], [-155.58, 18.94], [-155.69, 18.90], [-155.87, 18.92],
      [-156.06, 19.08], [-156.07, 19.52], [-155.96, 19.88], [-155.98, 20.10],
      [-156.06, 20.27],
    ],
  },
];

/** Generate SVG polygon points for a small arrow centered at (cx, cy), pointing in travelDeg direction */
function arrowPoints(cx: number, cy: number, size: number, travelDeg: number): string {
  const r = size * 0.42;
  const headW = size * 0.34;
  const headH = size * 0.40;
  const shaftW = size * 0.13;

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

  return pts
    .map(([px, py]) => `${cx + px * cos - py * sin},${cy + px * sin + py * cos}`)
    .join(' ');
}

export default function HawaiiMap({ width, height, nearshoreStations, nearshoreData, theme }: Props) {
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const midLatRad = ((MAP_BOUNDS.latMin + MAP_BOUNDS.latMax) / 2) * (Math.PI / 180);
  const lonScale = Math.cos(midLatRad);

  const { lonMin, lonMax, latMin, latMax } = MAP_BOUNDS;
  const geoW = (lonMax - lonMin) * lonScale;
  const geoH = latMax - latMin;
  const geoAspect = geoW / geoH;

  let mapW = w;
  let mapH = w / geoAspect;
  if (mapH > h) {
    mapH = h;
    mapW = h * geoAspect;
  }
  const offX = pad + (w - mapW) / 2;
  const offY = pad + (h - mapH) / 2;

  const project = (lon: number, lat: number): [number, number] => {
    const x = offX + ((lon - lonMin) / (lonMax - lonMin)) * mapW;
    const y = offY + ((latMax - lat) / (latMax - latMin)) * mapH;
    return [x, y];
  };

  return (
    <View style={{ width, height, backgroundColor: theme.background }}>
      <Svg width={width} height={height}>
        {/* Island outlines */}
        {ISLANDS.map((island) => {
          const pts = island.points
            .map(([lon, lat]) => { const [x, y] = project(lon, lat); return `${x},${y}`; })
            .join(' ');
          return (
            <Polygon
              key={island.name}
              points={pts}
              fill={theme.islandFill}
              stroke={theme.islandFill}
              strokeWidth={1}
            />
          );
        })}

        {/* Nearshore buoy markers */}
        {nearshoreStations.map((station) => {
          const [x, y] = project(station.lon, station.lat);
          const d = nearshoreData[station.id];
          const hStr = d ? formatHeight(d.waveHeight) : '--';
          const pStr = d ? formatPeriod(d.dominantPeriod) : '--';
          const ts = d ? formatHawaiiTime(d.timestamp) : '';
          const dir = d?.waveDirection ?? null;
          const travelDeg = dir !== null ? (dir + 180) % 360 : null;
          const dirLabel = dir !== null ? `${Math.round(dir)}°` : '';

          const onRight = x > w * 0.6;
          const anchor = onRight ? 'end' : 'start';
          const labelX = onRight ? x - 5 : x + 5;

          const arrowSize = 12;
          const arrowCY = y - arrowSize - 4;
          const degY = arrowCY - arrowSize / 2 - 1;

          return (
            <React.Fragment key={station.id}>
              {/* Degree label above arrow */}
              {dirLabel ? (
                <SvgText
                  x={x}
                  y={degY}
                  fontSize={6.5}
                  fontFamily="Courier"
                  fill={theme.accent}
                  textAnchor="middle"
                >
                  {dirLabel}
                </SvgText>
              ) : null}

              {/* Wave direction arrow */}
              {travelDeg !== null && (
                <Polygon
                  points={arrowPoints(x, arrowCY, arrowSize, travelDeg)}
                  fill={theme.accent}
                />
              )}

              {/* Dot */}
              <Circle cx={x} cy={y} r={3} fill={theme.accent} />

              {/* Station name */}
              <SvgText
                x={labelX}
                y={y - 5}
                fontSize={7.5}
                fontFamily="Courier"
                fontWeight="bold"
                fill={theme.accent}
                textAnchor={anchor}
              >
                {station.name}
              </SvgText>

              {/* Wave data */}
              <SvgText
                x={labelX}
                y={y + 4}
                fontSize={7}
                fontFamily="Courier"
                fill={theme.accent}
                textAnchor={anchor}
              >
                {`${hStr} ${pStr}`}
              </SvgText>

              {/* Timestamp */}
              <SvgText
                x={labelX}
                y={y + 12}
                fontSize={6}
                fontFamily="Courier"
                fill={theme.muted}
                textAnchor={anchor}
              >
                {ts}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}
