import React from 'react';
import { View, ScrollView, Image } from 'react-native';
import Svg, { G, Polygon, Circle, Path, Rect, Ellipse, Text as SvgText } from 'react-native-svg';
import { MAP_BOUNDS, NearshoreStation } from '../constants/buoys';
import { BuoyReading } from '../hooks/useBuoyData';
import { formatHeight, formatPeriod, formatHawaiiTime, isOffline } from '../constants/formatters';
import { Theme } from '../constants/colors';

// Reference image natural dimensions
const IMG_W = 1500;
const IMG_H = 2100;

interface Props {
  width: number;
  height: number;
  nearshoreStations: NearshoreStation[];
  nearshoreData: Record<string, BuoyReading | null>;
  theme: Theme;
  onBuoyPress?: (id: string) => void;
}

function arrowPoints(cx: number, cy: number, len: number, wid: number, travelDeg: number): string {
  const r = len / 2;
  const headW = wid * 0.5;
  const headH = len * 0.38;
  const shaftW = wid * 0.18;
  const pts: [number, number][] = [
    [0, -r],
    [headW, -r + headH],
    [shaftW, -r + headH],
    [shaftW, r],
    [-shaftW, r],
    [-shaftW, -r + headH],
    [-headW, -r + headH],
  ];
  const rad = (travelDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pts.map(([px, py]) => `${cx + px * cos - py * sin},${cy + px * sin + py * cos}`).join(' ');
}

export default function HawaiiMap({ width, height, nearshoreStations, nearshoreData, theme, onBuoyPress }: Props) {
  const { lonMin, lonMax, latMin, latMax } = MAP_BOUNDS;

  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  // Scale map so NW buoy text is ~edgePad from left and SE buoy is ~edgePad from right
  const fNW = (-162.194 - lonMin) / (lonMax - lonMin);
  const fSE = (-152.227 - lonMin) / (lonMax - lonMin);
  const edgePad = 30;
  const mapW = (w - 2 * edgePad) / (fSE - fNW);
  const mapH = mapW * (IMG_H / IMG_W);
  const offX = edgePad - fNW * mapW;
  const offY = pad + (h - mapH) / 2 + 10;

  const project = (lon: number, lat: number): [number, number] => [
    offX + ((lon - lonMin) / (lonMax - lonMin)) * mapW,
    offY + ((latMax - lat) / (latMax - latMin)) * mapH,
  ];

  return (
    <ScrollView
      style={{ width, height, backgroundColor: theme.background }}
      contentContainerStyle={{ width, height }}
      minimumZoomScale={1}
      maximumZoomScale={4}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      bouncesZoom
    >
      <View style={{ width, height, backgroundColor: theme.background }}>
        <Image
          source={require('../assets/islands_ref.png')}
          style={{ position: 'absolute', left: offX, top: offY, width: mapW, height: mapH }}
          resizeMode="stretch"
        />

        <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
          <G>
            {nearshoreStations.map((station) => {
              const [x, yBase] = project(station.lon, station.lat);
              const y = yBase + (station.dotOffsetY ?? 0);
              const d = nearshoreData[station.id];
              const offline = isOffline(d?.timestamp);
              const hStr = offline ? 'OFFLINE' : formatHeight(d!.SwH ?? d!.WVHT);
              const pStr = offline ? '' : formatPeriod(d!.SwP ?? d!.DPD);
              const ts   = offline ? '' : formatHawaiiTime(d!.timestamp);
              const dir = offline ? null : (d?.SwD ?? d?.MWD ?? null);
              const travelDeg = dir !== null ? (dir + 180) % 360 : null;
              const dirLabel = dir !== null ? `${Math.round(dir)}°` : '';

              // Arrow size: length from swell height (m), width from swell period (s)
              const swH = d?.SwH ?? d?.WVHT ?? null;
              const swP = d?.SwP ?? d?.DPD ?? null;
              const arrowLen = swH !== null ? Math.max(8, Math.min(24, 8 + swH * 2.7)) : 10;
              const arrowWid = swP !== null ? Math.max(6, Math.min(18, 4 + swP * 0.7)) : 8;

              // Text sizes (+10%)
              const fName = 8.5;   // was 7.5
              const fData = 7.5;   // was 7
              const fTs   = 6.5;   // was 6
              const fDeg  = 7;     // was 6.5
              // Line spacing — enough room for each text size
              const sp = 11;

              // Arrow above or below the dot depending on label position
              const isBottom = station.labelBelow || (y - offY) > mapH * 0.75;
              const labelShift = isBottom ? (station.labelOffsetY ?? 0) : 0;
              const arrowCY = (isBottom ? y + arrowLen / 2 + 7 : y - arrowLen / 2 - 7) + labelShift;
              const degY = (isBottom ? arrowCY + arrowLen / 2 + 13 : arrowCY - arrowLen / 2 - 6) + (station.degOffsetY ?? 0);

              let nameY: number, dataY: number, tsY: number, labelX: number, labelAnchor: string;
              if (station.labelSide === 'left') {
                const ly = station.labelOffsetY ?? 0;
                nameY = arrowCY - sp + ly; dataY = arrowCY + ly; tsY = arrowCY + sp + ly;
                labelX = x + (station.arrowOffsetX ?? 0) - 6 + (station.labelOffsetX ?? 0);
                labelAnchor = 'middle';
              } else if (station.labelSide === 'right') {
                const ly = station.labelOffsetY ?? 0;
                if (station.timeTop) {
                  tsY = arrowCY - sp + ly; nameY = arrowCY + ly; dataY = arrowCY + sp + ly;
                } else {
                  nameY = arrowCY - sp + ly; dataY = arrowCY + ly; tsY = arrowCY + sp + ly;
                }
                labelX = x + (station.arrowOffsetX ?? 0) + 11 + (station.labelOffsetX ?? 0);
                labelAnchor = 'middle';
              } else if (isBottom) {
                nameY = degY + sp; dataY = nameY + sp; tsY = dataY + sp;
                labelX = x + (station.labelOffsetX ?? 0);
                labelAnchor = 'middle';
              } else if (station.timeTop) {
                dataY = degY - sp; nameY = dataY - sp; tsY = nameY - sp;
                labelX = x + (station.labelOffsetX ?? 0);
                labelAnchor = 'middle';
              } else {
                tsY = degY - 2; dataY = tsY - sp; nameY = dataY - sp;
                labelX = x + (station.labelOffsetX ?? 0);
                labelAnchor = 'middle';
              }

              // Bounding box that covers the dot + arrow + all text lines
              const allYs = [nameY, dataY, tsY, degY, arrowCY - arrowLen / 2, arrowCY + arrowLen / 2, y];
              const minY = Math.min(...allYs) - 4;
              const maxY = Math.max(...allYs) + 4;
              const hitX = Math.min(labelX, x) - 30;
              const hitW = Math.max(labelX, x) + 30 - hitX;

              return (
                <G key={station.id} onPress={() => onBuoyPress?.(station.id)}>
                  {/* Transparent hit area covering all elements */}
                  <Circle cx={x} cy={(minY + maxY) / 2} r={(maxY - minY) / 2 + 4} fill="transparent" />
                  {dirLabel ? (
                    <SvgText x={x + (station.arrowOffsetX ?? 0)} y={degY} fontSize={fDeg} fontFamily="Courier" fill={theme.accent} textAnchor="middle">
                      {dirLabel}
                    </SvgText>
                  ) : null}
                  {travelDeg !== null && (
                    <Polygon points={arrowPoints(x + (station.arrowOffsetX ?? 0), arrowCY, arrowLen, arrowWid, travelDeg)} fill={theme.accent} />
                  )}
                  <Circle cx={x} cy={y} r={2.55} fill={theme.accent} />
                  <SvgText x={labelX} y={nameY} fontSize={fName} fontFamily="Courier" fontWeight="bold" fill={theme.accent} textAnchor={labelAnchor as 'middle'}>
                    {station.name}
                  </SvgText>
                  <SvgText x={labelX} y={dataY} fontSize={fData} fontFamily="Courier" fill={theme.accent} textAnchor={labelAnchor as 'middle'}>
                    {`${hStr} ${pStr}`}
                  </SvgText>
                  <SvgText x={labelX} y={tsY} fontSize={fTs} fontFamily="Courier" fill={theme.muted} textAnchor={labelAnchor as 'middle'}>
                    {ts}
                  </SvgText>
                </G>
              );
            })}
          </G>

        </Svg>
      </View>
    </ScrollView>
  );
}
