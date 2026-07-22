import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { G, Polygon, Circle, Path, Rect, Text as SvgText } from 'react-native-svg';
import { MAP_BOUNDS, NearshoreStation } from '../constants/buoys';
import { ISLAND_PATHS, ISLAND_REF_W } from '../constants/islandPaths';
import { BuoyReading } from '../hooks/useBuoyData';
import { formatHeight, formatPeriod, formatHawaiiTime, isOffline } from '../constants/formatters';
import { Theme } from '../constants/colors';

// Reference image natural dimensions (island paths are traced in this space)
const IMG_W = 1500;
const IMG_H = 2100;

const MAX_ZOOM = 5;

interface Props {
  width: number;
  height: number;
  nearshoreStations: NearshoreStation[];
  nearshoreData: Record<string, BuoyReading | null>;
  theme: Theme;
  onBuoyPress?: (id: string) => void;
  isHistorical?: boolean;
  historicalLoading?: boolean;
}

interface ViewTransform {
  zoom: number;
  tx: number;
  ty: number;
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

export default function HawaiiMap({ width, height, nearshoreStations, nearshoreData, theme, onBuoyPress, isHistorical, historicalLoading }: Props) {
  const { lonMin, lonMax, latMin, latMax } = MAP_BOUNDS;

  // Zoom/pan happens inside the SVG (vector re-render) so everything stays
  // crisp at any zoom, unlike ScrollView zoom which magnifies the raster.
  const [view, setView] = useState<ViewTransform>({ zoom: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const gestureStart = useRef({ zoom: 1, tx: 0, ty: 0, fx: 0, fy: 0 });

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

  const { zoom, tx, ty } = view;

  // Base (zoom=1) projection in view points
  const projectBase = (lon: number, lat: number): [number, number] => [
    offX + ((lon - lonMin) / (lonMax - lonMin)) * mapW,
    offY + ((latMax - lat) / (latMax - latMin)) * mapH,
  ];

  const clampView = (z: number, x: number, y: number): ViewTransform => {
    const zc = Math.min(MAX_ZOOM, Math.max(1, z));
    return {
      zoom: zc,
      tx: Math.min(0, Math.max(width * (1 - zc), x)),
      ty: Math.min(0, Math.max(height * (1 - zc), y)),
    };
  };

  // Two-finger gesture handles both zoom (scale) and pan (focal-point drag),
  // leaving one-finger swipes free for page changes and taps for buoys.
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart(e => {
      const v = viewRef.current;
      gestureStart.current = { zoom: v.zoom, tx: v.tx, ty: v.ty, fx: e.focalX, fy: e.focalY };
    })
    .onUpdate(e => {
      const s = gestureStart.current;
      const z = Math.min(MAX_ZOOM, Math.max(1, s.zoom * e.scale));
      const k = z / s.zoom;
      setView(clampView(z, e.focalX - (s.fx - s.tx) * k, e.focalY - (s.fy - s.ty) * k));
    })
    .onEnd(() => {
      if (viewRef.current.zoom < 1.02) setView({ zoom: 1, tx: 0, ty: 0 });
    });

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd(() => setView({ zoom: 1, tx: 0, ty: 0 }));

  const gesture = Gesture.Race(pinch, doubleTap);

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height, backgroundColor: theme.background }}>
        <Svg width={width} height={height}>
          {/* Island outlines: vector paths traced from the reference art, scaled
              live with zoom so they never pixelate */}
          <G transform={`translate(${tx + offX * zoom}, ${ty + offY * zoom}) scale(${(zoom * mapW) / ISLAND_REF_W})`}>
            {ISLAND_PATHS.map((d, i) => (
              <Path key={i} d={d} fill={theme.accent} fillRule="evenodd" />
            ))}
          </G>
          <G>
            {nearshoreStations.map((station) => {
              const [bx, by] = projectBase(station.lon, station.lat);
              // Station dot tracks the zoomed geography; labels keep constant size
              const x = bx * zoom + tx + (station.dotOffsetX ?? 0);
              const y = by * zoom + ty + (station.dotOffsetY ?? 0);
              const d = nearshoreData[station.id];
              // Historical rows carry a synthetic mid-year timestamp (not a live
              // reading time), so "offline" there means "no archive data" instead
              // of "stale" — and we skip the clock-time label entirely.
              const offline = isHistorical ? !d : isOffline(d?.timestamp);
              const hStr = offline
                ? (isHistorical ? (historicalLoading ? '···' : 'NO DATA') : 'OFFLINE')
                : formatHeight(d!.SwH ?? d!.WVHT);
              const pStr = offline ? '' : formatPeriod(d!.SwP ?? d!.DPD);
              const ts   = offline || isHistorical ? '' : formatHawaiiTime(d!.timestamp);
              const dir = offline ? null : (d?.SwD ?? d?.MWD ?? null);
              const travelDeg = dir !== null ? (dir + 180) % 360 : null;
              const dirLabel = dir !== null ? `${Math.round(dir)}°` : '';

              // Arrow size: length from swell height (m), width from swell period (s)
              const swH = d?.SwH ?? d?.WVHT ?? null;
              const swP = d?.SwP ?? d?.DPD ?? null;
              const arrowLen = swH !== null ? Math.max(8, Math.min(24, 8 + swH * 2.7)) : 10;
              const arrowWid = swP !== null ? Math.max(6, Math.min(18, 4 + swP * 0.7)) : 8;

              // Text sizes — raised from 8.5/7.5/6.5/7 for iPhone legibility
              const fName = 11;
              const fData = 10;
              const fTs   = 9;
              const fDeg  = 9.5;
              // Line spacing — per-station override for clustered labels
              const sp = station.labelSpacing ?? 14;

              // Arrow above or below the dot depending on label position
              // (classified on base coords so it doesn't flip while zooming)
              const isBottom = station.labelBelow || (by - offY) > mapH * 0.75;
              const labelShift = isBottom ? (station.labelOffsetY ?? 0) : 0;
              const arrowCY = (isBottom ? y + arrowLen / 2 + 7 : y - arrowLen / 2 - 7) + labelShift;
              // Gap between the arrow tip and the degree label; below the arrow the
              // baseline sits a further fDeg down so the glyph tops clear the gap
              const arrowTextGap = 8;
              // Gap between the degree label's glyph tops and the timestamp baseline above it
              const degStackGap = 5;
              // Horizontal gap between the dot/arrow and a side-anchored label edge
              const sideLabelGap = 9;
              const degY = (isBottom
                ? arrowCY + arrowLen / 2 + arrowTextGap + fDeg
                : arrowCY - arrowLen / 2 - arrowTextGap) + (station.degOffsetY ?? 0);

              let nameY: number, dataY: number, tsY: number, labelX: number, labelAnchor: 'start' | 'middle' | 'end';
              if (station.labelSide === 'left') {
                const ly = station.labelOffsetY ?? 0;
                nameY = arrowCY - sp + ly; dataY = arrowCY + ly; tsY = arrowCY + sp + ly;
                labelX = x + (station.arrowOffsetX ?? 0) - sideLabelGap + (station.labelOffsetX ?? 0);
                labelAnchor = 'end';
              } else if (station.labelSide === 'right') {
                const ly = station.labelOffsetY ?? 0;
                if (station.timeTop) {
                  tsY = arrowCY - sp + ly; nameY = arrowCY + ly; dataY = arrowCY + sp + ly;
                } else {
                  nameY = arrowCY - sp + ly; dataY = arrowCY + ly; tsY = arrowCY + sp + ly;
                }
                labelX = x + (station.arrowOffsetX ?? 0) + sideLabelGap + (station.labelOffsetX ?? 0);
                labelAnchor = 'start';
              } else if (isBottom) {
                nameY = degY + sp; dataY = nameY + sp; tsY = dataY + sp;
                labelX = x + (station.labelOffsetX ?? 0);
                labelAnchor = 'middle';
              } else if (station.timeTop) {
                dataY = degY - sp; nameY = dataY - sp; tsY = nameY - sp;
                labelX = x + (station.labelOffsetX ?? 0);
                labelAnchor = 'middle';
              } else {
                // Timestamp baseline clears the degree label's glyph tops (fDeg above degY)
                tsY = degY - fDeg - degStackGap; dataY = tsY - sp; nameY = dataY - sp;
                labelX = x + (station.labelOffsetX ?? 0);
                labelAnchor = 'middle';
              }

              // Bounding box that covers the dot + arrow + all text lines
              const allYs = [nameY, dataY, tsY, degY, arrowCY - arrowLen / 2, arrowCY + arrowLen / 2, y];
              const minY = Math.min(...allYs) - 4;
              const maxY = Math.max(...allYs) + 4;
              // Courier is monospace at ~0.6em per character — predict the widest text line
              const labelW = Math.max(station.name.length * fName, `${hStr} ${pStr}`.length * fData) * 0.6 + 8;
              const labelMinX = labelAnchor === 'end' ? labelX - labelW : labelAnchor === 'start' ? labelX : labelX - labelW / 2;
              const hitX = Math.min(labelMinX, x - 12);
              const hitW = Math.max(labelMinX + labelW, x + 12) - hitX;

              return (
                <G key={station.id} onPress={() => onBuoyPress?.(station.id)}>
                  {/* Transparent hit area covering all elements */}
                  <Rect x={hitX} y={minY} width={hitW} height={maxY - minY} fill="transparent" />
                  {dirLabel ? (
                    <SvgText x={x + (station.arrowOffsetX ?? 0)} y={degY} fontSize={fDeg} fontFamily="Courier" fill={theme.accent} textAnchor="middle">
                      {dirLabel}
                    </SvgText>
                  ) : null}
                  {travelDeg !== null && (
                    <Polygon points={arrowPoints(x + (station.arrowOffsetX ?? 0), arrowCY, arrowLen, arrowWid, travelDeg)} fill={theme.accent} />
                  )}
                  <Circle cx={x} cy={y} r={2.55} fill={theme.accent} />
                  <SvgText x={labelX} y={nameY} fontSize={fName} fontFamily="Courier" fontWeight="bold" fill={theme.accent} textAnchor={labelAnchor}>
                    {station.name}
                  </SvgText>
                  <SvgText x={labelX} y={dataY} fontSize={fData} fontFamily="Courier" fill={theme.accent} textAnchor={labelAnchor}>
                    {`${hStr} ${pStr}`}
                  </SvgText>
                  <SvgText x={labelX} y={tsY} fontSize={fTs} fontFamily="Courier" fill={theme.muted} textAnchor={labelAnchor}>
                    {ts}
                  </SvgText>
                </G>
              );
            })}
          </G>
        </Svg>
      </View>
    </GestureDetector>
  );
}
