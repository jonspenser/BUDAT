import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { Magnetometer } from 'expo-sensors';
import * as Haptics from 'expo-haptics';

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

const DB_BREAKPOINTS: [number, number][] = [
  [-58, 0], [-43, 1], [-35, 2], [-28, 3],
  [-21, 4], [-12, 5], [-5,  6], [-2,  7], [0, 8],
];

function dbToBeaufort(db: number): number {
  if (db <= DB_BREAKPOINTS[0][0]) return 0;
  if (db >= DB_BREAKPOINTS[DB_BREAKPOINTS.length - 1][0]) return 8;
  for (let i = 1; i < DB_BREAKPOINTS.length; i++) {
    const [db0, b0] = DB_BREAKPOINTS[i - 1];
    const [db1, b1] = DB_BREAKPOINTS[i];
    if (db <= db1) return b0 + ((db - db0) / (db1 - db0)) * (b1 - b0);
  }
  return 8;
}

function beaufortToKnots(b: number): number {
  const idx = Math.max(0, Math.min(8, Math.floor(b)));
  const next = Math.min(idx + 1, 8);
  return BEAUFORT[idx].knotsMin + (b - idx) * (BEAUFORT[next].knotsMin - BEAUFORT[idx].knotsMin);
}

function getBeaufortInfo(b: number): BeaufortInfo {
  return BEAUFORT[Math.max(0, Math.min(8, Math.round(b)))];
}

// ── Compass helpers ───────────────────────────────────────────────────────────

const CARDINALS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

