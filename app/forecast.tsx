import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  ScrollView,
} from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
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
  const tomorrowKey = hiDateKey(new Date(Date.now() + 24 * 3600_000));
  if (dateKey === todayKey) return 'TODAY';
  if (dateKey === tomorrowKey) return 'TMW';
  const d = new Date(dateKey + 'T12:00:00Z');
  return ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getUTCDay()];
}

// ── Chart layout constants ────────────────────────────────────────────────────

const PAD_L = 34;
const PAD_R = 10;
const PAD_T = 24;
const PAD_B = 20;

// ── Shared: build day-boundary list from any forecast array ──────────────────

interface DayBound { x: number; label: string; isToday: boolean }

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

// ── Wave chart ────────────────────────────────────────────────────────────────

function WaveChart({
  forecast, width, height, theme,
}: { forecast: WaveForecastPoint[]; width: number; height: number; theme: any }) {
  const chartW = Math.max(width - PAD_L - PAD_R, 1);
  const chartH = height - PAD_T - PAD_B;

  const { path, yLabels, dayBounds, nowX, nowY, peakPerDay } = useMemo(() => {
    type PeakEntry = { x: number; y: number; ft: number };
    const empty = {
      path: '', yLabels: [] as { y: number; label: string }[],
      dayBounds: [] as DayBound[], nowX: null as number | null,
      nowY: null as number | null, peakPerDay: [] as PeakEntry[],
    };
    if (forecast.length < 2) return empty;

    const t0 = forecast[0].time.getTime();
    const t1 = forecast[forecast.length - 1].time.getTime();
    const tRange = t1 - t0;

    const toFt = (m: number) => m * 3.28084;
    const heights = forecast.map(p => toFt(p.heightM));
    const yMax = Math.ceil(Math.max(...heights)) + 0.5;

    const xS = (t: number) => ((t - t0) / tRange) * chartW;
    const yS = (ft: number) => chartH - (ft / yMax) * chartH;

    // Path
    let pathStr = '';
    forecast.forEach((pt, i) => {
      const x = xS(pt.time.getTime()).toFixed(1);
      const y = yS(toFt(pt.heightM)).toFixed(1);
      pathStr += i === 0 ? `M ${x},${y}` : ` L ${x},${y}`;
    });

    // Y labels
    const yStep = yMax > 8 ? 2 : 1;
    const yLbls: { y: number; label: string }[] = [];
    for (let ft = 0; ft <= yMax; ft += yStep) {
      yLbls.push({ y: yS(ft), label: `${ft}` });
    }

    // Day bounds
    const bounds = buildDayBounds(forecast.map(p => p.time), t0, tRange, chartW);

    // Peak per day
    const dayMap = new Map<string, PeakEntry>();
    forecast.forEach(pt => {
      const k = hiDateKey(pt.time);
      const ft = toFt(pt.heightM);
      const ex = dayMap.get(k);
      if (!ex || ft > ex.ft) {
        dayMap.set(k, { x: xS(pt.time.getTime()), y: yS(ft), ft });
      }
    });

    // Now dot
    const now = Date.now();
    let nowX: number | null = null;
    let nowY: number | null = null;
    if (now >= t0 && now <= t1) {
      nowX = xS(now);
      for (let i = 0; i < forecast.length - 1; i++) {
        const ta = forecast[i].time.getTime(), tb = forecast[i + 1].time.getTime();
        if (now >= ta && now <= tb) {
          const t = (now - ta) / (tb - ta);
          const ft = toFt(forecast[i].heightM) + (toFt(forecast[i + 1].heightM) - toFt(forecast[i].heightM)) * t;
          nowY = yS(ft);
          break;
        }
      }
    }

    return { path: pathStr, yLabels: yLbls, dayBounds: bounds, nowX, nowY, peakPerDay: Array.from(dayMap.values()) };
  }, [forecast, chartW, chartH]);

  return (
    <Svg width={width} height={height}>
      {/* Y labels */}
      {yLabels.map((l, i) => (
        <SvgText key={i} x={PAD_L - 4} y={PAD_T + l.y + 4}
          fontSize={9} fontFamily="Courier" fill={theme.muted} textAnchor="end">
          {l.label}
        </SvgText>
      ))}

      {/* Day boundaries */}
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

      {/* Curve */}
      {path ? (
        <Path d={path} stroke={theme.accent} strokeWidth={1.5} fill="none"
          transform={`translate(${PAD_L},${PAD_T})`} />
      ) : null}

      {/* Peak labels */}
      {peakPerDay.map((p, i) => (
        <SvgText key={i} x={PAD_L + p.x} y={PAD_T + p.y - 6}
          fontSize={9} fontFamily="Courier" fontWeight="700"
          fill={theme.textPrimary} textAnchor="middle">
          {p.ft.toFixed(1)}
        </SvgText>
      ))}

      {/* Now dot */}
      {nowX !== null && nowY !== null && (
        <Circle cx={PAD_L + nowX} cy={PAD_T + nowY} r={4} fill={theme.accent} />
      )}
    </Svg>
  );
}

