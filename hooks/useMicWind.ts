import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';

export interface BeaufortInfo {
  number: number;
  label: string;
  description: string;
  knotsMin: number;
  knotsMax: number;
}

const BEAUFORT: BeaufortInfo[] = [
  { number: 0, label: 'CALM',         description: 'Smoke rises vertically',    knotsMin: 0,  knotsMax: 1  },
  { number: 1, label: 'LIGHT AIR',    description: 'Ripples, no foam crests',   knotsMin: 1,  knotsMax: 3  },
  { number: 2, label: 'LIGHT BREEZE', description: 'Small wavelets',            knotsMin: 4,  knotsMax: 6  },
  { number: 3, label: 'GENTLE',       description: 'Large wavelets, crests',    knotsMin: 7,  knotsMax: 10 },
  { number: 4, label: 'MODERATE',     description: 'Small waves, frequent caps',knotsMin: 11, knotsMax: 16 },
  { number: 5, label: 'FRESH',        description: 'Moderate long waves',       knotsMin: 17, knotsMax: 21 },
  { number: 6, label: 'STRONG',       description: 'Large waves, whitecaps',    knotsMin: 22, knotsMax: 27 },
  { number: 7, label: 'NEAR GALE',    description: 'Heaping seas, foam streaks',knotsMin: 28, knotsMax: 33 },
  { number: 8, label: 'GALE',         description: 'High waves, dense foam',    knotsMin: 34, knotsMax: 40 },
];

// dBFS breakpoints mapped to Beaufort numbers (0–8).
// These are tuned for a phone microphone held into moving air.
const DB_BREAKPOINTS: [number, number][] = [
  [-70, 0],
  [-55, 1],
  [-47, 2],
  [-40, 3],
  [-33, 4],
  [-24, 5],
  [-16, 6],
  [-9,  7],
  [-3,  8],
];

function dbToBeaufort(db: number): number {
  if (db <= DB_BREAKPOINTS[0][0]) return 0;
  if (db >= DB_BREAKPOINTS[DB_BREAKPOINTS.length - 1][0]) return 8;
  for (let i = 1; i < DB_BREAKPOINTS.length; i++) {
    const [db0, b0] = DB_BREAKPOINTS[i - 1];
    const [db1, b1] = DB_BREAKPOINTS[i];
    if (db <= db1) {
      const t = (db - db0) / (db1 - db0);
      return b0 + t * (b1 - b0);
    }
  }
  return 8;
}

function beaufortToKnots(b: number): number {
  const clamped = Math.max(0, Math.min(8, b));
  const idx = Math.floor(clamped);
  const next = Math.min(idx + 1, 8);
  const t = clamped - idx;
  const kMin = BEAUFORT[idx].knotsMin + t * (BEAUFORT[next].knotsMin - BEAUFORT[idx].knotsMin);
  return kMin;
}

function getBeaufortInfo(b: number): BeaufortInfo {
  return BEAUFORT[Math.max(0, Math.min(8, Math.round(b)))];
}

const ALPHA = 0.12; // EMA smoothing — lower = more lag but smoother

export interface MicWindState {
  isRecording: boolean;
  hasPermission: boolean | null;
  rawDb: number | null;
  smoothedDb: number | null;
  estimatedKnots: number | null;
  beaufortFractional: number;
  beaufortInfo: BeaufortInfo;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  error: string | null;
}

export function useMicWind(): MicWindState {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [rawDb, setRawDb] = useState<number | null>(null);
  const [smoothedDb, setSmoothedDb] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const smoothedRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch {}
      recordingRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      setHasPermission(granted);
      if (!granted) {
        setError('Microphone permission denied');
        return;
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await recording.startAsync();
      recordingRef.current = recording;
      smoothedRef.current = null;
      setIsRecording(true);

      intervalRef.current = setInterval(async () => {
        try {
          const status = await recording.getStatusAsync();
          if (!status.isRecording) return;
          const db = status.metering ?? -160;
          setRawDb(db);

          const prev = smoothedRef.current;
          const next = prev === null ? db : prev + ALPHA * (db - prev);
          smoothedRef.current = next;
          setSmoothedDb(next);
        } catch {}
      }, 150);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to start microphone');
      setIsRecording(false);
    }
  }, []);

  const bf = smoothedDb !== null ? dbToBeaufort(smoothedDb) : 0;
  const knots = smoothedDb !== null ? beaufortToKnots(bf) : null;

  return {
    isRecording,
    hasPermission,
    rawDb,
    smoothedDb,
    estimatedKnots: knots !== null ? parseFloat(knots.toFixed(1)) : null,
    beaufortFractional: bf,
    beaufortInfo: getBeaufortInfo(bf),
    start,
    stop,
    error,
  };
}
