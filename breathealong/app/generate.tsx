import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Animated } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS } from '../constants/colors';
import { generateBreathingPattern } from '../services/claude';
import { BreathingPattern } from '../constants/types';

const STEPS = [
  'Analyzing song energy...',
  'Mapping rhythmic structure...',
  'Selecting breath technique...',
  'Calibrating phase durations...',
  'Composing note highway...',
];

export default function Generate() {
  const params = useLocalSearchParams<{
    title: string;
    artist: string;
    bpm?: string;
    energy?: string;
    valence?: string;
    fileUri?: string;
  }>();
  const router = useRouter();

  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const barAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0.2))).current;

  // Pulse the center orb
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Animate EQ bars randomly
  useEffect(() => {
    const animations = barAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.timing(anim, {
            toValue: 0.3 + Math.random() * 0.7,
            duration: 300 + Math.random() * 400,
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 0.1 + Math.random() * 0.3,
            duration: 300 + Math.random() * 400,
            useNativeDriver: false,
          }),
        ])
      )
    );
    animations.forEach(a => a.start());
    return () => animations.forEach(a => a.stop());
  }, []);

  // Step through loading messages
  useEffect(() => {
    const id = setInterval(() => {
      setStepIndex(prev => (prev < STEPS.length - 1 ? prev + 1 : prev));
    }, 1200);
    return () => clearInterval(id);
  }, []);

  // Actually generate the pattern
  useEffect(() => {
    (async () => {
      try {
        const pattern: BreathingPattern = await generateBreathingPattern(
          params.title,
          params.artist,
          params.bpm ? parseFloat(params.bpm) : undefined,
          params.energy ? parseFloat(params.energy) : undefined,
          params.valence ? parseFloat(params.valence) : undefined,
        );
        router.replace({
          pathname: '/session',
          params: {
            pattern: JSON.stringify(pattern),
            fileUri: params.fileUri ?? '',
          },
        });
      } catch (e: any) {
        setError(e.message ?? 'Failed to generate pattern');
      }
    })();
  }, []);

  const EQ_COLORS = [COLORS.eq1, COLORS.eq2, COLORS.eq3];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* Song info */}
        <Text style={styles.songTitle}>{params.title}</Text>
        <Text style={styles.songArtist}>{params.artist}</Text>

        {/* EQ bars */}
        <View style={styles.eqRow}>
          {barAnims.map((anim, i) => (
            <Animated.View
              key={i}
              style={[
                styles.eqBar,
                {
                  height: anim.interpolate({ inputRange: [0, 1], outputRange: [4, 64] }),
                  backgroundColor: EQ_COLORS[i % EQ_COLORS.length],
                  opacity: anim,
                },
              ]}
            />
          ))}
        </View>

        {/* Orb */}
        <Animated.View style={[styles.orb, { opacity: pulseAnim, transform: [{ scale: pulseAnim }] }]} />

        {/* Step label */}
        {!error ? (
          <Text style={styles.step}>{STEPS[stepIndex]}</Text>
        ) : (
          <Text style={styles.error}>{error}</Text>
        )}

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: 24 },

  songTitle: {
    fontFamily: 'Courier',
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    letterSpacing: 2,
    textAlign: 'center',
  },
  songArtist: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: COLORS.dim,
    letterSpacing: 1,
    textAlign: 'center',
  },

  eqRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 5,
    height: 72,
    marginVertical: 8,
  },
  eqBar: {
    width: 14,
    borderRadius: 3,
  },

  orb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.inhale,
    shadowColor: COLORS.inhale,
    shadowOpacity: 1,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 0 },
  },

  step: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: COLORS.inhale,
    letterSpacing: 1,
    textAlign: 'center',
  },
  error: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: COLORS.exhale,
    textAlign: 'center',
    lineHeight: 20,
  },
});
