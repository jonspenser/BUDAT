import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  ScrollView,
} from 'react-native';
import Svg, { Path, Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { useWaveForecast, WaveForecastPoint } from '../hooks/useWaveForecast';
import { useWindForecast, WindForecastPoint } from '../hooks/useWindForecast';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Forecast locations ────────────────────────────────────────────────────────

export const FORECAST_COORDS: Record<string, { lat: number; lon: number; label: string }> = {
  kahului:    { lat: 21.00, lon: -156.50, label: 'NORTH MAUI' },
  honolulu:   { lat: 21.30, lon: -157.95, label: 'NORTH SHORE' },
  nawiliwili: { lat: 21.90, lon: -159.30, label: 'NORTH KAUAI' },
  hilo:       { lat: 19.75, lon: -155.10, label: 'HILO' },
  kawaihae:   { lat: 20.00, lon: -155.85, label: 'WEST HAWAII' },
};

// ── Time helpers ──────────────────────────────────────────────────────────────

function hiDateKey(utc: Date): string {
  return new Date(utc.getTime() - 10 * 3600_000).toISOString().slice(0, 10);
}

function dayShortLabel(dateKey: string): string {
  const todayKey = hiDateKey(new Date());
  if (dateKey === todayKey) return 'TODAY';
  const d = new Date(dateKey + 'T12:00:00Z');
  return ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getUTCDay()];
}

