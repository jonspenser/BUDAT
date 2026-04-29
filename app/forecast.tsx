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

function hstDateKeyToUtcMs(dateKey: string, hstHour: number): number {
  return new Date(`${dateKey}T${String(hstHour).padStart(2, '0')}:00:00-10:00`).getTime();
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

// ── Chart layout constants ────────────────────────────────────────────────────

const PAD_L = 34;
const PAD_R = 34;
const PAD_T = 24;
const PAD_B = 20;
const MIN_WAVE_MAX_FT = 7;

// ── Shared: build day-boundary list from any forecast array ──────────────────

interface DayBound { x: number; label: string; isToday: boolean }
interface WindArrow { x: number; directionDeg: number; speedKt: number }

function buildDayBounds(
  times: Date[],
  t0: number,
  tRange: number,
  chartW: number,
): DayBound[] {
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

function nearestWindSample(forecast: WindForecastPoint[], targetMs: number): WindForecastPoint | null {
  if (forecast.length === 0) return null;
  let best = forecast[0];
  let bestDelta = Math.abs(best.time.getTime() - targetMs);
  for (let i = 1; i < forecast.length; i++) {
    const delta = Math.abs(forecast[i].time.getTime() - targetMs);
    if (delta < bestDelta) {
      best = forecast[i];
      bestDelta = delta;
    }
  }
  return bestDelta <= 6 * 3600_000 ? best : null;
}

function windArrowSize(speedKt: number): number {
  const clamped = Math.max(0, Math.min(speedKt, 30));
  return (9 + (clamped / 30) * 13) * 1.25;
}

function waveChartMaxFt(heightsFt: number[]): number {
  return Math.max(MIN_WAVE_MAX_FT, Math.ceil(Math.max(...heightsFt)));
}

// ── Combined forecast chart ──────────────────────────────────────────────────

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

  const {
    wavePath, waveLabels, dayBounds, waveNowX, waveNowY, peakPerDay, windArrows,
  } = useMemo(() => {
    type PeakEntry = { x: number; y: number; ft: number };
    const empty = {
      wavePath: '',
      waveLabels: [] as { y: number; label: string }[],
      dayBounds: [] as DayBound[],
      waveNowX: null as number | null,
      waveNowY: null as number | null,
      peakPerDay: [] as PeakEntry[],
      windArrows: [] as WindArrow[],
    };
    if (waveForecast.length < 2) return empty;

    const windReady = windForecast.length >= 2;
    const t0 = waveForecast[0].time.getTime();
    const t1 = waveForecast[waveForecast.length - 1].time.getTime();
    const tRange = t1 - t0;

    const toFt = (m: number) => m * 3.28084;
    const heightsFt = waveForecast.map(p => toFt(p.heightM));
    const waveMax = waveChartMaxFt(heightsFt);

    const xS = (t: number) => ((t - t0) / tRange) * chartW;
    const waveYS = (ft: number) => chartH - (ft / waveMax) * chartH;

    let wavePathStr = '';
    waveForecast.forEach((pt, i) => {
      const x = xS(pt.time.getTime()).toFixed(1);
      const y = waveYS(toFt(pt.heightM)).toFixed(1);
      wavePathStr += i === 0 ? `M ${x},${y}` : ` L ${x},${y}`;
    });

    const waveLbls: { y: number; label: string }[] = [];
    const waveStep = waveMax > 10 ? 2 : 1;
    for (let ft = 0; ft <= waveMax; ft += waveStep) {
      waveLbls.push({ y: waveYS(ft), label: `${ft}` });
    }

    const bounds = buildDayBounds(waveForecast.map(p => p.time), t0, tRange, chartW);

    const arrowDays = Array.from(new Set(waveForecast.map(p => hiDateKey(p.time))));
    const arrows: WindArrow[] = [];
    if (windReady) {
      arrowDays.forEach(dateKey => {
        [6, 18].forEach(hour => {
          const targetMs = hstDateKeyToUtcMs(dateKey, hour);
          if (targetMs < t0 || targetMs > t1) return;
          const sample = nearestWindSample(windForecast, targetMs);
          if (sample == null) return;
          arrows.push({ x: xS(targetMs), directionDeg: sample.directionDeg, speedKt: sample.speedKt });
        });
      });
    }

    const dayMap = new Map<string, PeakEntry>();
    waveForecast.forEach(pt => {
      const k = hiDateKey(pt.time);
      const ft = toFt(pt.heightM);
      const ex = dayMap.get(k);
      if (!ex || ft > ex.ft) {
        dayMap.set(k, { x: xS(pt.time.getTime()), y: waveYS(ft), ft });
      }
    });

    const now = Date.now();
    let waveNowX: number | null = null;
    let waveNowY: number | null = null;
    if (now >= t0 && now <= t1) {
      waveNowX = xS(now);

      for (let i = 0; i < waveForecast.length - 1; i++) {
        const ta = waveForecast[i].time.getTime(), tb = waveForecast[i + 1].time.getTime();
        if (now >= ta && now <= tb) {
          const t = (now - ta) / (tb - ta);
          const ft = toFt(waveForecast[i].heightM) + (toFt(waveForecast[i + 1].heightM) - toFt(waveForecast[i].heightM)) * t;
          waveNowY = waveYS(ft);
          break;
        }
      }
    }

    return {
      wavePath: wavePathStr,
      waveLabels: waveLbls,
      dayBounds: bounds, waveNowX, waveNowY,
      peakPerDay: Array.from(dayMap.values()), windArrows: arrows,
    };
  }, [waveForecast, windForecast, chartW, chartH]);

  return (
    <Svg width={width} height={height}>
      {waveLabels.map((l, i) => (
        <SvgText key={i} x={PAD_L - 4} y={PAD_T + l.y + 4}
          fontSize={9} fontFamily="Courier" fill={theme.muted} textAnchor="end">
          {l.label}
        </SvgText>
      ))}
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

      {wavePath ? (
        <Path d={wavePath} stroke={theme.accent} strokeWidth={1.5} fill="none"
          transform={`translate(${PAD_L},${PAD_T})`} />
      ) : null}
      {windArrows.map((a, i) => {
        const travelDeg = (a.directionDeg + 180) % 360;
        const arrowY = PAD_T + chartH - 16;
        return (
          <Polygon
            key={i}
            points={arrowPoints(PAD_L + a.x, arrowY, windArrowSize(a.speedKt), travelDeg)}
            fill={theme.accent}
            opacity={0.72}
          />
        );
      })}

      {peakPerDay.map((p, i) => (
        <SvgText key={i} x={PAD_L + p.x} y={PAD_T + p.y - 6}
          fontSize={9} fontFamily="Courier" fontWeight="700"
          fill={theme.textPrimary} textAnchor="middle">
          {p.ft.toFixed(1)}
        </SvgText>
      ))}

      {waveNowX !== null && waveNowY !== null && (
        <Circle cx={PAD_L + waveNowX} cy={PAD_T + waveNowY} r={4} fill={theme.accent} />
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
  const combinedH = 240;

  return (
    <View style={height ? { height, width: SCREEN_W } : { flex: 1 }}>
      {/* Header */}
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
              <Svg width={18} height={12}>
                <Polygon points={arrowPoints(9, 6, 12, 90)} fill={theme.accent} opacity={0.78} />
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
              height={combinedH}
              theme={theme}
            />
          </View>
          {(windLoading && windFc.length === 0) || windErr || windFc.length === 0 ? (
            <Text style={[styles.modelFallbackText, { color: theme.muted }]}>
              {windLoading && windFc.length === 0 ? 'LOADING WRF WIND…' : 'WRF WIND UNAVAILABLE'}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header:      { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
  headerRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title:       { fontFamily: 'Courier', fontWeight: '900', fontSize: 18, letterSpacing: 4 },
  subtitle:    { fontFamily: 'Courier', fontSize: 10, letterSpacing: 1 },
  divider:     { height: 1, opacity: 0.55, marginTop: 8 },
  scroll:      { paddingHorizontal: 14, paddingBottom: 28 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontFamily: 'Courier', fontSize: 11, letterSpacing: 2 },
  errorText:   { fontFamily: 'Courier', fontSize: 11, letterSpacing: 1 },
  chartBox:    { borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  legendRow:   { flexDirection: 'row', justifyContent: 'flex-end', gap: 14, marginTop: 14 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine:  { width: 18, height: 2 },
  legendText:  { fontFamily: 'Courier', fontWeight: '700', fontSize: 9, letterSpacing: 1 },
  modelFallback: { alignItems: 'center', justifyContent: 'center' },
  modelFallbackText: { fontFamily: 'Courier', fontSize: 10, letterSpacing: 2, marginTop: 8, textAlign: 'center' },
});
