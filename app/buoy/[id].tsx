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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBuoyData, BuoyReading, fetchBuoyRows } from '../../hooks/useBuoyData';
import { useSwellLogContext } from '../../contexts/SwellLogContext';
import { useTheme } from '../../hooks/useTheme';
import { NEARSHORE_STATIONS } from '../../constants/buoys';
import {
  formatHeight,
  formatPeriod,
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

/** Deep-water group velocity: Cg = gT/4π → km/h */
function groupVelocityKmh(periodS: number): number {
  return (9.81 * periodS / (4 * Math.PI)) * 3.6;
}
/** Same converted to mph */
function groupVelocityMph(periodS: number): number {
  return groupVelocityKmh(periodS) * 0.621371;
}

// ── Historical swell correlation ───────────────────────────────────────────────

interface SwellPeak {
  timestamp: Date;
  height: number;   // meters
  period: number;   // seconds
}

/** Find local maxima in swell height (smoothed over 3 readings) */
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

/**
 * Match swell peaks between source and target.
 * Returns measured transit times (hours).
 */
function matchPeaks(
  sourcePeaks: SwellPeak[],
  targetPeaks: SwellPeak[],
  theoreticalH: number,   // theoretical transit time as anchor
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
    // Best candidate: within 40% height, closest period
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

// ── ETA formatting ─────────────────────────────────────────────────────────────

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

// ── Shared UI ──────────────────────────────────────────────────────────────────

function mpsToKt(mps: number | null): string {
  if (mps === null) return '--';
  return `${(mps * 1.944).toFixed(1)}kt`;
}
function fmtDir(deg: number | null): string {
  if (deg === null) return '--';
  return `${getCardinalDirection(deg) ?? '--'}  ${Math.round(deg)}°`;
}
function fmtTemp(c: number | null): string {
  if (c === null) return '--';
  return `${(c * 9 / 5 + 32).toFixed(1)}°F`;
}

function DataRow({ label, value, theme }: { label: string; value: string; theme: any }) {
  return (
    <View style={styles.dataRow}>
      <Text style={[styles.dataLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.dataValue, { color: theme.textPrimary }]}>{value}</Text>
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

  // Target buoy histories for correlation
  const [targetHistories, setTargetHistories] = useState<Map<string, BuoyReading[]>>(new Map());
  const [correlating, setCorrelating] = useState(false);

  const offline = isOffline(data?.timestamp);

  // ── Theoretical ETA predictions ──
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

  // ── Fetch target histories for correlation ──
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

  // ── Swell log ──
  const { logSwell } = useSwellLogContext();
  const [loggedNow, setLoggedNow] = useState(false);

  const handleLogSwell = useCallback(() => {
    if (!data || !station) return;
    logSwell(data, station.id, station.name);
    setLoggedNow(true);
    setTimeout(() => setLoggedNow(false), 3000);
  }, [data, station, logSwell]);

  // ── Historical correlation results ──
  const empiricalTransits = useMemo(() => {
    if (history.length < 10 || targetHistories.size === 0) return new Map<string, number>();
    const sourcePeaks = findSwellPeaks(history);
    const result = new Map<string, number>();
    for (const p of etaPredictions) {
      const targetHistory = targetHistories.get(p.station.id) ?? [];
      if (targetHistory.length < 10) continue;
      const targetPeaks = findSwellPeaks(targetHistory);
      const lags = matchPeaks(sourcePeaks, targetPeaks, p.theoreticalH);
      if (lags.length >= 1) {
        result.set(p.station.id, median(lags));
      }
    }
    return result;
  }, [history, targetHistories, etaPredictions]);

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
            {loggedNow ? 'SAVED ✓' : 'LOG ›'}
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

          {/* Swell ETA */}
          {etaPredictions.length > 0 && (
            <Section title="SWELL ETA" theme={theme}>
              <Text style={[styles.etaNote, { color: theme.muted }]}>
                {`${getCardinalDirection(data?.SwD ?? data?.MWD ?? 0) ?? '--'} swell · ${(data?.SwP ?? data?.DPD ?? 0).toFixed(0)}s · ${groupVelocityMph(data?.SwP ?? data?.DPD ?? 1).toFixed(0)} mph`}
              </Text>
              {/* Column headers */}
              <View style={styles.etaHeader}>
                <Text style={[styles.etaCol, styles.etaStation, { color: theme.muted }]}>STATION</Text>
                <Text style={[styles.etaCol, styles.etaTheory, { color: theme.muted }]}>THEORY</Text>
                <Text style={[styles.etaCol, styles.etaActual, { color: theme.muted }]}>ACTUAL</Text>
                <Text style={[styles.etaCol, styles.etaTime, { color: theme.muted }]}>ETA</Text>
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

          {/* Swell components — shown when both swell and wind wave are meaningful */}
          {data && (data.SwH ?? 0) > 0.3 && (data.WWH ?? 0) > 0.3 && (
            <Section title="SWELL COMPONENTS" theme={theme}>
              <Text style={[styles.etaNote, { color: theme.accent }]}>2 SWELL COMPONENTS DETECTED</Text>
              <View style={styles.componentHeader}>
                <Text style={[styles.componentLabel, { color: theme.muted }]}>TYPE</Text>
                <Text style={[styles.componentVal, { color: theme.muted }]}>HT</Text>
                <Text style={[styles.componentVal, { color: theme.muted }]}>PERIOD</Text>
                <Text style={[styles.componentVal, { color: theme.muted }]}>DIR</Text>
              </View>
              <View style={styles.componentRow}>
                <Text style={[styles.componentLabel, { color: theme.accent }]}>SWELL</Text>
                <Text style={[styles.componentVal, { color: theme.textPrimary }]}>{formatHeight(data.SwH)}</Text>
                <Text style={[styles.componentVal, { color: theme.textPrimary }]}>{formatPeriod(data.SwP)}</Text>
                <Text style={[styles.componentVal, { color: theme.textPrimary }]}>{fmtDir(data.SwD)}</Text>
              </View>
              <View style={styles.componentRow}>
                <Text style={[styles.componentLabel, { color: theme.muted }]}>WIND WAVE</Text>
                <Text style={[styles.componentVal, { color: theme.textPrimary }]}>{formatHeight(data.WWH)}</Text>
                <Text style={[styles.componentVal, { color: theme.muted }]}>--</Text>
                <Text style={[styles.componentVal, { color: theme.textPrimary }]}>{fmtDir(data.WWD)}</Text>
              </View>
            </Section>
          )}

          {/* Swell */}
          <Section title="SWELL" theme={theme}>
            <DataRow label="HEIGHT" value={formatHeight(data?.SwH ?? null)} theme={theme} />
            <DataRow label="PERIOD" value={formatPeriod(data?.SwP ?? null)} theme={theme} />
            <DataRow label="DIRECTION" value={fmtDir(data?.SwD ?? null)} theme={theme} />
          </Section>

          {/* Total Wave */}
          <Section title="TOTAL WAVE" theme={theme}>
            <DataRow label="SIG HEIGHT" value={formatHeight(data?.WVHT ?? null)} theme={theme} />
            <DataRow label="DOM PERIOD" value={formatPeriod(data?.DPD ?? null)} theme={theme} />
            <DataRow label="MEAN DIR" value={fmtDir(data?.MWD ?? null)} theme={theme} />
          </Section>

          {/* Wind Wave */}
          <Section title="WIND WAVE" theme={theme}>
            <DataRow label="HEIGHT" value={formatHeight(data?.WWH ?? null)} theme={theme} />
            <DataRow label="DIRECTION" value={fmtDir(data?.WWD ?? null)} theme={theme} />
          </Section>

          {/* Wind */}
          <Section title="WIND" theme={theme}>
            <DataRow label="DIRECTION" value={fmtDir(data?.WDIR ?? null)} theme={theme} />
            <DataRow label="SPEED" value={mpsToKt(data?.WSPD ?? null)} theme={theme} />
            <DataRow label="GUST" value={mpsToKt(data?.GST ?? null)} theme={theme} />
          </Section>

          {/* Ocean / Atmosphere */}
          <Section title="OCEAN · ATMOSPHERE" theme={theme}>
            <DataRow label="WATER TEMP" value={fmtTemp(data?.WTMP ?? null)} theme={theme} />
            <DataRow label="AIR TEMP" value={fmtTemp(data?.ATMP ?? null)} theme={theme} />
            <DataRow label="PRESSURE" value={data?.PRES != null ? `${data.PRES} hPa` : '--'} theme={theme} />
          </Section>

          {/* Recent history */}
          {history.length > 1 && (
            <Section title="RECENT READINGS" theme={theme}>
              <View style={styles.historyHeader}>
                <Text style={[styles.hCol, styles.hTime, { color: theme.muted }]}>TIME</Text>
                <Text style={[styles.hCol, styles.hVal, { color: theme.muted }]}>HT</Text>
                <Text style={[styles.hCol, styles.hVal, { color: theme.muted }]}>PERIOD</Text>
                <Text style={[styles.hCol, styles.hVal, { color: theme.muted }]}>DIR</Text>
              </View>
              {history.slice(0, 24).map((r, i) => (
                <View key={i} style={[styles.historyRow, i % 2 === 1 && { opacity: 0.7 }]}>
                  <Text style={[styles.hCol, styles.hTime, { color: theme.muted }]}>
                    {formatHawaiiTime(r.timestamp)}
                  </Text>
                  <Text style={[styles.hCol, styles.hVal, { color: theme.textPrimary }]}>
                    {formatHeight(r.SwH ?? r.WVHT)}
                  </Text>
                  <Text style={[styles.hCol, styles.hVal, { color: theme.textPrimary }]}>
                    {formatPeriod(r.SwP ?? r.DPD)}
                  </Text>
                  <Text style={[styles.hCol, styles.hVal, { color: theme.textPrimary }]}>
                    {r.MWD !== null ? `${getCardinalDirection(r.MWD) ?? '--'} ${Math.round(r.MWD!)}°` : '--'}
                  </Text>
                </View>
              ))}
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
  timestamp: { fontFamily: 'Courier', fontSize: 10, letterSpacing: 2, textAlign: 'center', marginBottom: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontFamily: 'Courier', fontWeight: '900', fontSize: 11, letterSpacing: 3, marginBottom: 6 },
  sectionDivider: { height: 1, opacity: 0.4, marginBottom: 8 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  dataLabel: { fontFamily: 'Courier', fontSize: 11, letterSpacing: 1 },
  dataValue: { fontFamily: 'Courier', fontWeight: '600', fontSize: 14, letterSpacing: 1 },
  // ETA table
  etaNote: { fontFamily: 'Courier', fontSize: 10, letterSpacing: 1, marginBottom: 10 },
  etaHeader: { flexDirection: 'row', marginBottom: 4 },
  etaRow: { flexDirection: 'row', paddingVertical: 5 },
  etaCol: { fontFamily: 'Courier', fontSize: 11 },
  etaStation: { flex: 2.2, letterSpacing: 0.5 },
  etaTheory:  { flex: 1.1, letterSpacing: 0.5, color: '#888' },
  etaActual:  { flex: 1.1, letterSpacing: 0.5 },
  etaTime:    { flex: 2.2, letterSpacing: 0.5, textAlign: 'right' },
  etaFooter: { fontFamily: 'Courier', fontSize: 9, letterSpacing: 0.5, marginTop: 8, opacity: 0.7 },
  // History table
  historyHeader: { flexDirection: 'row', marginBottom: 4 },
  historyRow: { flexDirection: 'row', paddingVertical: 4 },
  hCol: { fontFamily: 'Courier', fontSize: 11 },
  hTime: { flex: 2, letterSpacing: 0.5 },
  hVal:  { flex: 1.5, textAlign: 'right', letterSpacing: 0.5 },
  // Swell components
  componentHeader: { flexDirection: 'row', marginBottom: 4, marginTop: 4 },
  componentRow: { flexDirection: 'row', paddingVertical: 5 },
  componentLabel: { flex: 1.8, fontFamily: 'Courier', fontSize: 10, letterSpacing: 1 },
  componentVal: { flex: 1.2, fontFamily: 'Courier', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
});
