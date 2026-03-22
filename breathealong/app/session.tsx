import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Animated,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import { COLORS } from '../constants/colors';
import { BreathingPattern, BreathNote, NoteType } from '../constants/types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HIGHWAY_W = 160;
const NOTE_SIZE = 64;
const HIT_ZONE_Y = SCREEN_H * 0.75;   // distance from top where hit zone sits
const NOTE_TRAVEL = SCREEN_H * 0.78;  // total distance a note travels before hit
const EQ_BARS = 10;

// How many pixels per second a note falls
const FALL_SPEED = 180;

const NOTE_CONFIG: Record<NoteType, { arrow: string; color: string; glow: string; label: string }> = {
  inhale: { arrow: '↑', color: COLORS.inhale, glow: COLORS.inhaleGlow, label: 'INHALE' },
  hold:   { arrow: '→', color: COLORS.hold,   glow: COLORS.holdGlow,   label: 'HOLD'   },
  exhale: { arrow: '↓', color: COLORS.exhale, glow: COLORS.exhaleGlow, label: 'EXHALE' },
};

/** Expand a BreathingPattern into a flat list of timed BreathNotes */
function buildNoteSequence(pattern: BreathingPattern): BreathNote[] {
  const notes: BreathNote[] = [];
  let t = 0;
  let id = 0;

  for (const cycle of pattern.cycles) {
    notes.push({ id: `n${id++}`, type: 'inhale', duration: cycle.inhale, startTime: t });
    t += cycle.inhale;

    if (cycle.hold > 0) {
      notes.push({ id: `n${id++}`, type: 'hold', duration: cycle.hold, startTime: t });
      t += cycle.hold;
    }

    notes.push({ id: `n${id++}`, type: 'exhale', duration: cycle.exhale, startTime: t });
    t += cycle.exhale;
  }

  return notes;
}

interface FallingNote {
  note: BreathNote;
  anim: Animated.Value;   // translateY: 0 → NOTE_TRAVEL
  opacity: Animated.Value;
}

