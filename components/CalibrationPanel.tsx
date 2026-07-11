import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Theme } from '../constants/colors';
import { useCalibrationLog } from '../hooks/useCalibrationLog';
import { useDirectionCalibration } from '../hooks/useDirectionCalibration';
import { useMicWind } from '../hooks/useMicWind';
import WindRadar from './WindRadar';

const { width: W } = Dimensions.get('window');

type Mode = 'speed' | 'direction';

interface Props {
  theme: Theme;
  height?: number;
  onExit: () => void;
}

/**
 * Hidden dev tool (long-press the ANEMOMETER title to open). Renders upright —
 * NOT rotated — because calibration means holding the phone normally, reading a
 * handheld anemometer, and typing the true value.
 *
 * SPEED mode holds steady and logs dBFS ↔ knots.
 * DIRECTION mode sweeps to detect a bearing, then logs detected ↔ true to find
 * the compass offset. Only one recorder runs at a time, driven by `mode`.
 */
export default function CalibrationPanel({ theme, height, onExit }: Props) {
  const [mode, setMode] = useState<Mode>('speed');
  const cal = useCalibrationLog();      // audio-only recorder (speed)
  const dirMic = useMicWind();          // audio + magnetometer recorder (direction)
  const dirCal = useDirectionCalibration();

  const [knotsInput, setKnotsInput] = useState('');
  const [trueDirInput, setTrueDirInput] = useState('');

  // Run exactly one recorder for the active mode (small delay lets the other
  // fully release first, avoiding an iOS double-record error)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (mode === 'speed') {
      dirMic.stop();
      t = setTimeout(() => cal.start(), 400);
    } else {
      cal.stop();
      t = setTimeout(() => dirMic.start(), 400);
    }
    return () => clearTimeout(t);
  }, [mode]);

  // Stop everything on unmount
  useEffect(() => () => { cal.stop(); dirMic.stop(); }, []);

  // Direction detection auto-locks after a few passes; restart it so the live
  // bearing keeps updating for logging multiple points
  useEffect(() => {
    if (mode === 'direction' && dirMic.isComplete) {
      const t = setTimeout(() => dirMic.start(), 800);
      return () => clearTimeout(t);
    }
  }, [mode, dirMic.isComplete]);

  const fmt = (v: number | null) => (v === null ? '--' : v.toFixed(1));

  // ── Speed handlers ──
  const canLogSpeed = cal.dbAvg !== null && knotsInput.trim() !== '' && !isNaN(parseFloat(knotsInput));
  const handleLogSpeed = () => {
    const k = parseFloat(knotsInput);
    if (isNaN(k) || k < 0) return;
    cal.logPoint(k);
    setKnotsInput('');
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };
  const sortedSpeed = cal.points.slice().sort((a, b) => a.trueKnots - b.trueKnots);

  // ── Direction handlers ──
  const detected = dirMic.windHeadingDeg;
  const canLogDir = detected !== null && trueDirInput.trim() !== '' && !isNaN(parseFloat(trueDirInput));
  const handleLogDir = () => {
    const tv = parseFloat(trueDirInput);
    if (detected === null || isNaN(tv)) return;
    dirCal.logPoint(detected, tv);
    setTrueDirInput('');
    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
  };
  const radarSize = Math.min(W * 0.6, 230);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background, width: W, height }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.accent }]}>CALIBRATION</Text>
        <TouchableOpacity onPress={onExit} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[styles.done, { color: theme.accent }]}>DONE ✕</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.accent }]} />

      {/* Mode toggle */}
      <View style={styles.modeRow}>
        {(['speed', 'direction'] as Mode[]).map(m => {
          const on = mode === m;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.modeBtn, { borderColor: theme.accent, backgroundColor: on ? theme.accent : 'transparent' }]}
              onPress={() => setMode(m)}
              activeOpacity={0.7}
            >
              <Text style={[styles.modeBtnText, { color: on ? theme.background : theme.accent }]}>
                {m === 'speed' ? 'SPEED' : 'DIRECTION'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {mode === 'speed' ? (
        <>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Hold phone in the wind by the anemometer. Wait ~5s for the average to
            settle, type the knots, then LOG POINT. Repeat across a range of speeds.
          </Text>

          {/* Live dB */}
          <View style={[styles.liveBox, { borderColor: theme.accentDim }]}>
            <View style={styles.liveMainRow}>
              <View style={styles.liveCell}>
                <Text style={[styles.liveLabel, { color: theme.muted }]}>5s AVG</Text>
                <Text style={[styles.liveBig, { color: theme.textPrimary }]}>{fmt(cal.dbAvg)}</Text>
                <Text style={[styles.liveUnit, { color: theme.muted }]}>dBFS</Text>
              </View>
              <View style={[styles.liveDivider, { backgroundColor: theme.accentDim }]} />
              <View style={styles.liveCell}>
                <Text style={[styles.liveLabel, { color: theme.muted }]}>LIVE</Text>
                <Text style={[styles.liveMid, { color: theme.accent }]}>{fmt(cal.smoothedDb)}</Text>
                <Text style={[styles.liveUnit, { color: theme.muted }]}>dBFS</Text>
              </View>
            </View>
            <Text style={[styles.rangeText, { color: theme.muted }]}>
              range {fmt(cal.dbMin)} → {fmt(cal.dbMax)} dBFS
              {cal.dbMin !== null && cal.dbMax !== null ? `  (±${((cal.dbMax - cal.dbMin) / 2).toFixed(1)})` : ''}
            </Text>
            {!cal.isRecording && <Text style={[styles.status, { color: theme.muted }]}>starting mic…</Text>}
          </View>

          {/* Entry */}
          <View style={styles.entryRow}>
            <TextInput
              style={[styles.input, { borderColor: theme.accentDim, color: theme.textPrimary }]}
              value={knotsInput}
              onChangeText={setKnotsInput}
              placeholder="true kts"
              placeholderTextColor={theme.muted}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={() => canLogSpeed && handleLogSpeed()}
            />
            <TouchableOpacity
              style={[styles.logBtn, { borderColor: theme.accent, backgroundColor: canLogSpeed ? theme.accent : 'transparent', opacity: canLogSpeed ? 1 : 0.4 }]}
              onPress={handleLogSpeed}
              disabled={!canLogSpeed}
              activeOpacity={0.7}
            >
              <Text style={[styles.logBtnText, { color: canLogSpeed ? theme.background : theme.accent }]}>LOG POINT</Text>
            </TouchableOpacity>
          </View>

          {/* Points table */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thKts, { color: theme.muted }]}>KTS</Text>
            <Text style={[styles.thDb, { color: theme.muted }]}>dB AVG</Text>
            <Text style={[styles.thRange, { color: theme.muted }]}>MIN/MAX</Text>
            <Text style={[styles.thDel, { color: theme.muted }]}> </Text>
          </View>
          <View style={[styles.tableDivider, { backgroundColor: theme.accentDim }]} />
          {sortedSpeed.length === 0 ? (
            <Text style={[styles.empty, { color: theme.muted }]}>No points logged yet</Text>
          ) : (
            sortedSpeed.map(p => (
              <View key={p.id} style={styles.dataRow}>
                <Text style={[styles.tdKts, { color: theme.textPrimary }]}>{p.trueKnots}</Text>
                <Text style={[styles.tdDb, { color: theme.accent }]}>{p.dbAvg.toFixed(1)}</Text>
                <Text style={[styles.tdRange, { color: theme.muted }]}>{p.dbMin.toFixed(0)}/{p.dbMax.toFixed(0)}</Text>
                <TouchableOpacity onPress={() => cal.deletePoint(p.id)} style={styles.tdDel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.delX, { color: theme.muted }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          {/* Fit result */}
          <View style={[styles.fitBox, { borderColor: theme.accentDim }]}>
            <Text style={[styles.fitTitle, { color: theme.accent }]}>FITTED CURVE</Text>
            {cal.fit ? (
              <>
                <Text style={[styles.fitLine, { color: theme.textPrimary }]}>dB = {cal.fit.A} + {cal.fit.B}·log₁₀(kts)</Text>
                <Text style={[styles.fitMeta, { color: theme.muted }]}>
                  n={cal.fit.n}   R²={cal.fit.r2}
                  {cal.fit.r2 < 0.8 ? '  ⚠ low — add more points' : cal.fit.r2 >= 0.95 ? '  ✓ strong' : ''}
                </Text>
                <Text style={[styles.fitCodeLabel, { color: theme.muted }]}>DB_BREAKPOINTS (paste into useMicWind.ts):</Text>
                <View style={[styles.codeBox, { borderColor: theme.accentDim }]}>
                  <Text selectable style={[styles.code, { color: theme.accent }]}>
                    {'const DB_BREAKPOINTS: [number, number][] = [\n'}
                    {cal.fit.breakpoints.map(([db, bf]) => `  [${db}, ${bf}],`).join('\n')}
                    {'\n];'}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={[styles.fitMeta, { color: theme.muted }]}>Need ≥3 points at different wind speeds to fit a curve.</Text>
            )}
          </View>

          {cal.error && <Text style={[styles.error, { color: theme.accent }]}>{cal.error}</Text>}

          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.accent }]} onPress={cal.exportCsv} disabled={cal.points.length === 0} activeOpacity={0.7}>
              <Text style={[styles.actionText, { color: theme.accent, opacity: cal.points.length === 0 ? 0.4 : 1 }]}>EXPORT CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.muted }]} onPress={cal.clear} disabled={cal.points.length === 0} activeOpacity={0.7}>
              <Text style={[styles.actionText, { color: theme.muted, opacity: cal.points.length === 0 ? 0.4 : 1 }]}>CLEAR ALL</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.hint, { color: theme.muted }]}>
            Sweep the phone across the wind until a bearing locks in, read the true
            bearing off your vane, type it, then LOG POINT. A few points at different
            true directions give the compass offset.
          </Text>

          {/* Radar */}
          <View style={styles.radarWrap}>
            <WindRadar
              signalProfile={dirMic.signalProfile}
              headingDeg={dirMic.windHeadingDeg}
              currentHeadingDeg={dirMic.currentHeadingDeg}
              theme={theme}
              size={radarSize}
            />
          </View>

          {/* Detected readout */}
          <View style={styles.detectedRow}>
            <Text style={[styles.detLabel, { color: theme.muted }]}>DETECTED</Text>
            {detected !== null ? (
              <Text style={[styles.detValue, { color: theme.accent }]}>
                {dirMic.windCardinal}  {Math.round(detected)}°
              </Text>
            ) : (
              <Text style={[styles.detValue, { color: theme.muted }]}>{dirMic.isRecording ? 'sweep to detect…' : 'starting…'}</Text>
            )}
          </View>

          {/* Entry */}
          <View style={styles.entryRow}>
            <TextInput
              style={[styles.input, { borderColor: theme.accentDim, color: theme.textPrimary }]}
              value={trueDirInput}
              onChangeText={setTrueDirInput}
              placeholder="true °"
              placeholderTextColor={theme.muted}
              keyboardType="number-pad"
              returnKeyType="done"
              onSubmitEditing={() => canLogDir && handleLogDir()}
            />
            <TouchableOpacity
              style={[styles.logBtn, { borderColor: theme.accent, backgroundColor: canLogDir ? theme.accent : 'transparent', opacity: canLogDir ? 1 : 0.4 }]}
              onPress={handleLogDir}
              disabled={!canLogDir}
              activeOpacity={0.7}
            >
              <Text style={[styles.logBtnText, { color: canLogDir ? theme.background : theme.accent }]}>LOG POINT</Text>
            </TouchableOpacity>
          </View>

          {/* Points table */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.thDet, { color: theme.muted }]}>DETECTED</Text>
            <Text style={[styles.thTrue, { color: theme.muted }]}>TRUE</Text>
            <Text style={[styles.thOff, { color: theme.muted }]}>OFFSET</Text>
            <Text style={[styles.thDel, { color: theme.muted }]}> </Text>
          </View>
          <View style={[styles.tableDivider, { backgroundColor: theme.accentDim }]} />
          {dirCal.points.length === 0 ? (
            <Text style={[styles.empty, { color: theme.muted }]}>No points logged yet</Text>
          ) : (
            dirCal.points.map(p => (
              <View key={p.id} style={styles.dataRow}>
                <Text style={[styles.tdDet, { color: theme.textPrimary }]}>{p.detected}°</Text>
                <Text style={[styles.tdTrue, { color: theme.textPrimary }]}>{p.trueHeading}°</Text>
                <Text style={[styles.tdOff, { color: theme.accent }]}>{p.offset > 0 ? '+' : ''}{p.offset}°</Text>
                <TouchableOpacity onPress={() => dirCal.deletePoint(p.id)} style={styles.tdDel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={[styles.delX, { color: theme.muted }]}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}

          {/* Offset result */}
          <View style={[styles.fitBox, { borderColor: theme.accentDim }]}>
            <Text style={[styles.fitTitle, { color: theme.accent }]}>COMPASS OFFSET</Text>
            {dirCal.fit ? (
              <>
                <Text style={[styles.offsetBig, { color: theme.textPrimary }]}>
                  {dirCal.fit.meanOffset > 0 ? '+' : ''}{dirCal.fit.meanOffset}°
                </Text>
                <Text style={[styles.fitMeta, { color: theme.muted }]}>
                  add to detected headings   ·   n={dirCal.fit.n}   ±{dirCal.fit.spread}°
                  {dirCal.fit.spread > 20 ? '  ⚠ inconsistent' : dirCal.fit.spread <= 8 ? '  ✓ tight' : ''}
                </Text>
              </>
            ) : (
              <Text style={[styles.fitMeta, { color: theme.muted }]}>Need ≥2 points to estimate the offset.</Text>
            )}
          </View>

          {dirMic.error && <Text style={[styles.error, { color: theme.accent }]}>{dirMic.error}</Text>}

          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.accent }]} onPress={dirCal.exportCsv} disabled={dirCal.points.length === 0} activeOpacity={0.7}>
              <Text style={[styles.actionText, { color: theme.accent, opacity: dirCal.points.length === 0 ? 0.4 : 1 }]}>EXPORT CSV</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.muted }]} onPress={dirCal.clear} disabled={dirCal.points.length === 0} activeOpacity={0.7}>
              <Text style={[styles.actionText, { color: theme.muted, opacity: dirCal.points.length === 0 ? 0.4 : 1 }]}>CLEAR ALL</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: 18, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 4 },
  done: { fontSize: 12, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 2 },
  divider: { height: 1, opacity: 0.55, marginTop: 8, marginBottom: 12 },
  // Mode toggle
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  modeBtn: { flex: 1, paddingVertical: 9, borderWidth: 1.5, borderRadius: 4, alignItems: 'center' },
  modeBtnText: { fontSize: 12, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 2 },
  hint: { fontSize: 10, fontFamily: 'Courier', letterSpacing: 0.5, lineHeight: 15, marginBottom: 14 },
  // Live box
  liveBox: { borderWidth: 1, borderRadius: 6, padding: 14, marginBottom: 16 },
  liveMainRow: { flexDirection: 'row', alignItems: 'center' },
  liveCell: { flex: 1, alignItems: 'center' },
  liveDivider: { width: 1, height: 46 },
  liveLabel: { fontSize: 9, fontFamily: 'Courier', letterSpacing: 2, marginBottom: 4 },
  liveBig: { fontSize: 40, fontFamily: 'Courier', fontWeight: '900', letterSpacing: -1, lineHeight: 44 },
  liveMid: { fontSize: 30, fontFamily: 'Courier', fontWeight: '700', letterSpacing: -1, lineHeight: 40 },
  liveUnit: { fontSize: 9, fontFamily: 'Courier', letterSpacing: 2, marginTop: 2 },
  rangeText: { fontSize: 10, fontFamily: 'Courier', letterSpacing: 1, textAlign: 'center', marginTop: 8 },
  status: { fontSize: 10, fontFamily: 'Courier', letterSpacing: 1, textAlign: 'center', marginTop: 4 },
  // Radar / detected (direction)
  radarWrap: { alignItems: 'center', marginBottom: 10 },
  detectedRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 10, marginBottom: 14 },
  detLabel: { fontSize: 9, fontFamily: 'Courier', letterSpacing: 2 },
  detValue: { fontSize: 22, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 1 },
  // Entry
  entryRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  input: { flex: 1, borderWidth: 1, borderRadius: 4, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 1 },
  logBtn: { justifyContent: 'center', paddingHorizontal: 18, borderWidth: 2, borderRadius: 4 },
  logBtnText: { fontSize: 13, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 2 },
  // Table
  tableHeaderRow: { flexDirection: 'row', alignItems: 'center' },
  thKts: { width: 60, fontSize: 9, fontFamily: 'Courier', letterSpacing: 1 },
  thDb: { flex: 1, fontSize: 9, fontFamily: 'Courier', letterSpacing: 1 },
  thRange: { width: 70, fontSize: 9, fontFamily: 'Courier', letterSpacing: 1 },
  thDet: { width: 90, fontSize: 9, fontFamily: 'Courier', letterSpacing: 1 },
  thTrue: { flex: 1, fontSize: 9, fontFamily: 'Courier', letterSpacing: 1 },
  thOff: { width: 64, fontSize: 9, fontFamily: 'Courier', letterSpacing: 1 },
  thDel: { width: 24 },
  tableDivider: { height: 1, opacity: 0.4, marginTop: 4, marginBottom: 2 },
  empty: { fontSize: 11, fontFamily: 'Courier', letterSpacing: 1, textAlign: 'center', paddingVertical: 16 },
  dataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9 },
  tdKts: { width: 60, fontSize: 16, fontFamily: 'Courier', fontWeight: '700' },
  tdDb: { flex: 1, fontSize: 16, fontFamily: 'Courier', fontWeight: '700' },
  tdRange: { width: 70, fontSize: 11, fontFamily: 'Courier' },
  tdDet: { width: 90, fontSize: 16, fontFamily: 'Courier', fontWeight: '700' },
  tdTrue: { flex: 1, fontSize: 16, fontFamily: 'Courier', fontWeight: '700' },
  tdOff: { width: 64, fontSize: 16, fontFamily: 'Courier', fontWeight: '700' },
  tdDel: { width: 24, alignItems: 'flex-end' },
  delX: { fontSize: 14, fontFamily: 'Courier' },
  // Fit / offset
  fitBox: { borderWidth: 1, borderRadius: 6, padding: 14, marginTop: 18 },
  fitTitle: { fontSize: 11, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 3, marginBottom: 8 },
  fitLine: { fontSize: 14, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 1 },
  fitMeta: { fontSize: 11, fontFamily: 'Courier', letterSpacing: 1, marginTop: 4 },
  offsetBig: { fontSize: 40, fontFamily: 'Courier', fontWeight: '900', letterSpacing: -1 },
  fitCodeLabel: { fontSize: 9, fontFamily: 'Courier', letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  codeBox: { borderWidth: 1, borderRadius: 4, padding: 10 },
  code: { fontSize: 11, fontFamily: 'Courier', lineHeight: 16 },
  error: { fontSize: 12, fontFamily: 'Courier', letterSpacing: 1, marginTop: 12, textAlign: 'center' },
  // Actions
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  actionBtn: { flex: 1, paddingVertical: 12, borderWidth: 1, borderRadius: 4, alignItems: 'center' },
  actionText: { fontSize: 12, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 2 },
});
