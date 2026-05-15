import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { Magnetometer } from 'expo-sensors';

export interface BeaufortInfo {
  number: number;
  label: string;
  description: string;
  knotsMin: number;
  knotsMax: number;
}

const BEAUFORT: BeaufortInfo[] = [
  { number: 0, label: 'CALM',         description: 'Smoke rises vertically',     knotsMin: 0,  knotsMax: 1  },
  { number: 1, label: 'LIGHT AIR',    description: 'Ripples, no foam crests',    knotsMin: 1,  knotsMax: 3  },
  { number: 2, label: 'LIGHT BREEZE', description: 'Small wavelets',             knotsMin: 4,  knotsMax: 6  },
  { number: 3, label: 'GENTLE',       description: 'Large wavelets, crests',     knotsMin: 7,  knotsMax: 10 },
  { number: 4, label: 'MODERATE',     description: 'Small waves, frequent caps', knotsMin: 11, knotsMax: 16 },
  { number: 5, label: 'FRESH',        description: 'Moderate long waves',        knotsMin: 17, knotsMax: 21 },
  { number: 6, label: 'STRONG',       description: 'Large waves, whitecaps',     knotsMin: 22, knotsMax: 27 },
  { number: 7, label: 'NEAR GALE',    description: 'Heaping seas, foam streaks', knotsMin: 28, knotsMax: 33 },
  { number: 8, label: 'GALE',         description: 'High waves, dense foam',     knotsMin: 34, knotsMax: 40 },
];

// dBFS breakpoints → Beaufort 0–8. Shifted +12 dB (3/4 sensitivity reduction).
const DB_BREAKPOINTS: [number, number][] = [
  [-58, 0],
  [-43, 1],
  [-35, 2],
  [-28, 3],
  [-21, 4],
  [-12, 5],
  [-5,  6],
  [-2,  7],
  [0,   8],
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
  return BEAUFORT[idx].knotsMin + t * (BEAUFORT[next].knotsMin - BEAUFORT[idx].knotsMin);
}

function getBeaufortInfo(b: number): BeaufortInfo {
  return BEAUFORT[Math.max(0, Math.min(8, Math.round(b)))];
}

// ── Compass helpers ───────────────────────────────────────────────────────────

const CARDINALS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

export function headingToCardinal(deg: number): string {
  return CARDINALS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

function circularMean(angles: number[]): number {
  const s = angles.reduce((sum, a) => sum + Math.sin(a * Math.PI / 180), 0);
  const c = angles.reduce((sum, a) => sum + Math.cos(a * Math.PI / 180), 0);
  return ((Math.atan2(s, c) * 180 / Math.PI) + 360) % 360;
}

function circularSpread(angles: number[]): number {
  if (angles.length < 2) return 0;
  const mean = circularMean(angles);
  const maxDiff = Math.max(...angles.map(a => {
    const d = Math.abs(a - mean);
    return d > 180 ? 360 - d : d;
  }));
  return maxDiff * 2;
}

interface HeadingSample { heading: number; db: number; t: number }

function computeWindHeading(buf: HeadingSample[]): { heading: number | null; sweepDeg: number } {
  if (buf.length < 5) return { heading: null, sweepDeg: 0 };
  const spread = circularSpread(buf.map(b => b.heading));
  if (spread < 30) return { heading: null, sweepDeg: spread };
  // Average the top 15% of samples by audio level
  const sorted = [...buf].sort((a, b) => b.db - a.db);
  const topN = Math.max(3, Math.ceil(sorted.length * 0.15));
  const peakHeading = circularMean(sorted.slice(0, topN).map(b => b.heading));
  return { heading: peakHeading, sweepDeg: spread };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const ALPHA = 0.12;
const SAMPLE_MS = 150;
const WINDOW_MS = 10_000;

export interface MicWindState {
  isRecording: boolean;
  hasPermission: boolean | null;
  rawDb: number | null;
  smoothedDb: number | null;
  estimatedKnots: number | null;
  beaufortFractional: number;
  beaufortInfo: BeaufortInfo;
  // direction
  windHeadingDeg: number | null;
  windCardinal: string | null;
  sweepDeg: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  error: string | null;
}

export function useMicWind(): MicWindState {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [rawDb, setRawDb] = useState<number | null>(null);
  const [smoothedDb, setSmoothedDb] = useState<number | null>(null);
  const [windHeadingDeg, setWindHeadingDeg] = useState<number | null>(null);
  const [sweepDeg, setSweepDeg] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const smoothedRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const magSubRef = useRef<ReturnType<typeof Magnetometer.addListener> | null>(null);
  const currentHeading = useRef(0);
  const headingBuf = useRef<HeadingSample[]>([]);

  const stop = useCallback(async () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
    }
    if (magSubRef.current) { magSubRef.current.remove(); magSubRef.current = null; }
    headingBuf.current = [];
    setIsRecording(false);
    setWindHeadingDeg(null);
    setSweepDeg(0);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      setHasPermission(granted);
      if (!granted) { setError('Microphone permission denied'); return; }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await recording.startAsync();
      recordingRef.current = recording;
      smoothedRef.current = null;
      headingBuf.current = [];
      setWindHeadingDeg(null);
      setSweepDeg(0);
      setIsRecording(true);

      // Subscribe to magnetometer for wind direction detection.
      // Phone is held upside-down so the mic (physical bottom) faces the wind.
      // Wind-from heading = direction the mic points = opposite of phone-top heading.
      try {
        Magnetometer.setUpdateInterval(100);
        magSubRef.current = Magnetometer.addListener(({ x, y }) => {
          // Heading of phone bottom (mic) in portrait-upside-down orientation
          const h = ((Math.atan2(-x, -y) * 180 / Math.PI) + 360) % 360;
          currentHeading.current = h;
        });
      } catch {
        // Magnetometer unavailable — direction feature silently disabled
      }

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

          // Accumulate heading + audio sample for direction detection
          const now = Date.now();
          headingBuf.current.push({ heading: currentHeading.current, db: next, t: now });
          headingBuf.current = headingBuf.current.filter(b => now - b.t < WINDOW_MS);

          const { heading, sweepDeg } = computeWindHeading(headingBuf.current);
          setWindHeadingDeg(heading);
          setSweepDeg(sweepDeg);
        } catch {}
      }, SAMPLE_MS);
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
    windHeadingDeg,
    windCardinal: windHeadingDeg !== null ? headingToCardinal(windHeadingDeg) : null,
    sweepDeg,
    start,
    stop,
    error,
  };
}
