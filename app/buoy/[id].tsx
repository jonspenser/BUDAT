import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import Svg, { Path, Line, Circle, G, Text as SvgText } from 'react-native-svg';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBuoyData, BuoyReading, fetchBuoyRows } from '../../hooks/useBuoyData';
import { useSwellLogContext } from '../../contexts/SwellLogContext';
import { useTheme } from '../../hooks/useTheme';
import { NEARSHORE_STATIONS } from '../../constants/buoys';
import {
  formatHawaiiTime,
  getCardinalDirection,
  isOffline,
} from '../../constants/formatters';

// ── Wave physics ───────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1r = lat1 * Math.PI / 180;
  const lat2r = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

function angularDiff(a: number, b: number): number {
  const d = Math.abs((a - b + 360) % 360);
  return d > 180 ? 360 - d : d;
}

function groupVelocityKmh(periodS: number): number {
  return (9.81 * periodS / (4 * Math.PI)) * 3.6;
}
function groupVelocityMph(periodS: number): number {
  return groupVelocityKmh(periodS) * 0.621371;
}

// ── Historical swell correlation ───────────────────────────────────────────────

interface SwellPeak {
  timestamp: Date;
  height: number;
  period: number;
}

function findSwellPeaks(readings: BuoyReading[]): SwellPeak[] {
  const sorted = [...readings].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const peaks: SwellPeak[] = [];
  for (let i = 2; i < sorted.length - 2; i++) {
    const ht = (r: BuoyReading) => r.SwH ?? r.WVHT ?? 0;
    const curr = ht(sorted[i]);
    if (curr < 0.3) continue;
    const window = [ht(sorted[i-2]), ht(sorted[i-1]), curr, ht(sorted[i+1]), ht(sorted[i+2])];
    const isMax = window.every(v => v <= curr);
    if (isMax) {
      peaks.push({
        timestamp: sorted[i].timestamp,
        height: curr,
        period: sorted[i].SwP ?? sorted[i].DPD ?? 0,
      });
    }
  }
  return peaks;
}

function matchPeaks(
  sourcePeaks: SwellPeak[],
  targetPeaks: SwellPeak[],
  theoreticalH: number,
): number[] {
  const minLag = Math.max(0.25, theoreticalH * 0.4);
  const maxLag = theoreticalH * 2.5;
  const lags: number[] = [];
  for (const sp of sourcePeaks) {
    const minMs = sp.timestamp.getTime() + minLag * 3600000;
    const maxMs = sp.timestamp.getTime() + maxLag * 3600000;
    const candidates = targetPeaks.filter(tp => {
      const ms = tp.timestamp.getTime();
      return ms >= minMs && ms <= maxMs;
    });
    const best = candidates
      .filter(c => Math.abs(c.height - sp.height) / sp.height < 0.4)
      .sort((a, b) =>
        Math.abs(a.period - sp.period) - Math.abs(b.period - sp.period)
      )[0];
    if (best) {
      lags.push((best.timestamp.getTime() - sp.timestamp.getTime()) / 3600000);
    }
  }
  return lags;
}

