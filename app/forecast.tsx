import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Svg, { Path, Polygon, Circle, Line, Text as SvgText } from 'react-native-svg';
import { useWaveForecast, WaveForecastPoint } from '../hooks/useWaveForecast';
import { getCardinalDirection } from '../constants/formatters';
import { categorize, SwellCategory } from '../hooks/useSwellLog';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Forecast locations keyed by station id ────────────────────────────────────

export const FORECAST_COORDS: Record<string, { lat: number; lon: number; label: string }> = {
  kahului:    { lat: 21.00, lon: -156.50, label: 'NORTH MAUI' },
  honolulu:   { lat: 21.30, lon: -157.95, label: 'NORTH SHORE' },
  nawiliwili: { lat: 21.90, lon: -159.30, label: 'NORTH KAUAI' },
  hilo:       { lat: 19.75, lon: -155.10, label: 'HILO' },
  kawaihae:   { lat: 20.00, lon: -155.85, label: 'WEST HAWAII' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert UTC Date to Hawaii date string "YYYY-MM-DD" */
function hiDateKey(utc: Date): string {
  const hi = new Date(utc.getTime() - 10 * 3600_000);
  return hi.toISOString().slice(0, 10);
}

/** Hawaii hour 0-23 from UTC Date */
function hiHour(utc: Date): number {
  return new Date(utc.getTime() - 10 * 3600_000).getUTCHours();
}

/** Format UTC Date → "H:MMa/p" Hawaii time */
function fmtHiTime(utc: Date): string {
  const h24 = hiHour(utc);
  const mn  = new Date(utc.getTime() - 10 * 3600_000).getUTCMinutes();
  const isPm = h24 >= 12;
  const h12  = h24 % 12 || 12;
  return `${h12}:${String(mn).padStart(2,'0')}${isPm ? 'p' : 'a'}`;
}

/** Short day label from a YYYY-MM-DD dateKey */
function dayLabel(dateKey: string): string {
  const todayKey    = hiDateKey(new Date());
  const tomorrowKey = hiDateKey(new Date(Date.now() + 24 * 3600_000));
  if (dateKey === todayKey) return 'TODAY';
  if (dateKey === tomorrowKey) return 'TMW';
  const d = new Date(dateKey + 'T12:00:00Z');
  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  return days[d.getUTCDay()];
}

/** Format "YYYY-MM-DD" → "MON APR 28" or "TODAY" / "TOMORROW" */
function fmtDayLabel(dateKey: string, todayKey: string, tomorrowKey: string): string {
  if (dateKey === todayKey) return 'TODAY';
  if (dateKey === tomorrowKey) return 'TOMORROW';
  const d = new Date(dateKey + 'T12:00:00Z');
  const days   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${days[d.getUTCDay()]}  ${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function htFt(m: number): number {
  return Math.round(m * 3.28084 * 10) / 10;
}

// ── Direction arrow (reuse same polygon style as main app) ────────────────────

function arrowPoints(cx: number, cy: number, size: number, travelDeg: number): string {
  const r = size * 0.42, headW = size * 0.34, headH = size * 0.40, shaftW = size * 0.13;
  const pts: [number, number][] = [
    [0,-r],[headW/2,-r+headH],[shaftW/2,-r+headH],[shaftW/2,r],
    [-shaftW/2,r],[-shaftW/2,-r+headH],[-headW/2,-r+headH],
  ];
  const rad = travelDeg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return pts.map(([px,py]) => `${cx+px*cos-py*sin},${cy+px*sin+py*cos}`).join(' ');
}

function DirArrow({ deg, size, color }: { deg: number; size: number; color: string }) {
  const travel = (deg + 180) % 360;
  return (
    <Svg width={size} height={size}>
      <Polygon points={arrowPoints(size/2, size/2, size, travel)} fill={color} />
    </Svg>
  );
}

// ── Category badge ────────────────────────────────────────────────────────────

const CAT_COLOR: Record<SwellCategory, string> = {
  S: '#446688', M: '#448866', L: '#886644', XL: '#884444', XXL: '#662244',
};

function CatBadge({ cat }: { cat: SwellCategory }) {
  return (
    <View style={[badge.wrap, { borderColor: CAT_COLOR[cat] }]}>
      <Text style={[badge.text, { color: CAT_COLOR[cat] }]}>{cat}</Text>
    </View>
  );
}
const badge = StyleSheet.create({
  wrap:  { borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'center' },
  text:  { fontFamily: 'Courier', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
});

// ── Wave forecast chart ───────────────────────────────────────────────────────

const CHART_PAD_LEFT  = 34;
const CHART_PAD_RIGHT = 10;
const CHART_PAD_TOP   = 22;
const CHART_PAD_BOT   = 20;

interface ChartProps {
  forecast: WaveForecastPoint[];
  width: number;
  height: number;
  theme: any;
}

function WaveForecastChart({ forecast, width, height, theme }: ChartProps) {
  const chartW = Math.max(width - CHART_PAD_LEFT - CHART_PAD_RIGHT, 1);
  const chartH = height - CHART_PAD_TOP - CHART_PAD_BOT;

  const { path, yLabels, dayBounds, nowX, nowY, peakPerDay } = useMemo(() => {
    const empty = { path: '', yLabels: [] as {y:number;label:string}[], dayBounds: [] as {x:number;label:string;isToday:boolean}[], nowX: null as number|null, nowY: null as number|null, peakPerDay: [] as {x:number;y:number;label:string}[] };
    if (forecast.length < 2) return empty;

    const t0 = forecast[0].time.getTime();
    const t1 = forecast[forecast.length - 1].time.getTime();
    const tRange = t1 - t0;

    const heights = forecast.map(p => htFt(p.heightM));
    const maxHt = Math.max(...heights);
    // Round up to nearest foot, add 0.5ft buffer
    const yMax = Math.ceil(maxHt) + 0.5;
    const yMin = 0;

    const xScale = (t: number) => ((t - t0) / tRange) * chartW;
    const yScale = (ft: number) => chartH - ((ft - yMin) / (yMax - yMin)) * chartH;

    // Build path
    let pathStr = '';
    forecast.forEach((pt, i) => {
      const x = xScale(pt.time.getTime());
      const y = yScale(htFt(pt.heightM));
      pathStr += i === 0 ? `M ${x.toFixed(1)},${y.toFixed(1)}` : ` L ${x.toFixed(1)},${y.toFixed(1)}`;
    });

    // Day boundaries (when Hawaii date key changes)
    const todayKey = hiDateKey(new Date());
    const bounds: {x:number;label:string;isToday:boolean}[] = [];
    let prevKey = hiDateKey(forecast[0].time);
    // Add label for the first day at x=0
    bounds.push({ x: 0, label: dayLabel(prevKey), isToday: prevKey === todayKey });
    for (let i = 1; i < forecast.length; i++) {
      const k = hiDateKey(forecast[i].time);
      if (k !== prevKey) {
        bounds.push({ x: xScale(forecast[i].time.getTime()), label: dayLabel(k), isToday: k === todayKey });
        prevKey = k;
      }
    }

    // Y-axis labels
    const yStep = yMax > 8 ? 2 : yMax > 4 ? 1 : 0.5;
    const yLabelArr: {y:number;label:string}[] = [];
    for (let ft = 0; ft <= yMax; ft += yStep) {
      if (ft > yMax) break;
      yLabelArr.push({ y: yScale(ft), label: `${ft.toFixed(0)}` });
    }

    // Peak per day annotations
    const dayMap = new Map<string, {x:number;y:number;label:string}>();
    forecast.forEach(pt => {
      const k = hiDateKey(pt.time);
      const ft = htFt(pt.heightM);
      const x = xScale(pt.time.getTime());
      const y = yScale(ft);
      const existing = dayMap.get(k);
      if (!existing || ft > parseFloat(existing.label)) {
        dayMap.set(k, { x, y, label: ft.toFixed(1) });
      }
    });
    const peakArr = Array.from(dayMap.values());

    // Current time
    const now = Date.now();
    let nowXVal: number | null = null;
    let nowYVal: number | null = null;
    if (now >= t0 && now <= t1) {
      nowXVal = xScale(now);
      for (let i = 0; i < forecast.length - 1; i++) {
        if (now >= forecast[i].time.getTime() && now <= forecast[i+1].time.getTime()) {
          const t = (now - forecast[i].time.getTime()) / (forecast[i+1].time.getTime() - forecast[i].time.getTime());
          const ft = htFt(forecast[i].heightM) + (htFt(forecast[i+1].heightM) - htFt(forecast[i].heightM)) * t;
          nowYVal = yScale(ft);
          break;
        }
      }
    }

    return { path: pathStr, yLabels: yLabelArr, dayBounds: bounds, nowX: nowXVal, nowY: nowYVal, peakPerDay: peakArr };
  }, [forecast, chartW, chartH]);

  const svgH = height;

  return (
    <Svg width={width} height={svgH}>
      {/* Y-axis labels */}
      {yLabels.map((lbl, i) => (
        <SvgText
          key={i}
          x={CHART_PAD_LEFT - 4}
          y={CHART_PAD_TOP + lbl.y + 4}
          fontSize={9}
          fontFamily="Courier"
          fill={theme.muted}
          textAnchor="end"
        >
          {lbl.label}
        </SvgText>
      ))}

      {/* Day boundary vertical lines + labels */}
      {dayBounds.map((b, i) => {
        const cx = CHART_PAD_LEFT + b.x;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <Line
                x1={cx} y1={CHART_PAD_TOP}
                x2={cx} y2={CHART_PAD_TOP + chartH}
                stroke={theme.accentDim}
                strokeWidth={0.5}
                strokeDasharray="3,4"
                opacity={0.5}
              />
            )}
            <SvgText
              x={cx + (i === 0 ? 0 : 3)}
              y={svgH - 4}
              fontSize={9}
              fontFamily="Courier"
              fontWeight="700"
              fill={b.isToday ? theme.accent : theme.muted}
              textAnchor={i === 0 ? 'start' : 'start'}
            >
              {b.label}
            </SvgText>
          </React.Fragment>
        );
      })}

      {/* Wave curve */}
      {path ? (
        <Path
          d={path}
          stroke={theme.accent}
          strokeWidth={1.5}
          fill="none"
          transform={`translate(${CHART_PAD_LEFT}, ${CHART_PAD_TOP})`}
        />
      ) : null}

      {/* Peak height labels per day */}
      {peakPerDay.map((p, i) => (
        <SvgText
          key={i}
          x={CHART_PAD_LEFT + p.x}
          y={CHART_PAD_TOP + p.y - 6}
          fontSize={9}
          fontFamily="Courier"
          fontWeight="700"
          fill={theme.textPrimary}
          textAnchor="middle"
        >
          {p.label}
        </SvgText>
      ))}

      {/* Current time dot */}
      {nowX !== null && nowY !== null && (
        <Circle
          cx={CHART_PAD_LEFT + nowX}
          cy={CHART_PAD_TOP + nowY}
          r={4}
          fill={theme.accent}
        />
      )}
    </Svg>
  );
}

// ── Daily summary ─────────────────────────────────────────────────────────────

interface DayData {
  dateKey: string;
  points: WaveForecastPoint[];
  peakHtM: number;
  peakPt: WaveForecastPoint;
  amPeak: WaveForecastPoint | null;
  pmPeak: WaveForecastPoint | null;
}

function groupByDay(pts: WaveForecastPoint[]): DayData[] {
  const map = new Map<string, WaveForecastPoint[]>();
  pts.forEach(p => {
    const k = hiDateKey(p.time);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(p);
  });
  return Array.from(map.entries()).map(([dateKey, points]) => {
    const peakPt = points.reduce((a, b) => b.heightM > a.heightM ? b : a);
    const am = points.filter(p => hiHour(p.time) < 12);
    const pm = points.filter(p => hiHour(p.time) >= 12);
    const amPeak = am.length ? am.reduce((a,b) => b.heightM > a.heightM ? b : a) : null;
    const pmPeak = pm.length ? pm.reduce((a,b) => b.heightM > a.heightM ? b : a) : null;
    return { dateKey, points, peakHtM: peakPt.heightM, peakPt, amPeak, pmPeak };
  });
}

// ── Forecast page ─────────────────────────────────────────────────────────────

interface ForecastPageProps {
  height?: number;
  theme: any;
  stationId: string;
}

export function ForecastPage({ height, theme, stationId }: ForecastPageProps) {
  const coords = FORECAST_COORDS[stationId] ?? FORECAST_COORDS.kahului;
  const { forecast, loading, error } = useWaveForecast(coords.lat, coords.lon);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const todayKey    = hiDateKey(new Date());
  const tomorrowKey = hiDateKey(new Date(Date.now() + 24 * 3600_000));

  const days = useMemo(() => groupByDay(forecast), [forecast]);

  const chartHeight = 160;

  return (
    <View style={height ? { height, width: SCREEN_W } : { flex: 1 }}>
      {/* Header */}
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderRow}>
          <Text style={[styles.title, { color: theme.accent }]}>FORECAST</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>{coords.label}  · WW3</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: theme.accent }]} />
      </View>

      {loading && forecast.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.muted }]}>LOADING WW3 MODEL…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.muted }]}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {/* Wave height chart */}
          {forecast.length > 0 && (
            <View style={[styles.chartWrap, { borderColor: theme.accentDim }]}>
              <WaveForecastChart
                forecast={forecast}
                width={SCREEN_W - 28}
                height={chartHeight}
                theme={theme}
              />
            </View>
          )}

          {/* Daily summary rows */}
          {days.map(day => {
            const expanded = expandedDay === day.dateKey;
            const cat = categorize(htFt(day.peakHtM));
            const label = fmtDayLabel(day.dateKey, todayKey, tomorrowKey);
            const dir = getCardinalDirection(day.peakPt.directionDeg) ?? '--';

            return (
              <View key={day.dateKey}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setExpandedDay(expanded ? null : day.dateKey)}
                >
                  <View style={styles.dayRow}>
                    {/* Date */}
                    <View style={styles.dayLeft}>
                      <Text style={[styles.dayLabel, { color: day.dateKey === todayKey ? theme.accent : theme.textPrimary }]}>{label}</Text>
                      <Text style={[styles.dayDir, { color: theme.muted }]}>{dir}  {day.peakPt.period.toFixed(0)}s</Text>
                    </View>
                    {/* Peak */}
                    <View style={styles.dayMid}>
                      <Text style={[styles.dayHt, { color: theme.textPrimary }]}>
                        {htFt(day.peakHtM).toFixed(1)}ft
                      </Text>
                      {day.amPeak && day.pmPeak && (
                        <Text style={[styles.dayAmPm, { color: theme.muted }]}>
                          {htFt(day.amPeak.heightM).toFixed(1)}↑{htFt(day.pmPeak.heightM).toFixed(1)}
                        </Text>
                      )}
                    </View>
                    {/* Badge + arrow */}
                    <View style={styles.dayRight}>
                      <CatBadge cat={cat} />
                      <DirArrow deg={day.peakPt.directionDeg} size={22} color={theme.accentDim} />
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Expanded hourly rows */}
                {expanded && (
                  <View style={[styles.hourlyBlock, { borderLeftColor: theme.accentDim }]}>
                    {day.points.map((pt, i) => {
                      const ht = htFt(pt.heightM);
                      const hDir = getCardinalDirection(pt.directionDeg) ?? '--';
                      return (
                        <View key={i} style={styles.hourRow}>
                          <Text style={[styles.hourTime, { color: theme.muted }]}>
                            {fmtHiTime(pt.time)}
                          </Text>
                          <Text style={[styles.hourHt, { color: theme.textPrimary }]}>
                            {ht.toFixed(1)}ft
                          </Text>
                          <Text style={[styles.hourPer, { color: theme.muted }]}>
                            {pt.period.toFixed(0)}s
                          </Text>
                          <Text style={[styles.hourDir, { color: theme.muted }]}>
                            {hDir}
                          </Text>
                          <DirArrow deg={pt.directionDeg} size={16} color={theme.accentDim} />
                        </View>
                      );
                    })}
                  </View>
                )}

                <View style={[styles.rowDivider, { backgroundColor: theme.accentDim }]} />
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader:    { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
  pageHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title:         { fontFamily: 'Courier', fontWeight: '900', fontSize: 18, letterSpacing: 4 },
  subtitle:      { fontFamily: 'Courier', fontSize: 10, letterSpacing: 1 },
  divider:       { height: 1, opacity: 0.55, marginTop: 8 },
  scroll:        { paddingHorizontal: 14, paddingBottom: 20 },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:   { fontFamily: 'Courier', fontSize: 11, letterSpacing: 2 },
  errorText:     { fontFamily: 'Courier', fontSize: 11, letterSpacing: 1 },

  chartWrap: {
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
    opacity: 0.95,
  },

  dayRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  dayLeft: { flex: 1 },
  dayMid:  { alignItems: 'center', marginHorizontal: 12 },
  dayRight:{ alignItems: 'center', gap: 4 },

  dayLabel: { fontFamily: 'Courier', fontWeight: '700', fontSize: 12, letterSpacing: 2 },
  dayDir:   { fontFamily: 'Courier', fontSize: 10, letterSpacing: 1, marginTop: 3 },
  dayHt:    { fontFamily: 'Courier', fontWeight: '700', fontSize: 20, letterSpacing: 1 },
  dayAmPm:  { fontFamily: 'Courier', fontSize: 9, letterSpacing: 0.5, marginTop: 2 },

  hourlyBlock: { borderLeftWidth: 2, marginLeft: 8, paddingLeft: 10, paddingBottom: 6 },
  hourRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 10 },
  hourTime:    { fontFamily: 'Courier', fontSize: 10, letterSpacing: 0.5, width: 52 },
  hourHt:      { fontFamily: 'Courier', fontWeight: '600', fontSize: 13, letterSpacing: 1, width: 48 },
  hourPer:     { fontFamily: 'Courier', fontSize: 10, letterSpacing: 0.5, width: 28 },
  hourDir:     { fontFamily: 'Courier', fontSize: 10, letterSpacing: 0.5, width: 30 },

  rowDivider: { height: 1, opacity: 0.4 },
});
