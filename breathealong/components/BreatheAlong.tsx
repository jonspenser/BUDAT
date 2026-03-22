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
const CIRCLE_MAX = SCREEN_WIDTH * 0.65;
const CIRCLE_MIN = SCREEN_WIDTH * 0.25;

type Phase = 'INHALE' | 'HOLD' | 'EXHALE' | 'REST';

interface PatternStep {
  phase: Phase;
  duration: number;
  label: string;
}

interface Pattern {
  key: string;
  label: string;
  description: string;
  phases: PatternStep[];
}

const PATTERNS: Pattern[] = [
  {
    key: 'box',
    label: 'BOX',
    description: '4 · 4 · 4 · 4',
    phases: [
      { phase: 'INHALE', duration: 4000, label: 'INHALE' },
      { phase: 'HOLD',   duration: 4000, label: 'HOLD' },
      { phase: 'EXHALE', duration: 4000, label: 'EXHALE' },
      { phase: 'REST',   duration: 4000, label: 'REST' },
    ],
  },
  {
    key: '478',
    label: '4-7-8',
    description: '4 · 7 · 8',
    phases: [
      { phase: 'INHALE', duration: 4000, label: 'INHALE' },
      { phase: 'HOLD',   duration: 7000, label: 'HOLD' },
      { phase: 'EXHALE', duration: 8000, label: 'EXHALE' },
    ],
  },
  {
    key: 'calm',
    label: 'CALM',
    description: '5 · 7',
    phases: [
      { phase: 'INHALE', duration: 5000, label: 'INHALE' },
      { phase: 'EXHALE', duration: 7000, label: 'EXHALE' },
    ],
  },
];

function colorForPhase(phase: Phase): string {
  switch (phase) {
    case 'INHALE': return COLORS.inhale;
    case 'HOLD':   return COLORS.hold;
    case 'EXHALE': return COLORS.exhale;
    case 'REST':   return COLORS.rest;
  }
}

