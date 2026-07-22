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
  Switch,
} from 'react-native';
import Svg, { Circle, Path, Line, G, Text as SvgText } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Theme } from '../constants/colors';
import { headingToCardinal } from '../hooks/useMicWind';
import { saveWindReading, useWindReadings } from '../hooks/useWindReadings';
import {
  WindMeter,
  msToKnots,
  SweepUpdate,
  EstimateUpdate,
  HeadingUpdate,
  SweepGuidance,
} from '../modules/WindMeter';

const { width: W } = Dimensions.get('window');
const GAUGE_R = W * 0.26;
const CX = W / 2;

const START_DEG = 210;
const SWEEP_DEG = 240;

// Beaufort lower bounds in knots: B0..B8

// Immediate visual fallback while the native estimator gathers its first
// clean multi-second window. This moves the main gauge from live mic energy;
// the calibrated speed estimate replaces it as soon as one is available.
function dbToBeaufortFractional(db: number | null): number {
  if (db === null) return 0;
  const breakpoints: [number, number][] = [
    [-60, 0], [-45, 1], [-36, 2], [-29, 3], [-22, 4],
    [-15, 5], [-9, 6], [-4, 7], [0, 8],
  ];
  if (db <= breakpoints[0][0]) return 0;
  if (db >= breakpoints[breakpoints.length - 1][0]) return 8;
  for (let i = 1; i < breakpoints.length; i += 1) {
    const [db0, b0] = breakpoints[i - 1];
    const [db1, b1] = breakpoints[i];
    if (db <= db1) return b0 + ((db - db0) / (db1 - db0)) * (b1 - b0);
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

// ── Guided sweep ──────────────────────────────────────────────────────────────
// Aim at the wind (audio level peaks), then make a single short sweep across
// both shoulders of that peak to find direction. A ±35° arc is enough to
// reveal the local audio hill without forcing the user through a quarter
// turn in each direction. Once the pan finds the peak, the user re-aims at
// it and holds steady so clean windows keep accumulating for the speed/gust
// estimate instead of stopping the instant direction is known.
const AIM_DURATION_MS = 4000;
const PAN_TARGET_DEG = 35;
const PAN_GRAPH_DEG = 45;
const HOLD_DURATION_MS = 7000;

type GuidePhase = 'aim' | 'left' | 'right' | 'hold' | 'refine' | 'complete';

/** Signed shortest rotation from `a` to `b`, in (-180, 180]. */
function angleDelta(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Strongest audio-level bin from a completed pan, as an absolute heading. */
function peakHeadingFromPanSamples(samples: PanLevelSample[], center: number | null): number | null {
  if (center === null || samples.length === 0) return null;
  const peak = samples.reduce((best, s) => s.db > best.db ? s : best, samples[0]);
  return (center + peak.angle + 360) % 360;
}

function fmtArchiveTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const mn = String(d.getMinutes()).padStart(2, '0');
  const h12 = h % 12 || 12;
  return `${d.getMonth() + 1}/${d.getDate()} ${h12}:${mn}${h >= 12 ? 'p' : 'a'}`;
}

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
  phoneDeg?: number | null;
}

function WindGauge({ beaufortFractional, isRecording, theme, phoneDeg = null }: GaugeProps) {
  const cy = GAUGE_R + 20;
  const compassR = GAUGE_R * 0.96;
  const tickOuterR = GAUGE_R * 0.96;
  const tickInnerR = GAUGE_R * 0.82;
  const labelR = GAUGE_R * 0.66;
  const fillDeg = Math.min(beaufortFractional / 8, 1) * SWEEP_DEG;
  const endDeg = START_DEG + fillDeg;
  const needlePt = polarToXY(CX, cy, GAUGE_R * 0.58, START_DEG + fillDeg);
  const headingInner = polarToXY(CX, cy, GAUGE_R * 0.76, 0);
  const headingOuter = polarToXY(CX, cy, GAUGE_R * 1.02, 0);
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
      {/* The entire MIC screen is displayed 180° for bottom-microphone-first
          use, so compensate the compass card to keep N pointing north. */}
      <G rotation={isRecording && phoneDeg !== null ? 180 - phoneDeg : 0} origin={`${CX}, ${cy}`}>
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
      </G>
      {isRecording && phoneDeg !== null && (
        <G>
          <Line
            x1={headingInner.x}
            y1={headingInner.y}
            x2={headingOuter.x}
            y2={headingOuter.y}
            stroke={theme.textPrimary}
            strokeWidth={4}
            strokeLinecap="round"
          />
          <Circle cx={headingOuter.x} cy={headingOuter.y} r={5} fill={theme.textPrimary} />
        </G>
      )}
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
      {Array.from({ length: 8 }, (_, index) => {
        const i = index + 1;
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

type PanLevelSample = { angle: number; db: number };
/** A past pan's samples, re-anchored to absolute heading so it can be
 * re-projected onto a later pan's (possibly re-aimed) graph axis. */
type HistoricalPanSample = { heading: number; db: number };
/** How many completed pans to keep drawn behind the live curve. */
const PAN_HISTORY_LIMIT = 4;

function smoothedPath(points: { x: number; y: number }[], bottom: number): { curve: string; fill: string } {
  if (points.length < 2) return { curve: '', fill: '' };
  let curve = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const midX = (previous.x + current.x) / 2;
    const midY = (previous.y + current.y) / 2;
    curve += ` Q ${previous.x} ${previous.y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  curve += ` T ${last.x} ${last.y}`;
  const fill = `${curve} L ${points[points.length - 1].x} ${bottom} L ${points[0].x} ${bottom} Z`;
  return { curve, fill };
}

function PanLevelCurve({
  samples,
  history,
  centerHeading,
  theme,
}: {
  samples: PanLevelSample[];
  history: HistoricalPanSample[][];
  centerHeading: number | null;
  theme: Theme;
}) {
  const width = W - 36;
  const height = 94;
  const padX = 12;
  const top = 10;
  const bottom = height - 20;

  const xFor = (angle: number) => padX + ((angle + PAN_GRAPH_DEG) / (PAN_GRAPH_DEG * 2)) * (width - padX * 2);
  const yFor = (db: number) => bottom - Math.min(1, Math.max(0, (db + 60) / 60)) * (bottom - top);

  const ordered = [...samples].sort((a, b) => a.angle - b.angle);
  const points = ordered.map(sample => ({ x: xFor(sample.angle), y: yFor(sample.db) }));
  const { curve, fill } = smoothedPath(points, bottom);
  const peak = points.length ? points.reduce((best, point) => point.y < best.y ? point : best, points[0]) : null;

  // Older pans re-projected onto the current aim so a consistent wind
  // direction shows up as overlapping peaks even if the user re-aimed
  // slightly differently between attempts; drawn faintest-first so the
  // most recent history line sits just under the live curve.
  const historyPaths = centerHeading === null ? [] : history.map(pan => {
    const projected = pan
      .map(sample => ({ angle: angleDelta(centerHeading, sample.heading), db: sample.db }))
      .filter(sample => Math.abs(sample.angle) <= PAN_GRAPH_DEG)
      .sort((a, b) => a.angle - b.angle);
    const pts = projected.map(sample => ({ x: xFor(sample.angle), y: yFor(sample.db) }));
    return smoothedPath(pts, bottom).curve;
  });

  const directionTicks = [-40, -20, 0, 20, 40].map(offset => {
    const heading = centerHeading === null ? null : (centerHeading + offset + 360) % 360;
    return {
      x: xFor(offset),
      label: heading === null ? '--' : headingToCardinal(heading),
      degrees: heading === null ? '' : `${Math.round(heading)}°`,
    };
  });

  return (
    <View style={styles.panGraphWrap}>
      <Text style={[styles.panGraphTitle, { color: theme.muted }]}>AUDIO LEVEL BY DIRECTION</Text>
      <Svg width={width} height={height}>
        <Line x1={padX} y1={bottom} x2={width - padX} y2={bottom} stroke={theme.accentDim} strokeWidth={1} />
        <Line x1={width / 2} y1={top} x2={width / 2} y2={bottom} stroke={theme.accentDim} strokeWidth={1} opacity={0.35} />
        {historyPaths.map((d, index) => d !== '' && (
          <Path
            key={index}
            d={d}
            stroke={theme.muted}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            opacity={0.15 + 0.15 * index}
          />
        ))}
        {fill !== '' && <Path d={fill} fill={theme.accent} opacity={0.12} />}
        {curve !== '' && <Path d={curve} stroke={theme.accent} strokeWidth={3} fill="none" strokeLinecap="round" />}
        {peak && <Circle cx={peak.x} cy={peak.y} r={4} fill={theme.textPrimary} />}
        {directionTicks.map((tick, index) => (
          <G key={index}>
            <Line x1={tick.x} y1={bottom} x2={tick.x} y2={bottom + 4} stroke={theme.accentDim} strokeWidth={1} />
            <SvgText x={tick.x} y={height - 10} fill={theme.muted} fontSize={8} fontWeight="700" textAnchor="middle">
              {tick.label}
            </SvgText>
            <SvgText x={tick.x} y={height - 1} fill={theme.muted} fontSize={7} textAnchor="middle">
              {tick.degrees}
            </SvgText>
          </G>
        ))}
      </Svg>
    </View>
  );
}

// ── Result screen ─────────────────────────────────────────────────────────────

function ResultScreen({
  headingDeg,
  knots,
  gustKnots,
  theme,
  onReset,
  onCalibrate,
}: {
  headingDeg: number | null;
  knots: number | null;
  gustKnots: number | null;
  theme: Theme;
  onReset: () => void;
  onCalibrate: () => void;
}) {
  const hdg = headingDeg !== null ? String(Math.round(headingDeg)).padStart(3, '0') : '---';
  const cardinal = headingDeg !== null ? headingToCardinal(headingDeg) : '--';
  const showGust = gustKnots !== null && knots !== null && Math.round(gustKnots) > Math.round(knots);
  return (
    <View style={styles.resultContainer}>
      <Text style={[styles.resultDeg, { color: theme.accent }]}>{hdg}°</Text>
      <Text style={[styles.resultCard, { color: theme.accent }]}>{cardinal}</Text>
      <View style={[styles.resultDivider, { backgroundColor: theme.accentDim }]} />
      <Text style={[styles.resultKts, { color: theme.textPrimary }]}>
        {knots !== null ? Math.round(knots) : '--'} KT
      </Text>
      {showGust && (
        <Text style={[styles.gustText, { color: theme.muted }]}>GUSTS {Math.round(gustKnots!)} KT</Text>
      )}
      <Text style={[styles.savedNote, { color: theme.muted }]}>✓ SAVED TO READINGS ARCHIVE</Text>
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
  const [panMsg, setPanMsg] = useState<string | null>(null);
  const [levelDb, setLevelDb] = useState<number | null>(null);
  const [panLevelSamples, setPanLevelSamples] = useState<PanLevelSample[]>([]);
  const [panHistory, setPanHistory] = useState<HistoricalPanSample[][]>([]);
  const [panComplete, setPanComplete] = useState(false);
  const [gustKnots, setGustKnots] = useState<number | null>(null);
  const [archiveTick, setArchiveTick] = useState(0);
  const readings = useWindReadings(archiveTick);

  const trainingRef = useRef(false);
  const estimateRef = useRef<EstimateUpdate | null>(null);
  const sweepRef = useRef<SweepUpdate | null>(null);
  const panLevelSamplesRef = useRef<PanLevelSample[]>([]);
  const subsRef = useRef<{ remove: () => void }[]>([]);
  const savedRef = useRef(false);
  // Guided-sweep state
  const guidePhaseRef = useRef<GuidePhase>('aim');
  const centerHeadingRef = useRef<number | null>(null);
  const latestHeadingRef = useRef<number | null>(null);
  const aimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hold-to-refine: after the one pan finds direction, the user re-aims at
  // the peak and holds so the estimator keeps accumulating clean windows.
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStartRef = useRef(0);
  const holdHeadingRef = useRef<number | null>(null);
  // speedMS observations seen while holding steady — max of these is the
  // "gust" proxy (peak-of-window), separate from the sustained estimate.
  const gustSamplesRef = useRef<number[]>([]);

  const clearAimTimer = useCallback(() => {
    if (aimTimerRef.current) {
      clearTimeout(aimTimerRef.current);
      aimTimerRef.current = null;
    }
  }, []);

  const clearHoldTimer = useCallback(() => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);

  const beginHold = useCallback(() => {
    const heading = peakHeadingFromPanSamples(panLevelSamplesRef.current, centerHeadingRef.current);
    holdHeadingRef.current = heading;
    gustSamplesRef.current = [];
    holdStartRef.current = Date.now();
    guidePhaseRef.current = 'hold';
    const cardinal = heading !== null ? headingToCardinal(heading) : '--';
    const degText = heading !== null ? `${Math.round(heading)}°` : '';
    const label = () => `HOLD STEADY — AIM AT ${cardinal} ${degText} · ${Math.max(0, Math.ceil((HOLD_DURATION_MS - (Date.now() - holdStartRef.current)) / 1000))}s`;
    setPanMsg(label());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    clearHoldTimer();
    holdIntervalRef.current = setInterval(() => {
      if (Date.now() - holdStartRef.current >= HOLD_DURATION_MS) {
        clearHoldTimer();
        guidePhaseRef.current = 'complete';
        setPanMsg('HOLD COMPLETE — ANALYZING');
        setPanComplete(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        return;
      }
      setPanMsg(label());
    }, 250);
  }, [clearHoldTimer]);

  const handleHeading = useCallback((headingDeg: number) => {
    latestHeadingRef.current = headingDeg;
    const center = centerHeadingRef.current;
    if (center === null) return;
    const delta = angleDelta(center, headingDeg);

    if (guidePhaseRef.current === 'left' && delta <= -PAN_TARGET_DEG) {
      guidePhaseRef.current = 'right';
      setPanMsg('STOP — NOW PAN RIGHT SLOWLY');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    } else if (guidePhaseRef.current === 'right' && delta >= PAN_TARGET_DEG) {
      beginHold();
    }
  }, [beginHold]);

  const stopListeners = useCallback(() => {
    subsRef.current.forEach(s => s?.remove?.());
    subsRef.current = [];
  }, []);

  const stopMeasuring = useCallback(async () => {
    clearAimTimer();
    clearHoldTimer();
    stopListeners();
    try { await WindMeter.stopMeasuring(); } catch {}
  }, [stopListeners, clearAimTimer, clearHoldTimer]);

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
    savedRef.current = false;
    // Fold the just-finished pan into the overlay history before resetting —
    // a real wind direction shows up as peaks that keep landing in the same
    // place across attempts, while noise scatters.
    const finishedCenter = centerHeadingRef.current;
    const finishedSamples = panLevelSamplesRef.current;
    if (finishedCenter !== null && finishedSamples.length >= 3) {
      const historical: HistoricalPanSample[] = finishedSamples.map(sample => ({
        heading: (finishedCenter + sample.angle + 360) % 360,
        db: sample.db,
      }));
      setPanHistory(previous => [...previous, historical].slice(-PAN_HISTORY_LIMIT));
    }
    // Guided sweep: aim first, then the ±90° arc
    guidePhaseRef.current = 'aim';
    centerHeadingRef.current = null;
    setLevelDb(null);
    setPanLevelSamples([]);
    panLevelSamplesRef.current = [];
    setPanComplete(false);
    setGustKnots(null);
    gustSamplesRef.current = [];
    holdHeadingRef.current = null;
    setPanMsg('POINT TOWARD THE WIND — LEVEL PEAKS WHEN AIMED');
    clearAimTimer();
    clearHoldTimer();
    aimTimerRef.current = setTimeout(() => {
      centerHeadingRef.current = latestHeadingRef.current ?? 0;
      guidePhaseRef.current = 'left';
      setPanMsg('PAN LEFT A LITTLE');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, AIM_DURATION_MS);
    setMeasureState('sweeping');

    const headingSub = WindMeter.onHeadingUpdate(update => {
      setLiveHeading(update);
      handleHeading(update.headingDegrees);
    });
    const sweepSub = WindMeter.onSweepUpdate(update => {
      sweepRef.current = update;
      setSweep(update);
      if (typeof update.levelDb === 'number') {
        setLevelDb(update.levelDb);
        const center = centerHeadingRef.current;
        const heading = update.currentHeadingDegrees;
        if (center !== null && typeof heading === 'number') {
          const angle = Math.max(-PAN_GRAPH_DEG, Math.min(PAN_GRAPH_DEG, angleDelta(center, heading)));
          const binAngle = Math.round(angle / 5) * 5;
          setPanLevelSamples(previous => {
            const existing = previous.find(sample => sample.angle === binAngle);
            const nextDb = existing ? existing.db * 0.65 + update.levelDb! * 0.35 : update.levelDb!;
            const next = [...previous.filter(sample => sample.angle !== binAngle), { angle: binAngle, db: nextDb }];
            panLevelSamplesRef.current = next;
            return next;
          });
        }
      }
      // Native analysis may identify a peak early, but the guided workflow
      // intentionally waits for the complete left-to-right pan cycle.
      if (update.isLocked && guidePhaseRef.current === 'refine') {
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
          // Enough data — archive the reading and show the result
          if (!savedRef.current) {
            savedRef.current = true;
            const est = estimateRef.current;
            const hdg = update.lockedHeadingDegrees ?? update.peakHeadingDegrees ?? null;
            saveWindReading({
              timestamp: new Date().toISOString(),
              knots: est?.speedMS != null ? Math.round(msToKnots(est.speedMS) * 10) / 10 : null,
              gustKnots: null,
              headingDeg: hdg,
              cardinal: hdg != null ? headingToCardinal(hdg) : null,
            }).then(() => setArchiveTick(t => t + 1));
          }
          setMeasureState('locked');
        }
      }
    });
    const estimateSub = WindMeter.onEstimateUpdate(update => {
      estimateRef.current = update;
      setEstimate(update);
      if (guidePhaseRef.current === 'hold' && typeof update.speedMS === 'number') {
        gustSamplesRef.current.push(update.speedMS);
      }
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
  }, [stopListeners, clearAimTimer, clearHoldTimer, handleHeading]);

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
      // Raw knots as entered — the native layer converts and records the unit
      await WindMeter.submitCorrection(val, 'knots', 'sustained', dir === 360 ? 0 : dir);
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
      clearAimTimer();
      clearHoldTimer();
      stopListeners();
      WindMeter.stopMeasuring().catch(() => {});
    };
  }, [stopListeners, clearAimTimer, clearHoldTimer]);

  // A completed pan + hold is a full measurement. Freeze capture immediately,
  // choose the strongest audio direction, derive sustained/gust speed, save
  // it, and show the locked result.
  useEffect(() => {
    if (!panComplete || measureState !== 'sweeping') return;

    const heading = peakHeadingFromPanSamples(panLevelSamplesRef.current, centerHeadingRef.current)
      ?? holdHeadingRef.current
      ?? sweepRef.current?.peakHeadingDegrees
      ?? null;
    const current = sweepRef.current;
    const locked: SweepUpdate = {
      guidance: 'locked',
      isLocked: true,
      coverage: current?.coverage ?? 1,
      lobeClassification: current?.lobeClassification ?? 'clean',
      currentHeadingDegrees: latestHeadingRef.current ?? undefined,
      peakHeadingDegrees: heading ?? undefined,
      lockedHeadingDegrees: heading ?? undefined,
      levelDb: levelDb ?? undefined,
    };
    sweepRef.current = locked;
    setSweep(locked);

    const est = estimateRef.current;
    const sustainedKnots = est?.speedMS != null ? Math.round(msToKnots(est.speedMS) * 10) / 10 : null;
    // Gust proxy: peak of the speed estimates seen while holding steady on
    // the wind, floored at the sustained figure so it never reads lower.
    const gustPeakMS = gustSamplesRef.current.length ? Math.max(...gustSamplesRef.current) : null;
    const gustPeakKnots = gustPeakMS != null ? Math.round(msToKnots(gustPeakMS) * 10) / 10 : null;
    const finalGustKnots = gustPeakKnots != null && sustainedKnots != null
      ? Math.max(gustPeakKnots, sustainedKnots)
      : gustPeakKnots;
    setGustKnots(finalGustKnots);

    if (!savedRef.current) {
      savedRef.current = true;
      saveWindReading({
        timestamp: new Date().toISOString(),
        knots: sustainedKnots,
        gustKnots: finalGustKnots,
        headingDeg: heading,
        cardinal: heading != null ? headingToCardinal(heading) : null,
      }).then(() => setArchiveTick(t => t + 1));
    }

    stopMeasuring().finally(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (trainingRef.current) {
        setCorrectionInput(sustainedKnots != null ? sustainedKnots.toFixed(1) : '');
        setDirectionInput(heading != null ? String(Math.round(heading)) : '');
        setMeasureState('calibrating');
      } else {
        setMeasureState('locked');
      }
    });
  }, [panComplete, measureState, levelDb, stopMeasuring]);

  const isRecording = measureState === 'sweeping';
  const estimateKnots = estimate?.speedMS != null ? msToKnots(estimate.speedMS) : null;
  // The Beaufort visual doubles as the live mic meter. Keep the B-scale
  // presentation, but always drive its motion from immediate microphone data.
  const beaufortFractional = dbToBeaufortFractional(levelDb);
  const knotsText = isRecording && estimateKnots !== null ? `${Math.round(estimateKnots)}` : '--';
  const windDeg = sweep?.lockedHeadingDegrees ?? sweep?.peakHeadingDegrees ?? null;
  const phoneDeg = liveHeading?.headingDegrees ?? sweep?.currentHeadingDegrees ?? null;
  const lower = estimate?.lower95MS != null ? Math.round(msToKnots(estimate.lower95MS)) : null;
  const upper = estimate?.upper95MS != null ? Math.round(msToKnots(estimate.upper95MS)) : null;
  const panLeftActive = guidePhaseRef.current === 'left' ||
    (guidePhaseRef.current === 'refine' && sweep?.guidance === 'rotateLeft');
  const panRightActive = guidePhaseRef.current === 'right' ||
    (guidePhaseRef.current === 'refine' && sweep?.guidance === 'rotateRight');

  if (measureState === 'locked') {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background, width: W, height, transform: [{ rotate: '180deg' }] }]}
        contentContainerStyle={[styles.content, { justifyContent: 'center' }]}
      >
        <ResultScreen
          headingDeg={windDeg}
          knots={estimateKnots}
          gustKnots={gustKnots}
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
      {/* Dim everything except the switch while off */}
      <View style={[styles.dimWrap, !isRecording && styles.dimmed]}>
        <Text style={[styles.title, { color: theme.accent }]}>ANEMOMETER</Text>
        <View style={[styles.divider, { backgroundColor: theme.accent }]} />

        <WindGauge
          beaufortFractional={beaufortFractional}
          isRecording={isRecording}
          theme={theme}
          phoneDeg={phoneDeg}
        />

        <BeaufortBar beaufortFractional={beaufortFractional} isRecording={isRecording} theme={theme} />

        <View style={styles.bfLabelRow}>
          <Text style={[styles.bfLabelEdge, { color: theme.muted }]}>B1</Text>
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

      </View>

      {/* Measure on/off switch */}
      <View style={styles.switchRow}>
        <Text style={[styles.switchLabel, { color: isRecording ? theme.accent : theme.muted }]}>
          {isRecording ? 'MEASURING' : 'MEASURE'}
        </Text>
        <Switch
          value={isRecording}
          onValueChange={v => { v ? startMeasurement(false) : handleStop(); }}
          trackColor={{ false: theme.accentDim, true: theme.accent }}
          ios_backgroundColor={theme.accentDim}
        />
      </View>

      {measureState === 'idle' && (
        <TouchableOpacity
          style={[styles.button, styles.buttonSecondary, { borderColor: theme.accent }]}
          onPress={() => startMeasurement(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.buttonText, { color: theme.accent, fontSize: 12 }]}>CALIBRATE</Text>
        </TouchableOpacity>
      )}

      {/* ── Direction sweep section ── */}
      {isRecording && (
        <View style={[styles.dirSection, { borderTopColor: theme.accentDim }]}>
          <View style={styles.dirHeader}>
            <Text style={[styles.dirTitle, { color: theme.accent }]}>WIND DIRECTION</Text>
            <Text style={[styles.liveHeading, { color: theme.textPrimary }]}>
              {phoneDeg !== null ? `${headingToCardinal(phoneDeg)} ${Math.round(phoneDeg)}°` : '--°'}
            </Text>
          </View>

          <View style={styles.panArrows} accessibilityLabel={panLeftActive ? 'Pan left' : panRightActive ? 'Pan right' : 'Hold'}>
            <View
              style={[
                styles.panArrowBox,
                { borderColor: panLeftActive ? theme.accent : theme.accentDim },
                panLeftActive && styles.panArrowLit,
              ]}
            >
              <Text style={[styles.panArrow, { color: panLeftActive ? theme.accent : theme.accentDim }]}>←</Text>
              <Text style={[styles.panArrowLabel, { color: panLeftActive ? theme.accent : theme.muted }]}>LEFT</Text>
            </View>
            <View
              style={[
                styles.panArrowBox,
                { borderColor: panRightActive ? theme.accent : theme.accentDim },
                panRightActive && styles.panArrowLit,
              ]}
            >
              <Text style={[styles.panArrow, { color: panRightActive ? theme.accent : theme.accentDim }]}>→</Text>
              <Text style={[styles.panArrowLabel, { color: panRightActive ? theme.accent : theme.muted }]}>RIGHT</Text>
            </View>
          </View>

          <PanLevelCurve
            samples={panLevelSamples}
            history={panHistory}
            centerHeading={centerHeadingRef.current}
            theme={theme}
          />

          <Text style={[styles.guidanceText, { color: theme.accent }]}>
            {panMsg ?? GUIDANCE_LABEL[sweep?.guidance ?? 'keepSweeping']}
            {sweep && !sweep.isLocked && guidePhaseRef.current !== 'hold'
              ? ` · ${Math.round((sweep.coverage ?? 0) * 100)}%` : ''}
          </Text>
        </View>
      )}

      {error && (
        <Text style={[styles.error, { color: theme.accent }]}>{error}</Text>
      )}

      {/* Readings archive */}
      {measureState === 'idle' && readings.length > 0 && (
        <View style={[styles.archiveSection, styles.dimmed, { borderTopColor: theme.accentDim }]}>
          <Text style={[styles.archiveTitle, { color: theme.accent }]}>READINGS ARCHIVE</Text>
          {readings.slice(0, 5).map(r => (
            <View key={r.id} style={styles.archiveRow}>
              <Text style={[styles.archiveTime, { color: theme.muted }]}>{fmtArchiveTime(r.timestamp)}</Text>
              <Text style={[styles.archiveVal, { color: theme.textPrimary }]}>
                {r.knots != null ? `${Math.round(r.knots)}KT` : '--'}
                {r.gustKnots != null && Math.round(r.gustKnots) > Math.round(r.knots ?? 0)
                  ? ` G${Math.round(r.gustKnots)}` : ''}
              </Text>
              <Text style={[styles.archiveVal, { color: theme.textPrimary }]}>
                {r.cardinal ?? '--'}{r.headingDeg != null ? ` ${Math.round(r.headingDeg)}°` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 10, alignItems: 'center' },
  title: { fontSize: 16, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 4, alignSelf: 'flex-start', marginBottom: 4 },
  divider: { height: 1, opacity: 0.55, alignSelf: 'stretch', marginBottom: 6 },
  bfBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 2, height: 28 },
  bfSegment: { width: 22, borderRadius: 2 },
  bfLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 2, marginBottom: 4, paddingHorizontal: 4 },
  bfLabelEdge: { fontSize: 9, fontFamily: 'Courier', letterSpacing: 1 },
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  speedValue: { fontSize: 48, fontFamily: 'Courier', fontWeight: '900', letterSpacing: -2, lineHeight: 52 },
  speedUnit: { fontSize: 18, fontFamily: 'Courier', fontWeight: '600', letterSpacing: 2, marginBottom: 3 },
  rangeText: { fontSize: 11, fontFamily: 'Courier', letterSpacing: 2, marginTop: 2 },
  // Mic level meter
  // Direction section
  dirSection: { alignSelf: 'stretch', marginTop: 7, paddingTop: 7, borderTopWidth: 1 },
  dirHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 },
  dirTitle: { fontSize: 10, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 3 },
  liveHeading: { fontSize: 12, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 1 },
  dirBody: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 14 },
  dirRight: { flex: 1 },
  dirCardinal: { fontSize: 36, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 2 },
  dirDeg: { fontSize: 20, fontFamily: 'Courier', fontWeight: '600', letterSpacing: 1, marginTop: 2 },
  dirLabel: { fontSize: 9, fontFamily: 'Courier', letterSpacing: 2, marginTop: 2 },
  dirPrompt: { fontSize: 11, fontFamily: 'Courier', letterSpacing: 1, lineHeight: 18 },
  panArrows: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 5 },
  panArrowBox: { width: 104, height: 48, borderWidth: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', opacity: 0.35 },
  panArrowLit: { opacity: 1, shadowColor: '#ff3333', shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  panArrow: { fontSize: 27, fontFamily: 'Courier', fontWeight: '900', lineHeight: 27 },
  panArrowLabel: { fontSize: 9, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 2, marginTop: 2 },
  panGraphWrap: { alignSelf: 'stretch', alignItems: 'center', marginBottom: 3 },
  panGraphTitle: { fontSize: 9, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 2, alignSelf: 'flex-start', marginBottom: 2 },
  guidanceText: { fontSize: 10, fontFamily: 'Courier', letterSpacing: 2, textAlign: 'center', marginBottom: 4 },
  error: { fontSize: 12, fontFamily: 'Courier', letterSpacing: 1, marginTop: 10, textAlign: 'center' },
  dimWrap: { alignSelf: 'stretch', alignItems: 'center' },
  dimmed: { opacity: 0.3 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  switchLabel: { fontSize: 13, fontFamily: 'Courier', fontWeight: '900', letterSpacing: 3 },
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
  gustText: { fontSize: 13, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 1, marginTop: 4 },
  savedNote: { fontSize: 10, fontFamily: 'Courier', letterSpacing: 2, marginTop: 14 },
  // Readings archive
  archiveSection: { alignSelf: 'stretch', marginTop: 28, paddingTop: 14, borderTopWidth: 1 },
  archiveTitle: { fontSize: 11, fontFamily: 'Courier', fontWeight: '700', letterSpacing: 3, marginBottom: 8 },
  archiveRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  archiveTime: { fontFamily: 'Courier', fontSize: 11, letterSpacing: 0.5, flex: 1.6 },
  archiveVal: { fontFamily: 'Courier', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, flex: 1, textAlign: 'right' },
});