function arrowPoints(cx: number, cy: number, size: number, travelDeg: number): string {
  const r = size * 0.44;
  const headW = size * 0.26;
  const headH = size * 0.36;
  const shaftW = size * 0.08;
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

// Catmull-Rom → cubic bezier smooth path through all points
function smoothCurvePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

function windArrowSize(speedKt: number): number {
  const clamped = Math.max(0, Math.min(speedKt, 30));
  return (9 + (clamped / 30) * 13) * 1.25; // 11–27.5px, exaggerated
}

// White (calm) → light blue → blue → green → yellow → red (strong)
function windColor(speedKt: number): string {
  const stops: [number, [number, number, number]][] = [
    [0,  [160, 210, 255]],   // light blue
    [5,  [50,  130, 255]],   // blue
    [10, [60,  200, 80]],    // green
    [15, [255, 210, 0]],     // yellow
    [20, [255, 40,  20]],    // red
  ];
  if (speedKt <= stops[0][0]) {
    const [r, g, b] = stops[0][1];
    return `rgb(${r},${g},${b})`;
  }
  if (speedKt >= stops[stops.length - 1][0]) {
    const [r, g, b] = stops[stops.length - 1][1];
    return `rgb(${r},${g},${b})`;
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const [s0, c0] = stops[i];
    const [s1, c1] = stops[i + 1];
    if (speedKt >= s0 && speedKt <= s1) {
      const t = (speedKt - s0) / (s1 - s0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
      return `rgb(${r},${g},${b})`;
    }
  }
  return 'rgb(255,40,20)';
}

// ── Chart layout ──────────────────────────────────────────────────────────────

const PAD_L = 34;
const PAD_R = 34;
const PAD_T = 24;
const PAD_B = 20;
const MIN_WAVE_MAX_FT = 7;

interface DayBound { x: number; label: string; isToday: boolean }

interface WindArrow {
  x: number;
  windY: number;
  directionDeg: number;
  speedKt: number;
}

interface SwellArrow {
  x: number;
  waveY: number;
  directionDeg: number;
}

function buildDayBounds(times: Date[], t0: number, tRange: number, chartW: number): DayBound[] {
  const todayKey = hiDateKey(new Date());
  const bounds: DayBound[] = [];
  let prevKey = hiDateKey(times[0]);
  bounds.push({ x: 0, label: dayShortLabel(prevKey), isToday: prevKey === todayKey });
  for (let i = 1; i < times.length; i++) {
    const k = hiDateKey(times[i]);
    if (k !== prevKey) {
      bounds.push({
        x: ((times[i].getTime() - t0) / tRange) * chartW,
        label: dayShortLabel(k),
        isToday: k === todayKey,
      });
      prevKey = k;
    }
  }
  return bounds;
}

// ── Combined chart ────────────────────────────────────────────────────────────

function CombinedForecastChart({
  waveForecast, windForecast, width, height, theme,
}: {
  waveForecast: WaveForecastPoint[];
  windForecast: WindForecastPoint[];
  width: number;
  height: number;
  theme: any;
}) {
  const chartW = Math.max(width - PAD_L - PAD_R, 1);
  const chartH = height - PAD_T - PAD_B;

  // Wind zone occupies TOP portion; wave chart fills the rest below
  const WIND_ZONE_H = Math.round(chartH * 0.30);
  const WIND_WAVE_GAP = 4;
  const waveZoneTop = WIND_ZONE_H + WIND_WAVE_GAP;
  const waveZoneH = chartH - waveZoneTop;

  const result = useMemo(() => {
    type PeakEntry = { x: number; y: number; ft: number; period: number };
    const empty = {
      wavePath: '', waveLabels: [] as { y: number; label: string }[],
      dayBounds: [] as DayBound[], nowX: null as number | null, nowY: null as number | null,
      peakPerDay: [] as PeakEntry[], windArrows: [] as WindArrow[], windPath: '',
      swellArrows: [] as SwellArrow[],
    };
    if (waveForecast.length < 2) return empty;

    const t0 = waveForecast[0].time.getTime();
    const t1 = waveForecast[waveForecast.length - 1].time.getTime();
    const tRange = t1 - t0;

    const toFt = (m: number) => m * 3.28084;
    const allFt = waveForecast.map(p => toFt(p.heightM));
    const waveMinFt = Math.floor(Math.min(...allFt));
    const waveMax = Math.max(MIN_WAVE_MAX_FT, Math.ceil(Math.max(...allFt)));

    const xS = (t: number) => ((t - t0) / tRange) * chartW;
    // Y maps ft → position within wave zone (bottom=waveMinFt, top=waveMax)
    const waveYS = (ft: number) =>
      waveZoneTop + waveZoneH - ((ft - waveMinFt) / (waveMax - waveMinFt)) * waveZoneH;

    // Wave path — smooth cubic bezier curve
    const wavePts = waveForecast.map(pt => ({
      x: xS(pt.time.getTime()),
      y: waveYS(toFt(pt.heightM)),
    }));
    const wavePath = smoothCurvePath(wavePts);

    // Y-axis labels — start from waveMinFt
    const waveStep = waveMax > 10 ? 2 : 1;
    const waveLabels: { y: number; label: string }[] = [];
    for (let ft = waveMinFt; ft <= waveMax; ft += waveStep) {
      waveLabels.push({ y: waveYS(ft), label: `${ft}` });
    }

    // Day boundaries
    const dayBounds = buildDayBounds(waveForecast.map(p => p.time), t0, tRange, chartW);

    // Peak ft per day (include period at the peak point)
    const dayMap = new Map<string, PeakEntry>();
    waveForecast.forEach(pt => {
      const k = hiDateKey(pt.time);
      const ft = toFt(pt.heightM);
      const ex = dayMap.get(k);
      if (!ex || ft > ex.ft) dayMap.set(k, { x: xS(pt.time.getTime()), y: waveYS(ft), ft, period: pt.period });
    });

    // Now dot
    const now = Date.now();
    let nowX: number | null = null;
    let nowY: number | null = null;
    if (now >= t0 && now <= t1) {
      nowX = xS(now);
      for (let i = 0; i < waveForecast.length - 1; i++) {
        const ta = waveForecast[i].time.getTime();
        const tb = waveForecast[i + 1].time.getTime();
        if (now >= ta && now <= tb) {
          const t = (now - ta) / (tb - ta);
          const ft = toFt(waveForecast[i].heightM) + (toFt(waveForecast[i + 1].heightM) - toFt(waveForecast[i].heightM)) * t;
          nowY = waveYS(ft);
          break;
        }
      }
    }

    // Swell direction arrows — evenly spaced across chart width (min 30px apart)
    const swellArrows: SwellArrow[] = [];
    {
      const MIN_SPACING = 30;
      const maxArrows = Math.max(2, Math.floor(chartW / MIN_SPACING));
      const n = Math.min(maxArrows, waveForecast.length);
      for (let i = 0; i < n; i++) {
        const idx = Math.round((i / (n - 1)) * (waveForecast.length - 1));
        const pt = waveForecast[idx];
        swellArrows.push({
          x: xS(pt.time.getTime()),
          waveY: waveYS(toFt(pt.heightM)),
          directionDeg: pt.directionDeg,
        });
      }
    }

    // Wind speed line + arrows in TOP wind zone
    let windPath = '';
    const windArrows: WindArrow[] = [];
    if (windForecast.length >= 2) {
      const inRange = windForecast.filter(p => {
        const ms = p.time.getTime();
        return ms >= t0 && ms <= t1;
      });
      if (inRange.length >= 2) {
        const maxKt = Math.max(25, Math.ceil(Math.max(...inRange.map(p => p.speedKt))));
        // Maps speed → Y within wind zone (top=max speed, bottom=0)
        const windYS = (kt: number) =>
          WIND_ZONE_H - (kt / maxKt) * WIND_ZONE_H;

        // Wind speed line
        inRange.forEach((pt, i) => {
          const x = xS(pt.time.getTime()).toFixed(1);
          const y = windYS(pt.speedKt).toFixed(1);
          windPath += i === 0 ? `M ${x},${y}` : ` L ${x},${y}`;
        });

        // Subsample wind arrows — evenly spaced across chart width (min 30px apart)
        {
          const MIN_SPACING = 30;
          const maxArrows = Math.max(2, Math.floor(chartW / MIN_SPACING));
          const n = Math.min(maxArrows, inRange.length);
          for (let i = 0; i < n; i++) {
            const idx = Math.round((i / (n - 1)) * (inRange.length - 1));
            const pt = inRange[idx];
            windArrows.push({
              x: xS(pt.time.getTime()),
              windY: windYS(pt.speedKt),
              directionDeg: pt.directionDeg,
              speedKt: pt.speedKt,
            });
          }
        }
      }
    }

    return {
      wavePath, waveLabels, dayBounds, nowX, nowY,
      peakPerDay: Array.from(dayMap.values()), windArrows, windPath, swellArrows,
    };
  }, [waveForecast, windForecast, chartW, waveZoneTop, waveZoneH, WIND_ZONE_H]);

  const { wavePath, waveLabels, dayBounds, nowX, nowY, peakPerDay, windArrows, windPath, swellArrows } = result;

  return (
    <Svg width={width} height={height}>
      {/* Y-axis labels */}
      {waveLabels.map((l, i) => (
        <SvgText key={i} x={PAD_L - 4} y={PAD_T + l.y + 4}
          fontSize={9} fontFamily="Courier" fill={theme.muted} textAnchor="end">
          {l.label}
        </SvgText>
      ))}

      {/* Day boundary lines + labels */}
      {dayBounds.map((b, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <Line x1={PAD_L + b.x} y1={PAD_T} x2={PAD_L + b.x} y2={PAD_T + chartH}
              stroke={theme.accentDim} strokeWidth={0.5} strokeDasharray="3,4" opacity={0.5} />
          )}
          <SvgText x={PAD_L + b.x + (i === 0 ? 0 : 3)} y={height - 4}
            fontSize={9} fontFamily="Courier" fontWeight="700"
            fill={b.isToday ? theme.accent : theme.muted} textAnchor="start">
            {b.label}
          </SvgText>
        </React.Fragment>
      ))}

      {/* Wave line */}
      {wavePath ? (
        <Path d={wavePath} stroke={theme.accent} strokeWidth={1.5} fill="none"
          transform={`translate(${PAD_L},${PAD_T})`} />
      ) : null}

      {/* Swell direction arrows — just above wave line */}
      {swellArrows.map((a, i) => {
        const travelDeg = (a.directionDeg + 180) % 360;
        return (
          <Polygon
            key={i}
            points={arrowPoints(PAD_L + a.x, PAD_T + a.waveY - 8, 13, travelDeg)}
            fill={theme.accent}
            opacity={0.65}
          />
        );
      })}

      {/* Wind speed line — in top zone */}
      {windPath ? (
        <Path d={windPath} stroke={theme.accent} strokeWidth={1} fill="none" opacity={0.35}
          transform={`translate(${PAD_L},${PAD_T})`} />
      ) : null}

      {/* Wind arrows — colored by speed, in top zone */}
      {windArrows.map((a, i) => {
        const travelDeg = (a.directionDeg + 180) % 360;
        const sz = windArrowSize(a.speedKt);
        return (
          <Polygon
            key={i}
            points={arrowPoints(PAD_L + a.x, PAD_T + a.windY, sz, travelDeg)}
            fill={windColor(a.speedKt)}
            opacity={0.85}
          />
        );
      })}

      {/* Separator line between wind zone and wave zone */}
      <Line x1={PAD_L} y1={PAD_T + waveZoneTop - 2} x2={PAD_L + chartW} y2={PAD_T + waveZoneTop - 2}
        stroke={theme.accentDim} strokeWidth={0.5} opacity={0.4} />

      {/* Peak ft + period labels — above wave line, stacked: ft → sec → arrow → line */}
      {peakPerDay.map((p, i) => {
        // Stack above the line: arrow at -8, sec at -23, ft at -34
        // Clamp so nothing goes above the top padding
        const ftY  = Math.max(PAD_T + 9,  PAD_T + p.y - 34);
        const secY = Math.max(PAD_T + 19, PAD_T + p.y - 23);
        return (
          <React.Fragment key={i}>
            <SvgText x={PAD_L + p.x} y={ftY}
              fontSize={9} fontFamily="Courier" fontWeight="700"
              fill={theme.textPrimary} textAnchor="middle">
              {p.ft.toFixed(1)}ft
            </SvgText>
            {p.period > 0 && (
              <SvgText x={PAD_L + p.x} y={secY}
                fontSize={8} fontFamily="Courier"
                fill={theme.muted} textAnchor="middle">
                {Math.round(p.period)}s
              </SvgText>
            )}
          </React.Fragment>
        );
      })}

      {/* Now dot */}
      {nowX !== null && nowY !== null && (
        <Circle cx={PAD_L + nowX} cy={PAD_T + nowY} r={4} fill={theme.accent} />
      )}
    </Svg>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ text, unit, theme }: { text: string; unit: string; theme: any }) {
  return (
    <View style={sl.row}>
      <Text style={[sl.label, { color: theme.muted }]}>{text}</Text>
      <Text style={[sl.unit, { color: theme.muted }]}>{unit}</Text>
    </View>
  );
}
const sl = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 16, marginBottom: 2 },
  label: { fontFamily: 'Courier', fontWeight: '700', fontSize: 10, letterSpacing: 3 },
  unit:  { fontFamily: 'Courier', fontSize: 9, letterSpacing: 1 },
});