export function headingToCardinal(deg: number): string {
  return CARDINALS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function circularMean(angles: number[]): number {
  const s = angles.reduce((sum, a) => sum + Math.sin(a * Math.PI / 180), 0);
  const c = angles.reduce((sum, a) => sum + Math.cos(a * Math.PI / 180), 0);
  return ((Math.atan2(s, c) * 180 / Math.PI) + 360) % 360;
}

function circularSpread(angles: number[]): number {
  if (angles.length < 2) return 0;
  const mean = circularMean(angles);
  return Math.max(...angles.map(a => {
    const d = Math.abs(a - mean);
    return d > 180 ? 360 - d : d;
  })) * 2;
}

interface HeadingSample { heading: number; db: number; t: number }

function computeWindHeading(buf: HeadingSample[]): { heading: number | null; sweepDeg: number } {
  if (buf.length < 5) return { heading: null, sweepDeg: 0 };
  const spread = circularSpread(buf.map(b => b.heading));
  if (spread < 30) return { heading: null, sweepDeg: spread };
  const sorted = [...buf].sort((a, b) => b.db - a.db);
  const topN = Math.max(3, Math.ceil(sorted.length * 0.15));
  return { heading: circularMean(sorted.slice(0, topN).map(b => b.heading)), sweepDeg: spread };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const ALPHA      = 0.12;
const SAMPLE_MS  = 150;
const WINDOW_MS  = 25_000;  // 25s — enough for 3 slow passes
const PEAK_ZONE  = 25;      // degrees — within this of peak = "in zone"
const PASSES_NEEDED = 3;

export interface MicWindResult {
  heading: number;
  cardinal: string;
  knots: number;
  beaufortInfo: BeaufortInfo;
}

export interface MicWindState {
  isRecording: boolean;
  isComplete: boolean;
  result: MicWindResult | null;
  hasPermission: boolean | null;
  rawDb: number | null;
  smoothedDb: number | null;
  estimatedKnots: number | null;
  beaufortFractional: number;
  beaufortInfo: BeaufortInfo;
  windHeadingDeg: number | null;
  windCardinal: string | null;
  sweepDeg: number;
  passCount: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
  error: string | null;
}

export function useMicWind(): MicWindState {
  const [hasPermission, setHasPermission]   = useState<boolean | null>(null);
  const [isRecording,   setIsRecording]     = useState(false);
  const [isComplete,    setIsComplete]      = useState(false);
  const [result,        setResult]          = useState<MicWindResult | null>(null);
  const [rawDb,         setRawDb]           = useState<number | null>(null);
  const [smoothedDb,    setSmoothedDb]      = useState<number | null>(null);
  const [windHeadingDeg, setWindHeadingDeg] = useState<number | null>(null);
  const [sweepDeg,      setSweepDeg]        = useState(0);
  const [passCount,     setPassCount]       = useState(0);
  const [error,         setError]           = useState<string | null>(null);

  const recordingRef    = useRef<Audio.Recording | null>(null);
  const smoothedRef     = useRef<number | null>(null);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const magSubRef       = useRef<ReturnType<typeof Magnetometer.addListener> | null>(null);
  const currentHeading  = useRef(0);
  const headingBuf      = useRef<HeadingSample[]>([]);
  const inPeakZoneRef   = useRef(false);
  const passCountRef    = useRef(0);
  const completedRef    = useRef(false);

  const stopRecording = useCallback(async () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
    }
    if (magSubRef.current) { magSubRef.current.remove(); magSubRef.current = null; }
    setIsRecording(false);
  }, []);

  const stop = useCallback(async () => {
    await stopRecording();
    headingBuf.current = [];
    inPeakZoneRef.current = false;
    passCountRef.current = 0;
    completedRef.current = false;
    setWindHeadingDeg(null);
    setSweepDeg(0);
    setPassCount(0);
  }, [stopRecording]);

  const reset = useCallback(() => {
    setIsComplete(false);
    setResult(null);
    setRawDb(null);
    setSmoothedDb(null);
    setWindHeadingDeg(null);
    setSweepDeg(0);
    setPassCount(0);
    smoothedRef.current = null;
    headingBuf.current = [];
    inPeakZoneRef.current = false;
    passCountRef.current = 0;
    completedRef.current = false;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    reset();
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
      setIsRecording(true);

      // Magnetometer — phone held upside-down so mic (bottom) faces wind
      try {
        Magnetometer.setUpdateInterval(100);
        magSubRef.current = Magnetometer.addListener(({ x, y }) => {
          currentHeading.current = ((Math.atan2(-x, -y) * 180 / Math.PI) + 360) % 360;
        });
      } catch {}

      intervalRef.current = setInterval(async () => {
        if (completedRef.current) return;
        try {
          const status = await recording.getStatusAsync();
          if (!status.isRecording) return;
          const db = status.metering ?? -160;
          setRawDb(db);

          const prev = smoothedRef.current;
          const next = prev === null ? db : prev + ALPHA * (db - prev);
          smoothedRef.current = next;
          setSmoothedDb(next);

          const now = Date.now();
          headingBuf.current.push({ heading: currentHeading.current, db: next, t: now });
          headingBuf.current = headingBuf.current.filter(b => now - b.t < WINDOW_MS);

          const { heading, sweepDeg } = computeWindHeading(headingBuf.current);
          setWindHeadingDeg(heading);
          setSweepDeg(sweepDeg);

          // Pass counting — once we have a heading estimate, track sweeps through peak zone
          if (heading !== null) {
            const diff = angleDiff(currentHeading.current, heading);
            const inZone = diff < PEAK_ZONE;

            if (inPeakZoneRef.current && !inZone) {
              // Exited the peak zone — one pass complete
              passCountRef.current += 1;
              setPassCount(passCountRef.current);

              if (passCountRef.current >= PASSES_NEEDED) {
                // Lock result and complete
                completedRef.current = true;
                const bf = dbToBeaufort(next);
                const knots = beaufortToKnots(bf);
                const finalResult: MicWindResult = {
                  heading,
                  cardinal: headingToCardinal(heading),
                  knots: Math.round(knots),
                  beaufortInfo: getBeaufortInfo(bf),
                };
                setResult(finalResult);
                setIsComplete(true);
                try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                await stopRecording();
              }
            }
            inPeakZoneRef.current = inZone;
          }
        } catch {}
      }, SAMPLE_MS);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to start microphone');
      setIsRecording(false);
    }
  }, [reset, stopRecording]);

  const bf = smoothedDb !== null ? dbToBeaufort(smoothedDb) : 0;
  const knots = smoothedDb !== null ? beaufortToKnots(bf) : null;

  return {
    isRecording,
    isComplete,
    result,
    hasPermission,
    rawDb,
    smoothedDb,
    estimatedKnots: knots !== null ? parseFloat(knots.toFixed(1)) : null,
    beaufortFractional: bf,
    beaufortInfo: getBeaufortInfo(bf),
    windHeadingDeg,
    windCardinal: windHeadingDeg !== null ? headingToCardinal(windHeadingDeg) : null,
    sweepDeg,
    passCount,
    start,
    stop,
    reset,
    error,
  };
}
