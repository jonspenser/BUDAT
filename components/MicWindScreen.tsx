import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import Svg, { Circle, Path, Line, G, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Theme } from '../constants/colors';
import { headingToCardinal } from '../hooks/useMicWind';
import {
  WindMeter,
  msToKnots,
  knotsToMs,
  SweepUpdate,
  EstimateUpdate,
  HeadingUpdate,
  SweepGuidance,
} from '../modules/WindMeter';

const { width: W } = Dimensions.get('window');
const GAUGE_R = W * 0.38;
const CX = W / 2;

const START_DEG = 210;
const SWEEP_DEG = 240;

// Beaufort lower bounds in knots: B0..B8
const BF_KNOTS_MIN = [0, 1, 4, 7, 11, 17, 22, 28, 34];
const BF_LABELS = ['CALM', 'LIGHT AIR', 'LIGHT BREEZE', 'GENTLE', 'MODERATE', 'FRESH', 'STRONG', 'NEAR GALE', 'GALE'];

function knotsToBeaufortFractional(knots: number): number {
  if (knots <= 0) return 0;
  for (let i = 8; i >= 0; i--) {
    if (knots >= BF_KNOTS_MIN[i]) {
      if (i === 8) return 8;
      const lo = BF_KNOTS_MIN[i];
      const hi = BF_KNOTS_MIN[i + 1];
      return i + (knots - lo) / (hi - lo);
    }
  }
  return 0;
}

