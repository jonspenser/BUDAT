import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { COLORS } from '../constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CIRCLE_MAX = SCREEN_WIDTH * 0.62;
const CIRCLE_MIN = SCREEN_WIDTH * 0.28;

type Phase = 'INHALE' | 'HOLD' | 'EXHALE' | 'REST';

interface Pattern {
  label: string;
  phases: { phase: Phase; duration: number; label: string }[];
}

const PATTERNS: Pattern[] = [
  {
    label: 'BOX',
    phases: [
      { phase: 'INHALE', duration: 4000, label: 'INHALE' },
      { phase: 'HOLD',   duration: 4000, label: 'HOLD' },
      { phase: 'EXHALE', duration: 4000, label: 'EXHALE' },
      { phase: 'REST',   duration: 4000, label: 'REST' },
    ],
  },
  {
    label: '4-7-8',
    phases: [
      { phase: 'INHALE', duration: 4000, label: 'INHALE' },
      { phase: 'HOLD',   duration: 7000, label: 'HOLD' },
      { phase: 'EXHALE', duration: 8000, label: 'EXHALE' },
    ],
  },
  {
    label: 'CALM',
    phases: [
      { phase: 'INHALE', duration: 5000, label: 'INHALE' },
      { phase: 'EXHALE', duration: 7000, label: 'EXHALE' },
    ],
  },
];

function phaseColor(phase: Phase): string {
  switch (phase) {
    case 'INHALE': return COLORS.primary;
    case 'HOLD':   return '#FFB347';
    case 'EXHALE': return '#5B9BD5';
    case 'REST':   return COLORS.dim;
  }
}

