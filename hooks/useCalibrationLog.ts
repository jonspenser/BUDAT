import { useState, useRef, useCallback, useEffect } from 'react';
import { Audio } from 'expo-av';
import { Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CalibrationPoint {
  id: string;
  trueKnots: number;
  dbAvg: number;   // mean dBFS over the averaging window at capture time
  dbMin: number;
  dbMax: number;
  samples: number;
  t: number;       // epoch ms
}

export interface CalibrationFit {
  A: number;                    // model: dB = A + B * log10(knots)
  B: number;
  r2: number;
  n: number;
  breakpoints: [number, number][]; // regenerated DB_BREAKPOINTS for useMicWind
}

const STORE_KEY = 'micwind.calibration.points.v1';
const ALPHA = 0.12;          // EMA for the live instantaneous reading
const SAMPLE_MS = 150;
const AVG_WINDOW_MS = 5000;  // capture averages dBFS over the last 5s

// Beaufort lower-bound knots (levels 0–8) — mirrors BEAUFORT knotsMin in useMicWind
const BEAUFORT_KNOTS_MIN = [0, 1, 4, 7, 11, 17, 22, 28, 34];

const round2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Least-squares fit of dB = A + B*log10(knots) over logged points (knots > 0),
 * then regenerate DB_BREAKPOINTS by solving for the dB at each Beaufort's lower
 * knots bound. Sound power rises ~linearly with log(windspeed), so this 2-param
 * model fits well with only a handful of points.
 */
function computeFit(points: CalibrationPoint[]): CalibrationFit | null {
  const pts = points.filter(p => p.trueKnots > 0);
  if (pts.length < 3) return null;

  const xs = pts.map(p => Math.log10(p.trueKnots));
  const ys = pts.map(p => p.dbAvg);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;

  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0) return null; // all points at the same speed — can't fit a slope
  const B = sxy / sxx;
  const A = my - B * mx;

  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yhat = A + B * xs[i];
    ssRes += (ys[i] - yhat) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  const breakpoints = BEAUFORT_KNOTS_MIN.map((k, bf) => {
    const kk = k === 0 ? 0.5 : k; // floor so log10 is finite at Beaufort 0
    return [Math.round(A + B * Math.log10(kk)), bf] as [number, number];
  });

  return { A: round2(A), B: round2(B), r2: round2(r2), n, breakpoints };
}

export interface CalibrationLogState {
  isRecording: boolean;
  smoothedDb: number | null;
  dbAvg: number | null;
  dbMin: number | null;
  dbMax: number | null;
  points: CalibrationPoint[];
  fit: CalibrationFit | null;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  logPoint: (trueKnots: number) => void;
  deletePoint: (id: string) => void;
  clear: () => void;
  exportCsv: () => Promise<void>;
}

export function useCalibrationLog(): CalibrationLogState {
  const [isRecording, setIsRecording] = useState(false);
  const [smoothedDb, setSmoothedDb] = useState<number | null>(null);
  const [dbAvg, setDbAvg] = useState<number | null>(null);
  const [dbMin, setDbMin] = useState<number | null>(null);
  const [dbMax, setDbMax] = useState<number | null>(null);
  const [points, setPoints] = useState<CalibrationPoint[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const smoothedRef = useRef<number | null>(null);
  const windowRef = useRef<{ db: number; t: number }[]>([]);
  const counterRef = useRef(0);

  // Load persisted points once
  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY).then(raw => {
      if (raw) {
        try { setPoints(JSON.parse(raw)); } catch {}
      }
    }).catch(() => {});
  }, []);

  const persist = useCallback((next: CalibrationPoint[]) => {
    setPoints(next);
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { setError('Microphone permission denied'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      await rec.startAsync();
      recordingRef.current = rec;
      smoothedRef.current = null;
      windowRef.current = [];
      setIsRecording(true);

      intervalRef.current = setInterval(async () => {
        try {
          const st = await rec.getStatusAsync();
          if (!st.isRecording) return;
          const db = st.metering ?? -160;

          const prev = smoothedRef.current;
          const next = prev === null ? db : prev + ALPHA * (db - prev);
          smoothedRef.current = next;
          setSmoothedDb(next);

          const now = Date.now();
          windowRef.current.push({ db, t: now });
          windowRef.current = windowRef.current.filter(s => now - s.t < AVG_WINDOW_MS);
          const arr = windowRef.current.map(s => s.db);
          setDbAvg(arr.reduce((a, b) => a + b, 0) / arr.length);
          setDbMin(Math.min(...arr));
          setDbMax(Math.max(...arr));
        } catch {}
      }, SAMPLE_MS);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to start microphone');
      setIsRecording(false);
    }
  }, []);

  const stop = useCallback(async () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (recordingRef.current) {
      try { await recordingRef.current.stopAndUnloadAsync(); } catch {}
      recordingRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const logPoint = useCallback((trueKnots: number) => {
    if (dbAvg === null) return;
    const t = Date.now();
    const point: CalibrationPoint = {
      id: `${t}-${counterRef.current++}`,
      trueKnots,
      dbAvg: round2(dbAvg),
      dbMin: round2(dbMin ?? dbAvg),
      dbMax: round2(dbMax ?? dbAvg),
      samples: windowRef.current.length,
      t,
    };
    persist([point, ...points]);
  }, [dbAvg, dbMin, dbMax, points, persist]);

  const deletePoint = useCallback((id: string) => {
    persist(points.filter(p => p.id !== id));
  }, [points, persist]);

  const clear = useCallback(() => persist([]), [persist]);

  const exportCsv = useCallback(async () => {
    const header = 'true_knots,db_avg,db_min,db_max,samples,timestamp_iso';
    const rows = points
      .slice()
      .sort((a, b) => a.trueKnots - b.trueKnots)
      .map(p => `${p.trueKnots},${p.dbAvg},${p.dbMin},${p.dbMax},${p.samples},${new Date(p.t).toISOString()}`);
    const csv = [header, ...rows].join('\n');
    try {
      await Share.share({ message: csv });
    } catch (e: any) {
      setError(e?.message ?? 'Export failed');
    }
  }, [points]);

  // Clean up recorder if unmounted mid-session
  useEffect(() => () => { stop(); }, [stop]);

  return {
    isRecording,
    smoothedDb,
    dbAvg,
    dbMin,
    dbMax,
    points,
    fit: computeFit(points),
    error,
    start,
    stop,
    logPoint,
    deletePoint,
    clear,
    exportCsv,
  };
}