// ── Forecast page ─────────────────────────────────────────────────────────────

interface ForecastPageProps {
  height?: number;
  theme: any;
  stationId: string;
}

export function ForecastPage({ height, theme, stationId }: ForecastPageProps) {
  const coords = FORECAST_COORDS[stationId] ?? FORECAST_COORDS.kahului;

  const { forecast: waveFc, loading: waveLoading, error: waveErr } = useWaveForecast(coords.lat, coords.lon);
  const { forecast: windFc, loading: windLoading, error: windErr } = useWindForecast(coords.lat, coords.lon);

  const loading = waveLoading && waveFc.length === 0;
  const error = waveErr ?? null;

  const chartW = SCREEN_W - 28;

  return (
    <View style={height ? { height, width: SCREEN_W } : { flex: 1 }}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: theme.accent }]}>FORECAST</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>{coords.label}  · WW3 / WRF</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.accent }]} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.muted }]}>LOADING MODEL DATA…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.muted }]}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendLine, { backgroundColor: theme.accent }]} />
              <Text style={[styles.legendText, { color: theme.muted }]}>WAVE FT</Text>
            </View>
            <View style={styles.legendItem}>
              <Svg width={18} height={14}>
                <Polygon points={arrowPoints(9, 7, 13, 45)} fill={theme.accent} opacity={0.65} />
              </Svg>
              <Text style={[styles.legendText, { color: theme.muted }]}>SWELL DIR</Text>
            </View>
            <View style={styles.legendItem}>
              <Svg width={18} height={14}>
                <Polygon points={arrowPoints(9, 7, 13, 90)} fill={theme.accent} opacity={0.78} />
              </Svg>
              <Text style={[styles.legendText, { color: theme.muted }]}>WIND</Text>
            </View>
          </View>
          <SectionLabel text="FORECAST" unit="ft / wind" theme={theme} />
          <View style={[styles.chartBox, { borderColor: theme.accentDim }]}>
            <CombinedForecastChart
              waveForecast={waveFc}
              windForecast={windErr ? [] : windFc}
              width={chartW}
              height={260}
              theme={theme}
            />
          </View>
          {(windLoading && windFc.length === 0) && (
            <Text style={[styles.windNote, { color: theme.muted }]}>LOADING WRF WIND…</Text>
          )}
          {(!windLoading && (windErr || windFc.length === 0)) && (
            <Text style={[styles.windNote, { color: theme.muted }]}>WRF WIND UNAVAILABLE</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:     { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title:      { fontFamily: 'Courier', fontWeight: '900', fontSize: 18, letterSpacing: 4 },
  subtitle:   { fontFamily: 'Courier', fontSize: 10, letterSpacing: 1 },
  divider:    { height: 1, opacity: 0.55, marginTop: 8 },
  scroll:     { paddingHorizontal: 14, paddingBottom: 28 },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:{ fontFamily: 'Courier', fontSize: 11, letterSpacing: 2 },
  errorText:  { fontFamily: 'Courier', fontSize: 11, letterSpacing: 1 },
  chartBox:   { borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  legendRow:  { flexDirection: 'row', justifyContent: 'flex-end', gap: 14, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 18, height: 2 },
  legendText: { fontFamily: 'Courier', fontWeight: '700', fontSize: 9, letterSpacing: 1 },
  windNote:   { fontFamily: 'Courier', fontSize: 10, letterSpacing: 2, marginTop: 8, textAlign: 'center' },
});