// ── Wind chart ────────────────────────────────────────────────────────────────

function WindChart({
  forecast, width, height, theme,
}: { forecast: WindForecastPoint[]; width: number; height: number; theme: any }) {
  const chartW = Math.max(width - PAD_L - PAD_R, 1);
  const chartH = height - PAD_T - PAD_B;

  const { path, yLabels, dayBounds, nowX, nowY } = useMemo(() => {
    const empty = {
      path: '', yLabels: [] as { y: number; label: string }[],
      dayBounds: [] as DayBound[], nowX: null as number | null, nowY: null as number | null,
    };
    if (forecast.length < 2) return empty;

    const t0 = forecast[0].time.getTime();
    const t1 = forecast[forecast.length - 1].time.getTime();
    const tRange = t1 - t0;

    const speeds = forecast.map(p => p.speedKt);
    const yMax = Math.ceil(Math.max(...speeds) / 5) * 5 + 5; // round up to next 5kt

    const xS = (t: number) => ((t - t0) / tRange) * chartW;
    const yS = (kt: number) => chartH - (kt / yMax) * chartH;

    // Path
    let pathStr = '';
    forecast.forEach((pt, i) => {
      const x = xS(pt.time.getTime()).toFixed(1);
      const y = yS(pt.speedKt).toFixed(1);
      pathStr += i === 0 ? `M ${x},${y}` : ` L ${x},${y}`;
    });

    // Y labels (every 5 kt)
    const yLbls: { y: number; label: string }[] = [];
    for (let kt = 0; kt <= yMax; kt += 5) {
      yLbls.push({ y: yS(kt), label: `${kt}` });
    }

    // Day bounds
    const bounds = buildDayBounds(forecast.map(p => p.time), t0, tRange, chartW);

    // Now dot
    const now = Date.now();
    let nowX: number | null = null;
    let nowY: number | null = null;
    if (now >= t0 && now <= t1) {
      nowX = xS(now);
      for (let i = 0; i < forecast.length - 1; i++) {
        const ta = forecast[i].time.getTime(), tb = forecast[i + 1].time.getTime();
        if (now >= ta && now <= tb) {
          const t = (now - ta) / (tb - ta);
          const kt = forecast[i].speedKt + (forecast[i + 1].speedKt - forecast[i].speedKt) * t;
          nowY = yS(kt);
          break;
        }
      }
    }

    return { path: pathStr, yLabels: yLbls, dayBounds: bounds, nowX, nowY };
  }, [forecast, chartW, chartH]);

  return (
    <Svg width={width} height={height}>
      {/* Y labels */}
      {yLabels.map((l, i) => (
        <SvgText key={i} x={PAD_L - 4} y={PAD_T + l.y + 4}
          fontSize={9} fontFamily="Courier" fill={theme.muted} textAnchor="end">
          {l.label}
        </SvgText>
      ))}

      {/* Day boundaries */}
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

      {/* Curve */}
      {path ? (
        <Path d={path} stroke={theme.accentDim} strokeWidth={1.5} fill="none"
          transform={`translate(${PAD_L},${PAD_T})`} />
      ) : null}

      {/* Now dot */}
      {nowX !== null && nowY !== null && (
        <Circle cx={PAD_L + nowX} cy={PAD_T + nowY} r={4} fill={theme.accentDim} />
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

  const loading = (waveLoading && waveFc.length === 0) || (windLoading && windFc.length === 0);
  const error = waveErr ?? windErr ?? null;

  const chartW = SCREEN_W - 28;
  const waveH  = 160;
  const windH  = 130;

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
          {/* Wave height */}
          <SectionLabel text="WAVE HEIGHT" unit="ft" theme={theme} />
          <View style={[styles.chartBox, { borderColor: theme.accentDim }]}>
            <WaveChart forecast={waveFc} width={chartW} height={waveH} theme={theme} />
          </View>

          {/* Wind speed */}
          <SectionLabel text="WIND SPEED" unit="kt" theme={theme} />
          <View style={[styles.chartBox, { borderColor: theme.accentDim }]}>
            <WindChart forecast={windFc} width={chartW} height={windH} theme={theme} />
          </View>
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
});
