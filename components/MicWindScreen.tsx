import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import Svg, { Circle, Path, Line, G } from 'react-native-svg';
import { Theme } from '../constants/colors';
import { useMicWind, BeaufortInfo } from '../hooks/useMicWind';

const { width: W } = Dimensions.get('window');
const GAUGE_R = W * 0.38;
const CX = W / 2;

const START_DEG = 210;
const SWEEP_DEG = 240;

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polarToXY(cx, cy, r, startDeg);
  const e = polarToXY(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

interface GaugeProps {
  beaufortFractional: number;
  isRecording: boolean;
  theme: Theme;
}

function WindGauge({ beaufortFractional, isRecording, theme }: GaugeProps) {
  const cy = GAUGE_R + 20;
  const fillDeg = Math.min(beaufortFractional / 8, 1) * SWEEP_DEG;
  const endDeg = START_DEG + fillDeg;
  const needlePt = polarToXY(CX, cy, GAUGE_R * 0.82, START_DEG + fillDeg);

  return (
    <Svg width={W} height={GAUGE_R * 2 + 40}>
      <Path
        d={describeArc(CX, cy, GAUGE_R, START_DEG, START_DEG + SWEEP_DEG)}
        stroke={theme.accentDim}
        strokeWidth={10}
        fill="none"
        strokeLinecap="round"
      />
      {fillDeg > 0 && (
        <Path
          d={describeArc(CX, cy, GAUGE_R, START_DEG, endDeg)}
          stroke={isRecording ? theme.accent : theme.accentDim}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {Array.from({ length: 9 }, (_, i) => {
        const deg = START_DEG + (i / 8) * SWEEP_DEG;
        const inner = polarToXY(CX, cy, GAUGE_R - 18, deg);
        const outer = polarToXY(CX, cy, GAUGE_R + 2, deg);
        return (
          <Path
            key={i}
            d={`M ${inner.x} ${inner.y} L ${outer.x} ${outer.y}`}
            stroke={i <= Math.round(beaufortFractional) && isRecording ? theme.accent : theme.accentDim}
            strokeWidth={i === Math.round(beaufortFractional) ? 2.5 : 1}
          />
        );
      })}
      {isRecording && beaufortFractional > 0 && (
        <Circle cx={needlePt.x} cy={needlePt.y} r={6} fill={theme.accent} />
      )}
      <Circle cx={CX} cy={cy} r={5} fill={theme.accentDim} />
    </Svg>
  );
}

function BeaufortBar({ beaufortFractional, isRecording, theme }: GaugeProps) {
  return (
    <View style={styles.bfBar}>
      {Array.from({ length: 9 }, (_, i) => {
        const active = isRecording && i <= beaufortFractional;
        const isCurrent = Math.round(beaufortFractional) === i;
        return (
          <View
            key={i}
            style={[
              styles.bfSegment,
              {
                backgroundColor: active ? theme.accent : theme.accentDim,
                opacity: isCurrent && isRecording ? 1 : active ? 0.7 : 0.25,
                height: 8 + i * 3,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

// Mini compass rose showing wind direction arrow
function CompassRose({ headingDeg, sweepDeg, theme }: { headingDeg: number | null; sweepDeg: number; theme: Theme }) {
  const SIZE = 100;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE * 0.42;

  // Sweep arc: show the range scanned (centred on detected heading or 0°)
  const sweepFraction = Math.min(sweepDeg / 180, 1);
  const hasDir = headingDeg !== null;

  // Arrow pointing to wind-from direction
  const arrowRad = headingDeg !== null ? ((headingDeg - 90) * Math.PI) / 180 : -Math.PI / 2;
  const arrowTip = { x: cx + r * 0.72 * Math.cos(arrowRad), y: cy + r * 0.72 * Math.sin(arrowRad) };
  const arrowBase = { x: cx - r * 0.4 * Math.cos(arrowRad), y: cy - r * 0.4 * Math.sin(arrowRad) };

  // Sweep arc centred on detected heading (or north if none)
  const sweepCenter = headingDeg ?? 0;
  const halfSweep = (sweepDeg / 2);
  const arcStart = sweepCenter - halfSweep;
  const arcEnd = sweepCenter + halfSweep;

  const cardinals = [
    { label: 'N', deg: 0 }, { label: 'E', deg: 90 },
    { label: 'S', deg: 180 }, { label: 'W', deg: 270 },
  ];

  return (
    <Svg width={SIZE} height={SIZE}>
      {/* Outer ring */}
      <Circle cx={cx} cy={cy} r={r} stroke={theme.accentDim} strokeWidth={1} fill="none" />

      {/* Sweep arc (how much the user has rotated) */}
      {sweepFraction > 0.05 && (
        <Path
          d={describeArc(cx, cy, r * 0.78, arcStart, arcEnd)}
          stroke={hasDir ? theme.accent : theme.muted}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          opacity={0.5}
        />
      )}

      {/* Cardinal tick marks */}
      {cardinals.map(({ label, deg }) => {
        const rad = ((deg - 90) * Math.PI) / 180;
        const outer = { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
        const inner = { x: cx + r * 0.82 * Math.cos(rad), y: cy + r * 0.82 * Math.sin(rad) };
        const textPos = { x: cx + r * 1.18 * Math.cos(rad), y: cy + r * 1.18 * Math.sin(rad) };
        return (
          <G key={label}>
            <Line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={theme.accentDim} strokeWidth={1.5} />
          </G>
        );
      })}

      {/* Wind direction arrow */}
      {hasDir && (
        <Path
          d={`M ${arrowBase.x} ${arrowBase.y} L ${arrowTip.x} ${arrowTip.y}`}
          stroke={theme.accent}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      )}

      {/* Center dot */}
      <Circle cx={cx} cy={cy} r={3} fill={hasDir ? theme.accent : theme.accentDim} />
    </Svg>
  );
}

// ── Pass indicator dots ───────────────────────────────────────────────────────

function PassDots({ count, needed, theme }: { count: number; needed: number; theme: Theme }) {
  return (
    <View style={styles.passDotsRow}>
      {Array.from({ length: needed }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.passDot,
            { backgroundColor: i < count ? theme.accent : theme.accentDim },
          ]}
        />
      ))}
    </View>
  );
}

// ── Result screen ─────────────────────────────────────────────────────────────

function ResultScreen({ result, theme, onReset }: { result: NonNullable<MicWindResult>; theme: Theme; onReset: () => void }) {
  const hdg = String(Math.round(result.heading)).padStart(3, '0');
  return (
    <View style={styles.resultContainer}>
      <Text style={[styles.resultDeg, { color: theme.accent }]}>{hdg}°</Text>
      <Text style={[styles.resultCard, { color: theme.accent }]}>{result.cardinal}</Text>
      <View style={[styles.resultDivider, { backgroundColor: theme.accentDim }]} />
      <Text style={[styles.resultKts, { color: theme.textPrimary }]}>{result.knots} KT</Text>
      <TouchableOpacity
        style={[styles.button, { borderColor: theme.accent, backgroundColor: 'transparent', marginTop: 48 }]}
        onPress={onReset}
        activeOpacity={0.7}
      >
        <Text style={[styles.buttonText, { color: theme.accent }]}>MEASURE AGAIN</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

interface MicWindResult {
  heading: number;
  cardinal: string;
  knots: number;
  beaufortInfo: BeaufortInfo;
}

interface Props {
  theme: Theme;
  height?: number;
}

export default function MicWindScreen({ theme, height }: Props) {
  const mic = useMicWind();

  useEffect(() => {
    return () => { mic.stop(); };
  }, []);

  const knotsText = mic.estimatedKnots !== null ? `${Math.round(mic.estimatedKnots)}` : '--';
  const hasDirection = mic.windHeadingDeg !== null;
  const PASSES_NEEDED = 3;

  if (mic.isComplete && mic.result) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background, width: W, height, transform: [{ rotate: '180deg' }] }]}
        contentContainerStyle={[styles.content, { justifyContent: 'center' }]}
      >
        <ResultScreen result={mic.result} theme={theme} onReset={() => { mic.reset(); }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background, width: W, height, transform: [{ rotate: '180deg' }] }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: theme.accent }]}>ANEMOMETER</Text>
      <View style={[styles.divider, { backgroundColor: theme.accent }]} />

      <WindGauge beaufortFractional={mic.beaufortFractional} isRecording={mic.isRecording} theme={theme} />

      <BeaufortBar beaufortFractional={mic.beaufortFractional} isRecording={mic.isRecording} theme={theme} />

      <View style={styles.bfLabelRow}>
        <Text style={[styles.bfLabelEdge, { color: theme.muted }]}>B0</Text>
        <Text style={[styles.bfLabelEdge, { color: theme.muted }]}>B8</Text>
      </View>

      {/* Speed readout */}
      <View style={styles.readout}>
        <Text style={[styles.speedValue, { color: mic.isRecording ? theme.textPrimary : theme.accentDim }]}>
          {knotsText}
        </Text>
        <Text style={[styles.speedUnit, { color: theme.muted }]}>KT</Text>
      </View>

      <View style={styles.beaufortLabelWrap}>
        <Text style={[styles.beaufortNumber, { color: theme.accent }]}>
          {mic.isRecording ? `B${mic.beaufortInfo.number}` : '--'}
        </Text>
        <Text style={[styles.beaufortLabel, { color: theme.textPrimary }]}>
          {mic.isRecording ? mic.beaufortInfo.label : 'NOT MEASURING'}
        </Text>
      </View>

      {/* ── Direction sweep section ── */}
      {mic.isRecording && (
        <View style={[styles.dirSection, { borderTopColor: theme.accentDim }]}>
          <Text style={[styles.dirTitle, { color: theme.accent }]}>WIND DIRECTION</Text>

          <View style={styles.dirBody}>
            <CompassRose headingDeg={mic.windHeadingDeg} sweepDeg={mic.sweepDeg} theme={theme} />

            <View style={styles.dirRight}>
              {hasDirection ? (
                <>
                  <Text style={[styles.dirCardinal, { color: theme.accent }]}>{mic.windCardinal}</Text>
                  <Text style={[styles.dirDeg, { color: theme.textPrimary }]}>
                    {Math.round(mic.windHeadingDeg!)}°
                  </Text>
                  <Text style={[styles.dirLabel, { color: theme.muted }]}>FROM</Text>
                </>
              ) : (
                <Text style={[styles.dirPrompt, { color: theme.muted }]}>
                  {mic.sweepDeg < 15
                    ? 'Slowly sweep\nphone across\nwind line'
                    : `Sweep: ${Math.round(mic.sweepDeg)}°\nKeep sweeping…`}
                </Text>
              )}
            </View>
          </View>

          {/* Pass counter */}
          {hasDirection && (
            <View style={styles.passRow}>
              <Text style={[styles.passLabel, { color: theme.muted }]}>
                {mic.passCount < PASSES_NEEDED
                  ? `PASS ${mic.passCount + 1} OF ${PASSES_NEEDED} — KEEP SWEEPING`
                  : 'LOCKING…'}
              </Text>
              <PassDots count={mic.passCount} needed={PASSES_NEEDED} theme={theme} />
            </View>
          )}
        </View>
      )}

      {mic.error && (
        <Text style={[styles.error, { color: theme.accent }]}>{mic.error}</Text>
      )}

      <TouchableOpacity
        style={[styles.button, { borderColor: theme.accent, backgroundColor: mic.isRecording ? theme.accent : 'transparent' }]}
        onPress={mic.isRecording ? mic.stop : mic.start}
        activeOpacity={0.7}
      >
        <Text style={[styles.buttonText, { color: mic.isRecording ? theme.background : theme.accent }]}>
          {mic.isRecording ? 'STOP' : 'RECORD'}
        </Text>
      </TouchableOpacity>

      {!mic.isRecording && (
        <Text style={[styles.hint, { color: theme.muted }]}>
          Hold phone upside-down · mic faces wind · sweep slowly side to side
        </Text>
      )}

      <Text style={[styles.disclaimer, { color: theme.accentDim }]}>
        Estimate only · accuracy varies by device and background noise
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 36, alignItems: 'center' },
  title: { fontSize: 18, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 4, alignSelf: 'flex-start', marginBottom: 8 },
  divider: { height: 1, opacity: 0.55, alignSelf: 'stretch', marginBottom: 14 },
  hint: { fontSize: 10, fontFamily: 'Courier', letterSpacing: 1, textAlign: 'center', marginBottom: 8 },
  bfBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 8, height: 40 },
  bfSegment: { width: 22, borderRadius: 2 },
  bfLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 4, marginBottom: 16, paddingHorizontal: 4 },
  bfLabelEdge: { fontSize: 9, fontFamily: 'Courier', letterSpacing: 1 },
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  speedValue: { fontSize: 72, fontFamily: 'Courier', fontWeight: '900', letterSpacing: -2, lineHeight: 80 },
  speedUnit: { fontSize: 22, fontFamily: 'Courier', fontWeight: '600', letterSpacing: 2, marginBottom: 4 },
  beaufortLabelWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 6 },
  beaufortNumber: { fontSize: 22, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 2 },
  beaufortLabel: { fontSize: 16, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 3 },
  description: { fontSize: 11, fontFamily: 'Courier', letterSpacing: 1, textAlign: 'center', marginTop: 6, marginBottom: 8 },
  // Direction section
  dirSection: { alignSelf: 'stretch', marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  dirTitle: { fontSize: 11, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 3, marginBottom: 12 },
  dirBody: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 14 },
  dirRight: { flex: 1 },
  dirCardinal: { fontSize: 36, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 2 },
  dirDeg: { fontSize: 20, fontFamily: 'Courier', fontWeight: '600', letterSpacing: 1, marginTop: 2 },
  dirLabel: { fontSize: 9, fontFamily: 'Courier', letterSpacing: 2, marginTop: 2 },
  dirPrompt: { fontSize: 11, fontFamily: 'Courier', letterSpacing: 1, lineHeight: 18 },
  sweepTrack: { height: 4, alignSelf: 'stretch', borderRadius: 2, overflow: 'hidden' },
  sweepFill: { height: '100%', borderRadius: 2 },
  sweepLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  sweepLabel: { fontSize: 9, fontFamily: 'Courier', letterSpacing: 1 },
  // Data rows
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.2)' },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.2)' },
  levelLabel: { fontSize: 10, fontFamily: 'Courier', letterSpacing: 2 },
  levelValue: { fontSize: 13, fontFamily: 'Courier', fontWeight: '600', letterSpacing: 1 },
  error: { fontSize: 12, fontFamily: 'Courier', letterSpacing: 1, marginTop: 10, textAlign: 'center' },
  button: { marginTop: 28, paddingVertical: 14, paddingHorizontal: 40, borderWidth: 2, borderRadius: 4 },
  buttonText: { fontSize: 15, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 4 },
  disclaimer: { fontSize: 9, fontFamily: 'Courier', letterSpacing: 1, textAlign: 'center', marginTop: 20 },
  // Pass dots
  passRow:       { alignItems: 'center', marginTop: 10, gap: 8 },
  passLabel:     { fontSize: 9, fontFamily: 'Courier', letterSpacing: 1.5, textAlign: 'center' },
  passDotsRow:   { flexDirection: 'row', gap: 10, marginTop: 4 },
  passDot:       { width: 12, height: 12, borderRadius: 6 },
  // Result screen
  resultContainer: { alignItems: 'center', paddingVertical: 40 },
  resultTitle:   { fontSize: 11, fontFamily: 'Courier', letterSpacing: 4, marginBottom: 12 },
  resultDeg:     { fontSize: 80, fontFamily: 'Courier', fontWeight: '900', letterSpacing: -2, lineHeight: 86 },
  resultCard:    { fontSize: 42, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 4, marginTop: 4 },
  resultDivider: { height: 1, width: 120, opacity: 0.4, marginVertical: 24 },
  resultKts:     { fontSize: 52, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 2 },
  resultBf:      { fontSize: 14, fontFamily: 'Courier', letterSpacing: 3, marginTop: 6 },
});