export default function BreatheAlong() {
  const [running, setRunning] = useState(false);
  const [patternIdx, setPatternIdx] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [cycles, setCycles] = useState(0);

  const circleAnim = useRef(new Animated.Value(CIRCLE_MIN)).current;
  const opacityAnim = useRef(new Animated.Value(0.3)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const phaseIdxRef = useRef(0);
  const cyclesRef = useRef(0);

  const clearTimers = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  };

  const startPhase = useCallback((pIdx: number, pat: Pattern) => {
    if (!runningRef.current) return;

    phaseIdxRef.current = pIdx;
    setPhaseIdx(pIdx);

    const step = pat.phases[pIdx];
    const color = colorForPhase(step.phase);

    // Circle animation
    if (animRef.current) animRef.current.stop();

    const toSize =
      step.phase === 'INHALE' ? CIRCLE_MAX :
      step.phase === 'EXHALE' ? CIRCLE_MIN :
      undefined;

    const toOpacity =
      step.phase === 'INHALE' ? 0.85 :
      step.phase === 'EXHALE' ? 0.3 :
      undefined;

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
    } else {
      // Subtle glow pulse during hold/rest
      animRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 800, useNativeDriver: false }),
        ])
      );
    }
    animRef.current.start();

    // Countdown
    clearTimers();
    const totalSecs = Math.ceil(step.duration / 1000);
    setCountdown(totalSecs);
    let remaining = totalSecs - 1;
    intervalRef.current = setInterval(() => {
      setCountdown(remaining);
      remaining--;
      if (remaining < 0) clearInterval(intervalRef.current!);
    }, 1000);

    // Advance to next phase
    timeoutRef.current = setTimeout(() => {
      if (!runningRef.current) return;
      const nextIdx = (pIdx + 1) % pat.phases.length;
      if (nextIdx === 0) {
        cyclesRef.current += 1;
        setCycles(cyclesRef.current);
      }
      startPhase(nextIdx, pat);
    }, step.duration);
  }, [circleAnim, opacityAnim, glowAnim]);

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
    clearTimers();
    if (animRef.current) animRef.current.stop();
    Animated.parallel([
      Animated.timing(circleAnim, { toValue: CIRCLE_MIN, duration: 800, useNativeDriver: false }),
      Animated.timing(opacityAnim, { toValue: 0.3, duration: 800, useNativeDriver: false }),
    ]).start();
    setPhaseIdx(0);
    setCountdown(0);
  }, [circleAnim, opacityAnim]);

  // Reset when pattern changes
  useEffect(() => {
    if (running) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patternIdx]);

  useEffect(() => {
    return () => { runningRef.current = false; clearTimers(); };
  }, []);

  const pattern = PATTERNS[patternIdx];
  const currentStep = pattern.phases[phaseIdx];
  const activeColor = running ? colorForPhase(currentStep.phase) : COLORS.dim;

  return (
    <View style={styles.container}>

      {/* Pattern selector */}
      <View style={styles.patternRow}>
        {PATTERNS.map((p, i) => (
          <TouchableOpacity
            key={p.key}
            style={[styles.patternBtn, i === patternIdx && styles.patternBtnActive]}
            onPress={() => setPatternIdx(i)}
          >
            <Text style={[styles.patternLabel, i === patternIdx && { color: COLORS.text }]}>
              {p.label}
            </Text>
            <Text style={styles.patternDesc}>{p.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Breathing circle */}
      <View style={styles.circleArea}>
        {/* Outer glow ring */}
        <Animated.View
          style={[
            styles.glowRing,
            {
              width: Animated.add(circleAnim, running ? glowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 24],
              }) : 0),
              height: Animated.add(circleAnim, running ? glowAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 24],
              }) : 0),
              borderColor: activeColor,
              opacity: opacityAnim.interpolate({
                inputRange: [0.3, 0.85],
                outputRange: [0.1, 0.25],
              }),
            },
          ]}
        />
        {/* Main circle */}
        <Animated.View
          style={[
            styles.circle,
            {
              width: circleAnim,
              height: circleAnim,
              borderRadius: Animated.divide(circleAnim, 2) as any,
              backgroundColor: activeColor,
              opacity: opacityAnim,
            },
          ]}
        />
        {/* Center text */}
        <View style={styles.circleCenter}>
          {running ? (
            <>
              <Text style={[styles.phaseText, { color: COLORS.text }]}>
                {currentStep.label}
              </Text>
              {countdown > 0 && (
                <Text style={[styles.countdownText, { color: activeColor }]}>
                  {countdown}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.idleText}>BREATHE</Text>
          )}
        </View>
      </View>

      {/* Cycle counter */}
      <Text style={styles.cycleCount}>
        {cycles > 0 ? `CYCLE ${cycles}` : ''}
      </Text>

      {/* Phase steps */}
      <View style={styles.stepsRow}>
        {pattern.phases.map((step, i) => {
          const active = running && i === phaseIdx;
          return (
            <View key={i} style={styles.stepItem}>
              <View style={[styles.stepDot, { backgroundColor: active ? colorForPhase(step.phase) : COLORS.divider }]} />
              <Text style={[styles.stepLabel, active && { color: colorForPhase(step.phase) }]}>
                {step.label}
              </Text>
              <Text style={styles.stepSecs}>{step.duration / 1000}s</Text>
            </View>
          );
        })}
      </View>

      {/* Start / Stop */}
      <TouchableOpacity
        style={[styles.startBtn, running && { borderColor: COLORS.exhale }]}
        onPress={running ? stop : start}
        activeOpacity={0.7}
      >
        <Text style={[styles.startBtnText, running && { color: COLORS.exhale }]}>
          {running ? 'STOP' : 'START'}
        </Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 24,
  },
  patternRow: {
    flexDirection: 'row',
    gap: 12,
  },
  patternBtn: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 6,
    minWidth: 80,
  },
  patternBtnActive: {
    borderColor: COLORS.primary,
  },
  patternLabel: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.dim,
    letterSpacing: 1,
  },
  patternDesc: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    marginTop: 2,
  },
  circleArea: {
    width: CIRCLE_MAX + 60,
    height: CIRCLE_MAX + 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  circle: {
    position: 'absolute',
    borderRadius: 999,
  },
  circleCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseText: {
    fontFamily: 'Courier',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 3,
  },
  countdownText: {
    fontFamily: 'Courier',
    fontSize: 52,
    fontWeight: 'bold',
    lineHeight: 60,
    marginTop: 4,
  },
  idleText: {
    fontFamily: 'Courier',
    fontSize: 18,
    color: COLORS.dim,
    letterSpacing: 4,
  },
  cycleCount: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.dim,
    letterSpacing: 2,
    height: 16,
  },
  stepsRow: {
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 20,
  },
  stepItem: {
    alignItems: 'center',
    gap: 5,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stepLabel: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
    letterSpacing: 1,
  },
  stepSecs: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
  },
  startBtn: {
    paddingHorizontal: 52,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 6,
  },
  startBtnText: {
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 4,
  },
});