function median(vals: number[]): number {
  if (vals.length === 0) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtFt(m: number | null): string {
  if (m === null) return '--';
  return `${(m * 3.28084).toFixed(1)} ft`;
}
function fmtSec(s: number | null): string {
  if (s === null) return '--';
  return `${s.toFixed(1)} sec`;
}
function mpsToKt(mps: number | null): string {
  if (mps === null) return '--';
  return `${(mps * 1.944).toFixed(1)} kt`;
}
function fmtDir(deg: number | null): string {
  if (deg === null) return '--';
  return `${getCardinalDirection(deg) ?? '--'}  ${Math.round(deg)}°`;
}
function fmtTemp(c: number | null): string {
  if (c === null) return '--';
  return `${(c * 9 / 5 + 32).toFixed(1)} °F`;
}
function fmtETA(etaMs: number): string {
  const nowHi = Date.now() - 10 * 3600 * 1000;
  const nowDay = Math.floor(nowHi / 86400000);
  const etaHi = etaMs - 10 * 3600 * 1000;
  const etaDay = Math.floor(etaHi / 86400000);
  const d = new Date(etaHi);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const t = `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  if (etaDay === nowDay + 1) return `TMW ${t}`;
  if (etaDay > nowDay + 1) return `+${etaDay - nowDay}d ${t}`;
  return t;
}
function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

// ── Wave chart ─────────────────────────────────────────────────────────────────

function fmtAxisTime(d: Date): string {
  const utcH = new Date(d.getTime() - 10 * 3600 * 1000).getUTCHours();
  const ampm = utcH >= 12 ? 'PM' : 'AM';
  return `${utcH % 12 || 12}${ampm}`;
}

function niceTicks(maxVal: number): number[] {
  const step = maxVal <= 4 ? 1 : maxVal <= 8 ? 2 : maxVal <= 15 ? 3 : 5;
  const ticks: number[] = [];
  for (let t = 0; t <= maxVal; t += step) ticks.push(t);
  return ticks;
}

function WaveChart({ readings, theme }: { readings: BuoyReading[]; theme: any }) {
  const now = Date.now();
  const cutoff = now - 24 * 3600 * 1000;

  // Filter to last 24h, oldest → newest
  const sorted = [...readings]
    .filter(r => r.timestamp.getTime() >= cutoff)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (sorted.length < 2) return null;

  const W = Dimensions.get('window').width - 32;
  const H = 130;
  const pad = { top: 12, right: 14, bottom: 24, left: 34 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  const heights = sorted.map(r => (r.SwH ?? r.WVHT ?? 0) * 3.28084);
  const maxFt = Math.max(1, Math.ceil(Math.max(...heights)));

  // X mapped by actual timestamp over fixed 24h window
  const toX = (ts: number) => pad.left + ((ts - cutoff) / (now - cutoff)) * chartW;
  const toY = (ft: number) => pad.top + (1 - ft / maxFt) * chartH;

  const pts = sorted.map((r, i) => `${toX(r.timestamp.getTime()).toFixed(1)},${toY(heights[i]).toFixed(1)}`);
  const linePath = `M ${pts.join(' L ')}`;
  const fx = toX(sorted[0].timestamp.getTime()).toFixed(1);
  const lx = toX(sorted[sorted.length - 1].timestamp.getTime()).toFixed(1);
  const areaPath = `${linePath} L ${lx},${toY(0).toFixed(1)} L ${fx},${toY(0).toFixed(1)} Z`;

  const ticks = niceTicks(maxFt);

  // X axis: fixed 6-hour marks across the 24h window
  const xLabels = [0, 6, 12, 18, 24].map(h => ({
    ts: cutoff + h * 3600 * 1000,
    label: h === 24 ? 'NOW' : fmtAxisTime(new Date(cutoff + h * 3600 * 1000)),
  }));

  const dotX = toX(sorted[sorted.length - 1].timestamp.getTime());
  const dotY = toY(heights[heights.length - 1]);

  return (
    <Svg width={W} height={H} style={styles.chart}>
      {ticks.map(ft => (
        <G key={ft}>
          <Line
            x1={pad.left} y1={toY(ft)}
            x2={W - pad.right} y2={toY(ft)}
            stroke={theme.accentDim} strokeWidth={ft === 0 ? 1 : 0.5} opacity={0.5}
          />
          <SvgText x={pad.left - 4} y={toY(ft) + 3.5} fontSize={9} fontFamily="Courier" fill={theme.muted} textAnchor="end">
            {ft}
          </SvgText>
        </G>
      ))}
      <SvgText x={pad.left - 4} y={pad.top - 2} fontSize={8} fontFamily="Courier" fill={theme.muted} textAnchor="end">ft</SvgText>
      <Path d={areaPath} fill={theme.accent} fillOpacity={0.12} />
      <Path d={linePath} fill="none" stroke={theme.accent} strokeWidth={1.8} />
      <Circle cx={dotX} cy={dotY} r={3} fill={theme.accent} />
      {xLabels.map(({ ts, label }) => {
        const x = toX(ts);
        if (x < pad.left || x > W - pad.right) return null;
        return (
          <SvgText key={ts} x={x} y={H - 4} fontSize={9} fontFamily="Courier" fill={theme.muted} textAnchor="middle">
            {label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// ── Shared UI ──────────────────────────────────────────────────────────────────

function HeroCell({ label, value, theme }: { label: string; value: string; theme: any }) {
  return (
    <View style={styles.heroCell}>
      <Text style={[styles.heroValue, { color: theme.accent }]}>{value}</Text>
      <Text style={[styles.heroLabel, { color: theme.muted }]}>{label}</Text>
    </View>
  );
}

function DataRow({ label, value, theme, dim }: { label: string; value: string; theme: any; dim?: boolean }) {
  return (
    <View style={styles.dataRow}>
      <Text style={[styles.dataLabel, { color: dim ? theme.muted : theme.muted }]}>{label}</Text>
      <Text style={[styles.dataValue, { color: dim ? theme.muted : theme.textPrimary }]}>{value}</Text>
    </View>
  );
}

function Section({ title, children, theme }: { title: string; children: React.ReactNode; theme: any }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: theme.accent }]}>{title}</Text>
      <View style={[styles.sectionDivider, { backgroundColor: theme.accentDim }]} />
      {children}
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function BuoyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const station = NEARSHORE_STATIONS.find(s => s.id === id);
  const { data, history, loading, refetch } = useBuoyData(id ?? '');

  const [targetHistories, setTargetHistories] = useState<Map<string, BuoyReading[]>>(new Map());
  const [correlating, setCorrelating] = useState(false);

  const offline = isOffline(data?.timestamp);

  const etaPredictions = useMemo(() => {
    if (!data || !station) return [];
    const period = data.SwP ?? data.DPD;
    const swellDir = data.SwD ?? data.MWD;
    if (period === null || swellDir === null) return [];
    const travelDir = (swellDir + 180) % 360;
    const Cg = groupVelocityKmh(period);
    return NEARSHORE_STATIONS
      .filter(s => s.id !== id)
      .map(s => {
        const distKm = haversineKm(station.lat, station.lon, s.lat, s.lon);
        const bearing = bearingDeg(station.lat, station.lon, s.lat, s.lon);
        const alignDeg = angularDiff(travelDir, bearing);
        const theoreticalH = distKm / Cg;
        const etaMs = data.timestamp.getTime() + theoreticalH * 3600 * 1000;
        return { station: s, distKm, alignDeg, theoreticalH, etaMs };
      })
      .filter(p => p.alignDeg < 55)
      .sort((a, b) => a.distKm - b.distKm);
  }, [data, station, id]);

  useEffect(() => {
    if (etaPredictions.length === 0) return;
    let cancelled = false;
    setCorrelating(true);
    Promise.all(
      etaPredictions.map(p =>
        fetchBuoyRows(p.station.id)
          .then(rows => ({ id: p.station.id, rows }))
          .catch(() => ({ id: p.station.id, rows: [] as BuoyReading[] }))
      )
    ).then(results => {
      if (cancelled) return;
      const map = new Map<string, BuoyReading[]>();
      results.forEach(r => map.set(r.id, r.rows));
      setTargetHistories(map);
      setCorrelating(false);
    });
    return () => { cancelled = true; };
  }, [etaPredictions.map(p => p.station.id).join(',')]);

  const { logSwell } = useSwellLogContext();
  const [loggedNow, setLoggedNow] = useState(false);

  const handleLogSwell = useCallback(() => {
    if (!data || !station) return;
    logSwell(data, station.id, station.name);
    setLoggedNow(true);
    setTimeout(() => setLoggedNow(false), 3000);
  }, [data, station, logSwell]);

  const empiricalTransits = useMemo(() => {
    if (history.length < 10 || targetHistories.size === 0) return new Map<string, number>();
    const sourcePeaks = findSwellPeaks(history);
    const result = new Map<string, number>();
    for (const p of etaPredictions) {
      const targetHistory = targetHistories.get(p.station.id) ?? [];
      if (targetHistory.length < 10) continue;
      const targetPeaks = findSwellPeaks(targetHistory);
      const lags = matchPeaks(sourcePeaks, targetPeaks, p.theoreticalH);
      if (lags.length >= 1) result.set(p.station.id, median(lags));
    }
    return result;
  }, [history, targetHistories, etaPredictions]);

  // Hero values: prefer swell (more surf-relevant) over total wave
  const heroHt  = data?.WVHT ?? data?.SwH ?? null;
  const heroPer = data?.SwP ?? data?.DPD ?? null;
  const heroDir = data?.SwD ?? data?.MWD ?? null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: theme.accent }]}>← BACK</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.stationName, { color: theme.accent }]}>{station?.name ?? id}</Text>
          <Text style={[styles.stationId, { color: theme.muted }]}>{id}</Text>
        </View>
        <TouchableOpacity onPress={handleLogSwell} style={styles.backBtn} disabled={!data || loggedNow}>
          <Text style={[styles.backText, { color: loggedNow ? theme.muted : theme.accent }]}>
            {loggedNow ? 'SAVED' : 'LOG ›'}
          </Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.headerDivider, { backgroundColor: theme.accent }]} />

      {loading && !data ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refetch} tintColor={theme.accent} colors={[theme.accent]} />
          }
        >
          {data && (
            <Text style={[styles.timestamp, { color: theme.muted }]}>
              {offline ? 'OFFLINE' : `AS OF ${formatHawaiiTime(data.timestamp)} HST`}
            </Text>
          )}

          {/* Hero — three key numbers at a glance */}
          {data && !offline && (
            <View style={[styles.hero, { borderColor: theme.accentDim }]}>
              <HeroCell label="WAVE HEIGHT" value={fmtFt(heroHt)} theme={theme} />
              <View style={[styles.heroDivider, { backgroundColor: theme.accentDim }]} />
              <HeroCell label="PERIOD" value={fmtSec(heroPer)} theme={theme} />
              <View style={[styles.heroDivider, { backgroundColor: theme.accentDim }]} />
              <HeroCell
                label="DIRECTION"
                value={heroDir != null ? (getCardinalDirection(heroDir) ?? '--') : '--'}
                theme={theme}
              />
            </View>
          )}

          {/* Wave summary */}
          <Section title="WAVES" theme={theme}>
            <DataRow label="Sig Wave Height (WVHT)" value={fmtFt(data?.WVHT ?? null)} theme={theme} />
            <DataRow label="Dominant Period (DPD)"  value={fmtSec(data?.DPD ?? null)} theme={theme} />
            <DataRow label="Mean Direction (MWD)"   value={fmtDir(data?.MWD ?? null)} theme={theme} />
          </Section>

          {/* Primary swell */}
          <Section title="PRIMARY SWELL" theme={theme}>
            <DataRow label="Swell Height (SwH)"    value={fmtFt(data?.SwH ?? null)} theme={theme} />
            <DataRow label="Swell Period (SwP)"    value={fmtSec(data?.SwP ?? null)} theme={theme} />
            <DataRow label="Swell Direction (SwD)" value={fmtDir(data?.SwD ?? null)} theme={theme} />
          </Section>

          {/* Wind wave */}
          <Section title="WIND WAVE" theme={theme}>
            <DataRow label="Wind Wave Height (WWH)"    value={fmtFt(data?.WWH ?? null)} theme={theme} />
            <DataRow label="Wind Wave Direction (WWD)" value={fmtDir(data?.WWD ?? null)} theme={theme} />
          </Section>

          {/* Wind */}
          <Section title="WIND" theme={theme}>
            <DataRow label="Wind Direction (WDIR)" value={fmtDir(data?.WDIR ?? null)} theme={theme} />
            <DataRow label="Wind Speed (WSPD)"     value={mpsToKt(data?.WSPD ?? null)} theme={theme} />
            <DataRow label="Wind Gust (GST)"       value={mpsToKt(data?.GST ?? null)} theme={theme} />
          </Section>

          {/* Ocean / atmosphere */}
          <Section title="OCEAN" theme={theme}>
            <DataRow label="Water Temp (WTMP)" value={fmtTemp(data?.WTMP ?? null)} theme={theme} />
            <DataRow label="Air Temp (ATMP)"   value={fmtTemp(data?.ATMP ?? null)} theme={theme} />
            <DataRow label="Pressure (PRES)"   value={data?.PRES != null ? `${data.PRES} hPa` : '--'} theme={theme} dim />
          </Section>

          {/* 24-hour history table with chart */}
          {history.length > 1 && (
            <Section title="RECENT READINGS" theme={theme}>
              <WaveChart readings={history} theme={theme} />
              <View style={styles.historyHeader}>
                <Text style={[styles.hCol, styles.hTime, { color: theme.muted }]}>TIME</Text>
                <Text style={[styles.hCol, styles.hVal,  { color: theme.muted }]}>HT</Text>
                <Text style={[styles.hCol, styles.hVal,  { color: theme.muted }]}>PERIOD</Text>
                <Text style={[styles.hCol, styles.hVal,  { color: theme.muted }]}>DIR</Text>
              </View>
              {history.slice(0, 24).map((r, i) => (
                <View key={i} style={[styles.historyRow, i % 2 === 1 && { opacity: 0.7 }]}>
                  <Text style={[styles.hCol, styles.hTime, { color: theme.muted }]}>
                    {formatHawaiiTime(r.timestamp)}
                  </Text>
                  <Text style={[styles.hCol, styles.hVal, { color: theme.textPrimary }]}>
                    {fmtFt(r.SwH ?? r.WVHT)}
                  </Text>
                  <Text style={[styles.hCol, styles.hVal, { color: theme.textPrimary }]}>
                    {fmtSec(r.SwP ?? r.DPD)}
                  </Text>
                  <Text style={[styles.hCol, styles.hVal, { color: theme.textPrimary }]}>
                    {r.MWD !== null ? `${getCardinalDirection(r.MWD) ?? '--'} ${Math.round(r.MWD!)}°` : '--'}
                  </Text>
                </View>
              ))}
            </Section>
          )}

          {/* Swell ETA — bottom */}
          {etaPredictions.length > 0 && (
            <Section title="SWELL ETA" theme={theme}>
              <Text style={[styles.etaNote, { color: theme.muted }]}>
                {`${getCardinalDirection(data?.SwD ?? data?.MWD ?? 0) ?? '--'} swell · ${(data?.SwP ?? data?.DPD ?? 0).toFixed(0)}s · ${groupVelocityMph(data?.SwP ?? data?.DPD ?? 1).toFixed(0)} mph`}
              </Text>
              <View style={styles.etaHeader}>
                <Text style={[styles.etaCol, styles.etaStation, { color: theme.muted }]}>STATION</Text>
                <Text style={[styles.etaCol, styles.etaTheory, { color: theme.muted }]}>THEORY</Text>
                <Text style={[styles.etaCol, styles.etaActual, { color: theme.muted }]}>ACTUAL</Text>
                <Text style={[styles.etaCol, styles.etaTime,   { color: theme.muted }]}>ETA</Text>
              </View>
              {etaPredictions.map((p, i) => {
                const empirical = empiricalTransits.get(p.station.id);
                const etaH = empirical ?? p.theoreticalH;
                const etaMs = data!.timestamp.getTime() + etaH * 3600000;
                return (
                  <View key={p.station.id} style={[styles.etaRow, i % 2 === 1 && { opacity: 0.75 }]}>
                    <Text style={[styles.etaCol, styles.etaStation, { color: theme.accent }]}>
                      {p.station.name}
                    </Text>
                    <Text style={[styles.etaCol, styles.etaTheory, { color: theme.muted }]}>
                      {fmtHours(p.theoreticalH)}
                    </Text>
                    <Text style={[styles.etaCol, styles.etaActual, {
                      color: empirical != null ? theme.textPrimary : theme.muted,
                    }]}>
                      {correlating && empirical == null ? '…' : empirical != null ? fmtHours(empirical) : '--'}
                    </Text>
                    <Text style={[styles.etaCol, styles.etaTime, { color: theme.textPrimary }]}>
                      {fmtETA(etaMs)}
                    </Text>
                  </View>
                );
              })}
              <Text style={[styles.etaFooter, { color: theme.muted }]}>
                ETA uses measured transit when available, theory otherwise
              </Text>
            </Section>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerCenter: { alignItems: 'center' },
  backBtn: { width: 70 },
  backText: { fontFamily: 'Courier', fontWeight: 'bold', fontSize: 12, letterSpacing: 1 },
  stationName: { fontFamily: 'Courier', fontWeight: '900', fontSize: 18, letterSpacing: 4 },
  stationId: { fontFamily: 'Courier', fontSize: 10, letterSpacing: 2, marginTop: 2 },
  headerDivider: { height: 1, opacity: 0.55 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  timestamp: { fontFamily: 'Courier', fontSize: 11, letterSpacing: 2, textAlign: 'center', marginBottom: 14 },

  // Hero row
  hero: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 22,
    paddingVertical: 14,
  },
  heroCell: { flex: 1, alignItems: 'center' },
  heroValue: { fontFamily: 'Courier', fontWeight: '900', fontSize: 26, letterSpacing: 1 },
  heroLabel: { fontFamily: 'Courier', fontSize: 9, letterSpacing: 2, marginTop: 4 },
  heroDivider: { width: 1, opacity: 0.4 },

  // Sections
  section: { marginBottom: 22 },
  sectionTitle: { fontFamily: 'Courier', fontWeight: '900', fontSize: 12, letterSpacing: 3, marginBottom: 7 },
  sectionDivider: { height: 1, opacity: 0.4, marginBottom: 6 },

  // Data rows — NOAA style: descriptive label left, value right
  dataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  dataLabel: { flex: 1.7, fontFamily: 'Courier', fontSize: 13, letterSpacing: 0.3 },
  dataValue: { flex: 1, fontFamily: 'Courier', fontWeight: '700', fontSize: 16, letterSpacing: 0.5, textAlign: 'right' },

  // ETA table
  etaNote: { fontFamily: 'Courier', fontSize: 11, letterSpacing: 1, marginBottom: 10 },
  etaHeader: { flexDirection: 'row', marginBottom: 4 },
  etaRow: { flexDirection: 'row', paddingVertical: 6 },
  etaCol: { fontFamily: 'Courier', fontSize: 12 },
  etaStation: { flex: 2.2, letterSpacing: 0.5 },
  etaTheory:  { flex: 1.1, letterSpacing: 0.5 },
  etaActual:  { flex: 1.1, letterSpacing: 0.5 },
  etaTime:    { flex: 2.2, letterSpacing: 0.5, textAlign: 'right' },
  etaFooter: { fontFamily: 'Courier', fontSize: 9, letterSpacing: 0.5, marginTop: 8, opacity: 0.7 },

  chart: { marginBottom: 12, marginLeft: -2 },

  // History table
  historyHeader: { flexDirection: 'row', marginBottom: 4 },
  historyRow: { flexDirection: 'row', paddingVertical: 5 },
  hCol: { fontFamily: 'Courier', fontSize: 12 },
  hTime: { flex: 2, letterSpacing: 0.5 },
  hVal:  { flex: 1.5, textAlign: 'right', letterSpacing: 0.5 },
});