export default function BreatheAlong() {
  const [running, setRunning] = useState(false);
  const [patternIdx, setPatternIdx] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [cycles, setCycles] = useState(0);

  const circleAnim = useRef(new Animated.Value(CIRCLE_MIN)).current;
  const opacityAnim = useRef(new Animated.Value(0.4)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseIdxRef = useRef(0);
  const cyclesRef = useRef(0);
  const runningRef = useRef(false);

  const pattern = PATTERNS[patternIdx];

  const clearCountdown = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const startPhase = useCallback((pIdx: number, pat: Pattern) => {
    const step = pat.phases[pIdx];
    phaseIdxRef.current = pIdx;
    setPhaseIdx(pIdx);

    // Animate circle size
    if (animRef.current) animRef.current.stop();
    const toSize = step.phase === 'INHALE' ? CIRCLE_MAX
      : step.phase === 'EXHALE' ? CIRCLE_MIN
      : undefined;
    const toOpacity = step.phase === 'INHALE' ? 1
      : step.phase === 'EXHALE' ? 0.4
      : undefined;

    if (toSize !== undefined) {
      animRef.current = Animated.parallel([
        Animated.timing(circleAnim, {
          toValue: toSize,
          duration: step.duration,
          useNativeDriver: false,
        }),
        Animated.timing(opacityAnim, {
          toValue: toOpacity!,
          duration: step.duration,
          useNativeDriver: false,
        }),
      ]);
      animRef.current.start();
    }

    // Countdown timer
    clearCountdown();
    const secs = Math.ceil(step.duration / 1000);
    setCountdown(secs);
    let remaining = secs - 1;
    intervalRef.current = setInterval(() => {
      setCountdown(remaining);
      remaining--;
      if (remaining < 0) clearCountdown();
    }, 1000);

    // Schedule next phase
    setTimeout(() => {
      if (!runningRef.current) return;
      const nextIdx = (pIdx + 1) % pat.phases.length;
      if (nextIdx === 0) {
        cyclesRef.current += 1;
        setCycles(cyclesRef.current);
      }
      startPhase(nextIdx, pat);
    }, step.duration);
  }, [circleAnim, opacityAnim]);

  const start = useCallback(() => {
    runningRef.current = true;
    cyclesRef.current = 0;
    setCycles(0);
    setRunning(true);
    startPhase(0, PATTERNS[patternIdx]);
  }, [patternIdx, startPhase]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    clearCountdown();
    if (animRef.current) animRef.current.stop();
    Animated.parallel([
      Animated.timing(circleAnim, { toValue: CIRCLE_MIN, duration: 600, useNativeDriver: false }),
      Animated.timing(opacityAnim, { toValue: 0.4, duration: 600, useNativeDriver: false }),
    ]).start();
    setPhaseIdx(0);
    setCountdown(0);
  }, [circleAnim, opacityAnim]);

  // Stop when pattern changes
  useEffect(() => {
    if (running) stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternIdx]);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      clearCountdown();
    };
  }, []);

  const currentPhase = pattern.phases[phaseIdx];
  const color = running ? phaseColor(currentPhase.phase) : COLORS.dim;

  return (
    <View style={styles.container}>
      {/* Pattern selector */}
      <View style={styles.patternRow}>
        {PATTERNS.map((p, i) => (
          <TouchableOpacity
            key={p.label}
            style={[styles.patternBtn, i === patternIdx && styles.patternBtnActive]}
            onPress={() => setPatternIdx(i)}
          >
            <Text style={[styles.patternLabel, i === patternIdx && styles.patternLabelActive]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Animated circle */}
      <View style={styles.circleArea}>
        <Animated.View
          style={[
            styles.circle,
            {
              width: circleAnim,
              height: circleAnim,
              borderRadius: Animated.divide(circleAnim, 2) as any,
              borderColor: color,
              opacity: opacityAnim,
            },
          ]}
        />
        <View style={styles.circleCenter}>
          {running ? (
            <>
              <Text style={[styles.phaseLabel, { color }]}>{currentPhase.label}</Text>
              {countdown > 0 && (
                <Text style={[styles.countdown, { color }]}>{countdown}</Text>
              )}
            </>
          ) : (
            <Text style={styles.tapHint}>TAP START</Text>
          )}
        </View>
      </View>

      {/* Cycle counter */}
      <Text style={styles.cycleText}>
        {cycles > 0 ? `CYCLES: ${cycles}` : ' '}
      </Text>

      {/* Phase timeline */}
      <View style={styles.timeline}>
        {pattern.phases.map((p, i) => (
          <View key={i} style={styles.timelineItem}>
            <View
              style={[
                styles.timelineDot,
                {
                  backgroundColor: running && i === phaseIdx
                    ? phaseColor(p.phase)
                    : COLORS.divider,
                },
              ]}
            />
            <Text style={[
              styles.timelineLabel,
              running && i === phaseIdx && { color: phaseColor(p.phase) },
            ]}>
              {p.label}
            </Text>
            <Text style={styles.timelineSec}>{p.duration / 1000}s</Text>
          </View>
        ))}
      </View>

      {/* Start / Stop button */}
      <TouchableOpacity
        style={[styles.btn, running && styles.btnStop]}
        onPress={running ? stop : start}
      >
        <Text style={styles.btnText}>{running ? 'STOP' : 'START'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 20,
  },
  patternRow: {
    flexDirection: 'row',
    gap: 10,
  },
  patternBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 4,
  },
  patternBtnActive: {
    borderColor: COLORS.primary,
  },
  patternLabel: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: COLORS.dim,
    letterSpacing: 1,
  },
  patternLabelActive: {
    color: COLORS.primary,
  },
  circleArea: {
    width: CIRCLE_MAX + 20,
    height: CIRCLE_MAX + 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  circleCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseLabel: {
    fontFamily: 'Courier',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 3,
  },
  countdown: {
    fontFamily: 'Courier',
    fontSize: 42,
    fontWeight: 'bold',
    marginTop: 4,
  },
  tapHint: {
    fontFamily: 'Courier',
    fontSize: 14,
    color: COLORS.dim,
    letterSpacing: 2,
  },
  cycleText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.dim,
    letterSpacing: 2,
    height: 18,
  },
  timeline: {
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  timelineItem: {
    alignItems: 'center',
    gap: 4,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    letterSpacing: 1,
  },
  timelineSec: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
  },
  btn: {
    paddingHorizontal: 48,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 4,
  },
  btnStop: {
    borderColor: '#5B9BD5',
  },
  btnText: {
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 3,
  },
});