export default function Session() {
  const { pattern: patternJson, fileUri } = useLocalSearchParams<{ pattern: string; fileUri: string }>();
  const router = useRouter();

  const pattern: BreathingPattern = JSON.parse(patternJson);
  const notes = buildNoteSequence(pattern);

  const [elapsed, setElapsed] = useState(0);
  const [currentNote, setCurrentNote] = useState<BreathNote | null>(null);
  const [done, setDone] = useState(false);
  const [fallingNotes, setFallingNotes] = useState<FallingNote[]>([]);

  const startTimeRef = useRef<number>(Date.now());
  const soundRef = useRef<Audio.Sound | null>(null);
  const eqAnims = useRef(Array.from({ length: EQ_BARS }, () => new Animated.Value(0.2))).current;
  const hitGlowAnim = useRef(new Animated.Value(0)).current;

  const totalDuration = notes.reduce((s, n) => Math.max(s, n.startTime + n.duration), 0);

  // Load and play audio file if provided
  useEffect(() => {
    if (!fileUri) return;
    (async () => {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: fileUri }, { shouldPlay: true });
      soundRef.current = sound;
    })();
    return () => { soundRef.current?.unloadAsync(); };
  }, [fileUri]);

  // Animate EQ bars driven by BPM
  useEffect(() => {
    const bpmInterval = pattern.bpm > 0 ? (60 / pattern.bpm) * 1000 : 500;
    const interval = setInterval(() => {
      eqAnims.forEach((anim, i) => {
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.3 + Math.random() * 0.7,
            duration: bpmInterval * 0.4,
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 0.05 + Math.random() * 0.2,
            duration: bpmInterval * 0.4,
            useNativeDriver: false,
          }),
        ]).start();
      });
    }, bpmInterval);
    return () => clearInterval(interval);
  }, [pattern.bpm]);

  // Main timer
  useEffect(() => {
    const interval = setInterval(() => {
      const now = (Date.now() - startTimeRef.current) / 1000;
      setElapsed(now);

      // Find active note
      const active = notes.find(n => now >= n.startTime && now < n.startTime + n.duration);
      setCurrentNote(active ?? null);

      if (now >= totalDuration) {
        setDone(true);
        clearInterval(interval);
      }
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Spawn falling notes slightly before they hit
  useEffect(() => {
    const lookAhead = NOTE_TRAVEL / FALL_SPEED; // seconds of look-ahead

    const timers = notes.map(note => {
      const spawnAt = Math.max(0, note.startTime - lookAhead) * 1000;
      const timeout = setTimeout(() => {
        const animY = new Animated.Value(0);
        const opacity = new Animated.Value(1);
        const falling: FallingNote = { note, anim: animY, opacity };

        setFallingNotes(prev => [...prev, falling]);

        Animated.timing(animY, {
          toValue: NOTE_TRAVEL,
          duration: lookAhead * 1000,
          useNativeDriver: true,
        }).start(() => {
          // Fade out after hit
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setFallingNotes(prev => prev.filter(f => f.note.id !== note.id));
          });
        });
      }, spawnAt);

      return timeout;
    });

    return () => timers.forEach(clearTimeout);
  }, []);

  // Hit zone glow when note is active
  useEffect(() => {
    if (currentNote) {
      Animated.timing(hitGlowAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
    } else {
      Animated.timing(hitGlowAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start();
    }
  }, [currentNote?.id]);

  const activeConfig = currentNote ? NOTE_CONFIG[currentNote.type] : null;
  const progress = Math.min(elapsed / totalDuration, 1);

  const EQ_COLORS = [COLORS.eq1, COLORS.eq2, COLORS.eq3];

  function EQPanel({ side }: { side: 'left' | 'right' }) {
    return (
      <View style={styles.eqPanel}>
        {eqAnims.map((anim, i) => (
          <Animated.View
            key={i}
            style={[
              styles.eqBar,
              {
                height: anim.interpolate({ inputRange: [0, 1], outputRange: [2, 60] }),
                backgroundColor: EQ_COLORS[i % EQ_COLORS.length],
                opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              },
            ]}
          />
        ))}
      </View>
    );
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.doneContainer}>
          <Text style={styles.doneEmoji}>✦</Text>
          <Text style={styles.doneTitle}>SESSION COMPLETE</Text>
          <Text style={styles.doneSong}>{pattern.songTitle}</Text>
          <Text style={styles.doneArtist}>{pattern.artist}</Text>
          <Text style={styles.doneTech}>{pattern.technique.toUpperCase()}</Text>
          <Text style={styles.doneNote}>{pattern.notes}</Text>
          <TouchableOpacity style={styles.doneButton} onPress={() => router.replace('/')}>
            <Text style={styles.doneButtonText}>NEW SESSION</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topSong}>{pattern.songTitle}</Text>
          <Text style={styles.topArtist}>{pattern.artist} · {pattern.technique}</Text>
        </View>
        <Text style={styles.topBpm}>{pattern.bpm} BPM</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      {/* Main stage */}
      <View style={styles.stage}>
        <EQPanel side="left" />

        {/* Highway */}
        <View style={styles.highway}>
          {/* Lane lines */}
          <View style={[styles.laneLine, { left: HIGHWAY_W * 0.33 }]} />
          <View style={[styles.laneLine, { left: HIGHWAY_W * 0.66 }]} />

          {/* Falling notes */}
          {fallingNotes.map(fn => {
            const cfg = NOTE_CONFIG[fn.note.type];
            return (
              <Animated.View
                key={fn.note.id}
                style={[
                  styles.note,
                  {
                    borderColor: cfg.color,
                    transform: [{ translateY: fn.anim }],
                    opacity: fn.opacity,
                    shadowColor: cfg.color,
                  },
                ]}
              >
                <Text style={[styles.noteArrow, { color: cfg.color }]}>{cfg.arrow}</Text>
                <Text style={[styles.noteLabel, { color: cfg.color }]}>{cfg.label}</Text>
                <Text style={[styles.noteDur, { color: cfg.color }]}>{fn.note.duration}s</Text>
              </Animated.View>
            );
          })}

          {/* Hit zone */}
          <Animated.View
            style={[
              styles.hitZone,
              {
                top: HIT_ZONE_Y - NOTE_SIZE / 2,
                backgroundColor: hitGlowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [COLORS.hitZoneGlow, activeConfig?.glow ?? COLORS.hitZoneGlow],
                }),
                borderColor: hitGlowAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [COLORS.border, activeConfig?.color ?? COLORS.hitZone],
                }),
              },
            ]}
          >
            {activeConfig ? (
              <>
                <Text style={[styles.hitArrow, { color: activeConfig.color }]}>
                  {activeConfig.arrow}
                </Text>
                <Text style={[styles.hitLabel, { color: activeConfig.color }]}>
                  {activeConfig.label}
                </Text>
              </>
            ) : (
              <Text style={styles.hitIdle}>◈</Text>
            )}
          </Animated.View>
        </View>

        <EQPanel side="right" />
      </View>

      {/* Phase timer at bottom */}
      {currentNote && (
        <View style={styles.phaseTimer}>
          <Text style={[styles.phaseTimerText, { color: activeConfig?.color }]}>
            {Math.max(0, Math.ceil(currentNote.startTime + currentNote.duration - elapsed))}s
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  topSong: { fontFamily: 'Courier', fontSize: 14, fontWeight: 'bold', color: COLORS.text, letterSpacing: 1 },
  topArtist: { fontFamily: 'Courier', fontSize: 10, color: COLORS.dim },
  topBpm: { fontFamily: 'Courier', fontSize: 13, color: COLORS.hold },

  progressTrack: { height: 2, backgroundColor: COLORS.border, marginHorizontal: 16 },
  progressFill: { height: 2, backgroundColor: COLORS.inhale },

  stage: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
  },

  // EQ
  eqPanel: {
    width: (SCREEN_W - HIGHWAY_W) / 2,
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 3,
    paddingBottom: 40,
    paddingHorizontal: 6,
  },
  eqBar: {
    width: 10,
    borderRadius: 2,
  },

  // Highway
  highway: {
    width: HIGHWAY_W,
    backgroundColor: COLORS.highway,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
    position: 'relative',
  },
  laneLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: COLORS.border,
    opacity: 0.4,
  },

  // Falling note
  note: {
    position: 'absolute',
    top: -NOTE_SIZE,
    left: (HIGHWAY_W - NOTE_SIZE) / 2,
    width: NOTE_SIZE,
    height: NOTE_SIZE,
    borderRadius: 8,
    borderWidth: 2,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.8,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
    gap: 1,
  },
  noteArrow: { fontFamily: 'Courier', fontSize: 24, fontWeight: 'bold' },
  noteLabel: { fontFamily: 'Courier', fontSize: 7, letterSpacing: 1 },
  noteDur:   { fontFamily: 'Courier', fontSize: 8, opacity: 0.8 },

  // Hit zone
  hitZone: {
    position: 'absolute',
    left: (HIGHWAY_W - NOTE_SIZE) / 2,
    width: NOTE_SIZE,
    height: NOTE_SIZE,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  hitArrow: { fontFamily: 'Courier', fontSize: 26, fontWeight: 'bold' },
  hitLabel: { fontFamily: 'Courier', fontSize: 7, letterSpacing: 1 },
  hitIdle:  { fontFamily: 'Courier', fontSize: 22, color: COLORS.dim },

  // Phase countdown
  phaseTimer: { alignItems: 'center', paddingBottom: 16 },
  phaseTimerText: { fontFamily: 'Courier', fontSize: 36, fontWeight: 'bold' },

  // Done screen
  doneContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingHorizontal: 32,
  },
  doneEmoji: { fontSize: 48, color: COLORS.inhale },
  doneTitle: { fontFamily: 'Courier', fontSize: 22, fontWeight: 'bold', color: COLORS.text, letterSpacing: 3 },
  doneSong:  { fontFamily: 'Courier', fontSize: 16, color: COLORS.text, textAlign: 'center' },
  doneArtist:{ fontFamily: 'Courier', fontSize: 12, color: COLORS.dim },
  doneTech:  { fontFamily: 'Courier', fontSize: 11, color: COLORS.hold, letterSpacing: 2 },
  doneNote:  {
    fontFamily: 'Courier', fontSize: 12, color: COLORS.dim,
    textAlign: 'center', lineHeight: 20, marginTop: 8,
  },
  doneButton: {
    marginTop: 24, backgroundColor: COLORS.inhale,
    borderRadius: 8, paddingVertical: 14, paddingHorizontal: 32,
  },
  doneButtonText: { fontFamily: 'Courier', fontSize: 14, fontWeight: 'bold', color: '#000', letterSpacing: 2 },
});