const GUIDANCE_LABEL: Record<SweepGuidance, string> = {
  keepSweeping: 'KEEP SWEEPING',
  rotateLeft: 'ROTATE LEFT',
  rotateRight: 'ROTATE RIGHT',
  hold: 'HOLD STEADY',
  locked: 'LOCKED',
  noLock: 'NO LOCK — TRY AGAIN',
};

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
  const compassR = GAUGE_R * 0.96;
  const tickOuterR = GAUGE_R * 0.96;
  const tickInnerR = GAUGE_R * 0.82;
  const labelR = GAUGE_R * 0.66;
  const fillDeg = Math.min(beaufortFractional / 8, 1) * SWEEP_DEG;
  const endDeg = START_DEG + fillDeg;
  const needlePt = polarToXY(CX, cy, GAUGE_R * 0.58, START_DEG + fillDeg);
  const compassLabels = [
    { label: 'N', deg: 0 },
    { label: 'NE', deg: 45 },
    { label: 'E', deg: 90 },
    { label: 'SE', deg: 135 },
    { label: 'S', deg: 180 },
    { label: 'SW', deg: 225 },
    { label: 'W', deg: 270 },
    { label: 'NW', deg: 315 },
  ];

  return (
    <Svg width={W} height={GAUGE_R * 2 + 40}>
      <Circle
        cx={CX}
        cy={cy}
        r={compassR}
        stroke={theme.accentDim}
        strokeWidth={1}
        fill="none"
        opacity={0.65}
      />
      {Array.from({ length: 16 }, (_, i) => {
        const deg = i * 22.5;
        const is45 = i % 2 === 0;
        const inner = polarToXY(CX, cy, is45 ? tickInnerR : GAUGE_R * 0.89, deg);
        const outer = polarToXY(CX, cy, tickOuterR, deg);
        return (
          <Line
            key={`compass-tick-${i}`}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke={is45 ? theme.accent : theme.accentDim}
            strokeWidth={is45 ? 2 : 1}
            opacity={is45 ? 0.9 : 0.45}
          />
        );
      })}
      {compassLabels.map(({ label, deg }) => {
        const pt = polarToXY(CX, cy, labelR, deg);
        return (
          <SvgText
            key={label}
            x={pt.x}
            y={pt.y + 4}
            fill={theme.muted}
            fontSize={label.length === 1 ? 13 : 10}
            fontWeight="700"
            textAnchor="middle"
          >
            {label}
          </SvgText>
        );
      })}
      <Path
        d={describeArc(CX, cy, GAUGE_R * 0.5, START_DEG, START_DEG + SWEEP_DEG)}
        stroke={theme.accentDim}
        strokeWidth={8}
        fill="none"
        strokeLinecap="round"
      />
      {fillDeg > 0 && (
        <Path
          d={describeArc(CX, cy, GAUGE_R * 0.5, START_DEG, endDeg)}
          stroke={isRecording ? theme.accent : theme.accentDim}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {Array.from({ length: 9 }, (_, i) => {
        const deg = START_DEG + (i / 8) * SWEEP_DEG;
        const inner = polarToXY(CX, cy, GAUGE_R * 0.5 - 13, deg);
        const outer = polarToXY(CX, cy, GAUGE_R * 0.5 + 3, deg);
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

// Mini compass rose showing wind direction arrow + live phone heading
function CompassRose({
  windDeg,
  phoneDeg,
  coverage,
  theme,
}: {
  windDeg: number | null;
  phoneDeg: number | null;
  coverage: number;
  theme: Theme;
}) {
  const SIZE = 100;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE * 0.42;

  const hasDir = windDeg !== null;
  const sweepDeg = Math.min(coverage, 1) * 180;

  // Arrow pointing to wind-from direction
  const arrowRad = windDeg !== null ? ((windDeg - 90) * Math.PI) / 180 : -Math.PI / 2;
  const arrowTip = { x: cx + r * 0.72 * Math.cos(arrowRad), y: cy + r * 0.72 * Math.sin(arrowRad) };
  const arrowBase = { x: cx - r * 0.4 * Math.cos(arrowRad), y: cy - r * 0.4 * Math.sin(arrowRad) };

  // Sweep arc centred on detected heading (or north if none)
  const sweepCenter = windDeg ?? 0;
  const halfSweep = sweepDeg / 2;
  const arcStart = sweepCenter - halfSweep;
  const arcEnd = sweepCenter + halfSweep;

  // Live phone heading tick on the outer ring
  const phoneTick =
    phoneDeg !== null
      ? {
          inner: polarToXY(cx, cy, r * 0.86, phoneDeg),
          outer: polarToXY(cx, cy, r * 1.06, phoneDeg),
        }
      : null;

  const cardinals = [
    { label: 'N', deg: 0 }, { label: 'E', deg: 90 },
    { label: 'S', deg: 180 }, { label: 'W', deg: 270 },
  ];

  return (
    <Svg width={SIZE} height={SIZE}>
      {/* Outer ring */}
      <Circle cx={cx} cy={cy} r={r} stroke={theme.accentDim} strokeWidth={1} fill="none" />

      {/* Sweep arc (how much the user has rotated) */}
      {sweepDeg > 10 && (
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
        return (
          <G key={label}>
            <Line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={theme.accentDim} strokeWidth={1.5} />
          </G>
        );
      })}

      {/* Live phone heading tick */}
      {phoneTick && (
        <Line
          x1={phoneTick.inner.x}
          y1={phoneTick.inner.y}
          x2={phoneTick.outer.x}
          y2={phoneTick.outer.y}
          stroke={theme.textPrimary}
          strokeWidth={2}
        />
      )}

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

// ── Result screen ─────────────────────────────────────────────────────────────

function ResultScreen({
  headingDeg,
  knots,
  theme,
  onReset,
  onCalibrate,
}: {
  headingDeg: number | null;
  knots: number | null;
  theme: Theme;
  onReset: () => void;
  onCalibrate: () => void;
}) {
  const hdg = headingDeg !== null ? String(Math.round(headingDeg)).padStart(3, '0') : '---';
  const cardinal = headingDeg !== null ? headingToCardinal(headingDeg) : '--';
  return (
    <View style={styles.resultContainer}>
      <Text style={[styles.resultDeg, { color: theme.accent }]}>{hdg}°</Text>
      <Text style={[styles.resultCard, { color: theme.accent }]}>{cardinal}</Text>
      <View style={[styles.resultDivider, { backgroundColor: theme.accentDim }]} />
      <Text style={[styles.resultKts, { color: theme.textPrimary }]}>
        {knots !== null ? Math.round(knots) : '--'} KT
      </Text>
      <TouchableOpacity
        style={[styles.button, { borderColor: theme.accent, backgroundColor: 'transparent', marginTop: 48 }]}
        onPress={onReset}
        activeOpacity={0.7}
      >
        <Text style={[styles.buttonText, { color: theme.accent }]}>MEASURE AGAIN</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary, { borderColor: theme.accentDim }]}
        onPress={onCalibrate}
        activeOpacity={0.7}
      >
        <Text style={[styles.buttonText, { color: theme.accentDim, fontSize: 12 }]}>CALIBRATE</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

type MeasureState = 'idle' | 'sweeping' | 'locked' | 'calibrating';

interface Props {
  theme: Theme;
  height?: number;
  active?: boolean;
}

export default function MicWindScreen({ theme, height, active = true }: Props) {
  const [measureState, setMeasureState] = useState<MeasureState>('idle');
  const [sweep, setSweep] = useState<SweepUpdate | null>(null);
  const [estimate, setEstimate] = useState<EstimateUpdate | null>(null);
  const [liveHeading, setLiveHeading] = useState<HeadingUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correctionInput, setCorrectionInput] = useState('');
  const [directionInput, setDirectionInput] = useState('');

  const trainingRef = useRef(false);
  const estimateRef = useRef<EstimateUpdate | null>(null);
  const sweepRef = useRef<SweepUpdate | null>(null);
  const subsRef = useRef<{ remove: () => void }[]>([]);

  const stopListeners = useCallback(() => {
    subsRef.current.forEach(s => s?.remove?.());
    subsRef.current = [];
  }, []);

  const stopMeasuring = useCallback(async () => {
    stopListeners();
    try { await WindMeter.stopMeasuring(); } catch {}
  }, [stopListeners]);

  const startMeasurement = useCallback(async (training: boolean) => {
    if (Platform.OS !== 'ios') {
      setError('iOS only');
      return;
    }
    trainingRef.current = training;
    setError(null);
    setSweep(null);
    setEstimate(null);
    setLiveHeading(null);
    estimateRef.current = null;
    sweepRef.current = null;
    setMeasureState('sweeping');

    const headingSub = WindMeter.onHeadingUpdate(update => setLiveHeading(update));
    const sweepSub = WindMeter.onSweepUpdate(update => {
      sweepRef.current = update;
      setSweep(update);
      if (update.isLocked) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (trainingRef.current) {
          const est = estimateRef.current;
          setCorrectionInput(est?.speedMS != null ? msToKnots(est.speedMS).toFixed(1) : '');
          setDirectionInput(
            update.lockedHeadingDegrees != null
              ? String(Math.round(update.lockedHeadingDegrees))
              : update.peakHeadingDegrees != null
                ? String(Math.round(update.peakHeadingDegrees))
                : ''
          );
          setMeasureState('calibrating');
        } else {
          setMeasureState('locked');
        }
      }
    });
    const estimateSub = WindMeter.onEstimateUpdate(update => {
      estimateRef.current = update;
      setEstimate(update);
    });
    const errorSub = WindMeter.onError(err => {
      setError(err?.message ?? 'Microphone error');
      setMeasureState('idle');
    });
    subsRef.current = [headingSub, sweepSub, estimateSub, errorSub].filter(Boolean) as { remove: () => void }[];

    try {
      await WindMeter.startMeasuring();
    } catch (e: any) {
      stopListeners();
      setMeasureState('idle');
      setError(e?.message ?? 'Could not start microphone');
    }
  }, [stopListeners]);

  const handleStop = useCallback(async () => {
    await stopMeasuring();
    trainingRef.current = false;
    setMeasureState('idle');
  }, [stopMeasuring]);

  const handleCalibrateFromResult = useCallback(() => {
    const est = estimateRef.current;
    const sw = sweepRef.current;
    setCorrectionInput(est?.speedMS != null ? msToKnots(est.speedMS).toFixed(1) : '');
    setDirectionInput(
      sw?.lockedHeadingDegrees != null
        ? String(Math.round(sw.lockedHeadingDegrees))
        : sw?.peakHeadingDegrees != null
          ? String(Math.round(sw.peakHeadingDegrees))
          : ''
    );
    setMeasureState('calibrating');
  }, []);

  const handleSubmitCorrection = useCallback(async () => {
    const val = parseFloat(correctionInput);
    if (isNaN(val) || val <= 0) {
      setError('Enter a valid wind speed');
      return;
    }
    const dir = directionInput.trim() ? parseFloat(directionInput) : null;
    if (dir !== null && (isNaN(dir) || dir < 0 || dir > 360)) {
      setError('Direction must be 0–360°');
      return;
    }
    setError(null);
    try {
      await WindMeter.submitCorrection(knotsToMs(val), 'knots', 'sustained', dir === 360 ? 0 : dir);
    } catch {}
    trainingRef.current = false;
    await stopMeasuring();
    setMeasureState('idle');
  }, [correctionInput, directionInput, stopMeasuring]);

  const handleCancelCalibrate = useCallback(async () => {
    trainingRef.current = false;
    await stopMeasuring();
    setMeasureState('idle');
  }, [stopMeasuring]);

  // Stop when the pager page is no longer active, and on unmount
  useEffect(() => {
    if (!active && measureState !== 'idle') {
      handleStop();
    }
  }, [active]);

  useEffect(() => {
    return () => {
      stopListeners();
      WindMeter.stopMeasuring().catch(() => {});
    };
  }, [stopListeners]);

  const isRecording = measureState === 'sweeping';
  const estimateKnots = estimate?.speedMS != null ? msToKnots(estimate.speedMS) : null;
  const beaufortFractional = estimateKnots !== null ? knotsToBeaufortFractional(estimateKnots) : 0;
  const bfIndex = Math.max(0, Math.min(8, Math.round(beaufortFractional)));
  const knotsText = isRecording && estimateKnots !== null ? `${Math.round(estimateKnots)}` : '--';
  const windDeg = sweep?.lockedHeadingDegrees ?? sweep?.peakHeadingDegrees ?? null;
  const phoneDeg = liveHeading?.headingDegrees ?? sweep?.currentHeadingDegrees ?? null;
  const lower = estimate?.lower95MS != null ? Math.round(msToKnots(estimate.lower95MS)) : null;
  const upper = estimate?.upper95MS != null ? Math.round(msToKnots(estimate.upper95MS)) : null;

  if (measureState === 'locked') {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background, width: W, height, transform: [{ rotate: '180deg' }] }]}
        contentContainerStyle={[styles.content, { justifyContent: 'center' }]}
      >
        <ResultScreen
          headingDeg={windDeg}
          knots={estimateKnots}
          theme={theme}
          onReset={() => { startMeasurement(false); }}
          onCalibrate={handleCalibrateFromResult}
        />
      </ScrollView>
    );
  }

  if (measureState === 'calibrating') {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background, width: W, height, transform: [{ rotate: '180deg' }] }]}
        contentContainerStyle={[styles.content, { justifyContent: 'center' }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.calLabel, { color: theme.muted }]}>APP GUESS</Text>
        <Text style={[styles.calGuess, { color: theme.textPrimary }]}>
          {estimateKnots !== null ? estimateKnots.toFixed(1) : '--'} KT · {windDeg !== null ? `${Math.round(windDeg)}°` : '--°'}
        </Text>

        <Text style={[styles.calLabel, { color: theme.muted, marginTop: 24 }]}>ACTUAL WIND SPEED (KT)</Text>
        <TextInput
          style={[styles.calInput, { color: theme.textPrimary, borderColor: theme.accentDim }]}
          value={correctionInput}
          onChangeText={setCorrectionInput}
          keyboardType="decimal-pad"
          placeholder="0.0"
          placeholderTextColor={theme.muted}
        />

        <Text style={[styles.calLabel, { color: theme.muted, marginTop: 16 }]}>ACTUAL DIRECTION (°)</Text>
        <TextInput
          style={[styles.calInput, { color: theme.textPrimary, borderColor: theme.accentDim }]}
          value={directionInput}
          onChangeText={setDirectionInput}
          keyboardType="number-pad"
          placeholder="0–360"
          placeholderTextColor={theme.muted}
        />

        {error && <Text style={[styles.error, { color: theme.accent }]}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, { borderColor: theme.accent, marginTop: 28 }]}
          onPress={handleSubmitCorrection}
          activeOpacity={0.7}
        >
          <Text style={[styles.buttonText, { color: theme.accent }]}>SUBMIT</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary, { borderColor: theme.accentDim }]}
          onPress={handleCancelCalibrate}
          activeOpacity={0.7}
        >
          <Text style={[styles.buttonText, { color: theme.accentDim, fontSize: 12 }]}>CANCEL</Text>
        </TouchableOpacity>
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

      <WindGauge beaufortFractional={beaufortFractional} isRecording={isRecording} theme={theme} />

      <BeaufortBar beaufortFractional={beaufortFractional} isRecording={isRecording} theme={theme} />

      <View style={styles.bfLabelRow}>
        <Text style={[styles.bfLabelEdge, { color: theme.muted }]}>B0</Text>
        <Text style={[styles.bfLabelEdge, { color: theme.muted }]}>B8</Text>
      </View>

      {/* Speed readout */}
      <View style={styles.readout}>
        <Text style={[styles.speedValue, { color: isRecording ? theme.textPrimary : theme.accentDim }]}>
          {knotsText}
        </Text>
        <Text style={[styles.speedUnit, { color: theme.muted }]}>KT</Text>
      </View>

      {isRecording && lower !== null && upper !== null && (
        <Text style={[styles.rangeText, { color: theme.muted }]}>{lower} – {upper} KT</Text>
      )}

      <View style={styles.beaufortLabelWrap}>
        <Text style={[styles.beaufortNumber, { color: theme.accent }]}>
          {isRecording ? `B${bfIndex}` : '--'}
        </Text>
        <Text style={[styles.beaufortLabel, { color: theme.textPrimary }]}>
          {isRecording ? BF_LABELS[bfIndex] : 'NOT MEASURING'}
        </Text>
      </View>

      {measureState === 'idle' && (
        <>
          <TouchableOpacity
            style={[styles.button, { borderColor: theme.accent, backgroundColor: 'transparent' }]}
            onPress={() => startMeasurement(false)}
            activeOpacity={0.7}
          >
            <Text style={[styles.buttonText, { color: theme.accent }]}>TAKE MEASUREMENT</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { borderColor: theme.accentDim }]}
            onPress={() => startMeasurement(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.buttonText, { color: theme.accentDim, fontSize: 12 }]}>CALIBRATE</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Direction sweep section ── */}
      {isRecording && (
        <View style={[styles.dirSection, { borderTopColor: theme.accentDim }]}>
          <Text style={[styles.dirTitle, { color: theme.accent }]}>WIND DIRECTION</Text>

          <View style={styles.dirBody}>
            <CompassRose windDeg={windDeg} phoneDeg={phoneDeg} coverage={sweep?.coverage ?? 0} theme={theme} />

            <View style={styles.dirRight}>
              {windDeg !== null ? (
                <>
                  <Text style={[styles.dirCardinal, { color: theme.accent }]}>{headingToCardinal(windDeg)}</Text>
                  <Text style={[styles.dirDeg, { color: theme.textPrimary }]}>
                    {Math.round(windDeg)}°
                  </Text>
                  <Text style={[styles.dirLabel, { color: theme.muted }]}>FROM</Text>
                </>
              ) : (
                <Text style={[styles.dirPrompt, { color: theme.muted }]}>
                  {GUIDANCE_LABEL[sweep?.guidance ?? 'keepSweeping']}
                </Text>
              )}
            </View>
          </View>

          <Text style={[styles.guidanceText, { color: theme.muted }]}>
            {GUIDANCE_LABEL[sweep?.guidance ?? 'keepSweeping']}
            {sweep && !sweep.isLocked ? ` · ${Math.round((sweep.coverage ?? 0) * 100)}%` : ''}
          </Text>

          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary, { borderColor: theme.accentDim, alignSelf: 'center' }]}
            onPress={handleStop}
            activeOpacity={0.7}
          >
            <Text style={[styles.buttonText, { color: theme.accentDim, fontSize: 12 }]}>STOP</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <Text style={[styles.error, { color: theme.accent }]}>{error}</Text>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 36, alignItems: 'center' },
  title: { fontSize: 18, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 4, alignSelf: 'flex-start', marginBottom: 8 },
  divider: { height: 1, opacity: 0.55, alignSelf: 'stretch', marginBottom: 14 },
  bfBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 8, height: 40 },
  bfSegment: { width: 22, borderRadius: 2 },
  bfLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 4, marginBottom: 16, paddingHorizontal: 4 },
  bfLabelEdge: { fontSize: 9, fontFamily: 'Courier', letterSpacing: 1 },
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  speedValue: { fontSize: 72, fontFamily: 'Courier', fontWeight: '900', letterSpacing: -2, lineHeight: 80 },
  speedUnit: { fontSize: 22, fontFamily: 'Courier', fontWeight: '600', letterSpacing: 2, marginBottom: 4 },
  rangeText: { fontSize: 11, fontFamily: 'Courier', letterSpacing: 2, marginTop: 2 },
  beaufortLabelWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 6 },
  beaufortNumber: { fontSize: 22, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 2 },
  beaufortLabel: { fontSize: 16, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 3 },
  // Direction section
  dirSection: { alignSelf: 'stretch', marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  dirTitle: { fontSize: 11, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 3, marginBottom: 12 },
  dirBody: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 14 },
  dirRight: { flex: 1 },
  dirCardinal: { fontSize: 36, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 2 },
  dirDeg: { fontSize: 20, fontFamily: 'Courier', fontWeight: '600', letterSpacing: 1, marginTop: 2 },
  dirLabel: { fontSize: 9, fontFamily: 'Courier', letterSpacing: 2, marginTop: 2 },
  dirPrompt: { fontSize: 11, fontFamily: 'Courier', letterSpacing: 1, lineHeight: 18 },
  guidanceText: { fontSize: 10, fontFamily: 'Courier', letterSpacing: 2, textAlign: 'center', marginBottom: 4 },
  error: { fontSize: 12, fontFamily: 'Courier', letterSpacing: 1, marginTop: 10, textAlign: 'center' },
  button: { marginTop: 28, paddingVertical: 14, paddingHorizontal: 40, borderWidth: 2, borderRadius: 4 },
  buttonSecondary: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 28, borderWidth: 1 },
  buttonText: { fontSize: 15, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 4 },
  // Calibration form
  calLabel: { fontSize: 10, fontFamily: 'Courier', letterSpacing: 3 },
  calGuess: { fontSize: 24, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 1, marginTop: 6 },
  calInput: {
    fontSize: 28,
    fontFamily: 'Courier',
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 6,
    minWidth: 160,
    textAlign: 'center',
  },
  // Result screen
  resultContainer: { alignItems: 'center', paddingVertical: 40 },
  resultDeg: { fontSize: 80, fontFamily: 'Courier', fontWeight: '900', letterSpacing: -2, lineHeight: 86 },
  resultCard: { fontSize: 42, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 4, marginTop: 4 },
  resultDivider: { height: 1, width: 120, opacity: 0.4, marginVertical: 24 },
  resultKts: { fontSize: 52, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 2 },
});
