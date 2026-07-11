import { useState, useCallback, useEffect, useRef } from 'react';
import { Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DirectionPoint {
  id: string;
  detected: number;    // mic-detected wind-from bearing (deg)
  trueHeading: number; // true bearing from the anemometer vane (deg)
  offset: number;      // signed (true - detected), normalized to -180..180
  t: number;
}

export interface DirectionFit {
  meanOffset: number;  // circular-mean signed offset to add to detected headings
  spread: number;      // max deviation from mean (deg) — consistency indicator
  n: number;
}

const STORE_KEY = 'micwind.calibration.direction.v1';

/** Normalize any angle difference to the range (-180, 180]. */
function signedDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function circularMean(angles: number[]): number {
  const s = angles.reduce((a, x) => a + Math.sin((x * Math.PI) / 180), 0);
  const c = angles.reduce((a, x) => a + Math.cos((x * Math.PI) / 180), 0);
  return (Math.atan2(s, c) * 180) / Math.PI;
}

function computeFit(points: DirectionPoint[]): DirectionFit | null {
  if (points.length < 2) return null;
  const offsets = points.map(p => p.offset);
  const meanOffset = circularMean(offsets);
  const spread = Math.max(...offsets.map(o => Math.abs(signedDelta(meanOffset, o))));
  return {
    meanOffset: Math.round(meanOffset * 10) / 10,
    spread: Math.round(spread * 10) / 10,
    n: points.length,
  };
}

export interface DirectionCalibrationState {
  points: DirectionPoint[];
  fit: DirectionFit | null;
  logPoint: (detected: number, trueHeading: number) => void;
  deletePoint: (id: string) => void;
  clear: () => void;
  exportCsv: () => Promise<void>;
}

export function useDirectionCalibration(): DirectionCalibrationState {
  const [points, setPoints] = useState<DirectionPoint[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY).then(raw => {
      if (raw) { try { setPoints(JSON.parse(raw)); } catch {} }
    }).catch(() => {});
  }, []);

  const persist = useCallback((next: DirectionPoint[]) => {
    setPoints(next);
    AsyncStorage.setItem(STORE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const logPoint = useCallback((detected: number, trueHeading: number) => {
    const t = Date.now();
    const d = ((detected % 360) + 360) % 360;
    const tr = ((trueHeading % 360) + 360) % 360;
    const point: DirectionPoint = {
      id: `${t}-${counterRef.current++}`,
      detected: Math.round(d),
      trueHeading: Math.round(tr),
      offset: Math.round(signedDelta(d, tr) * 10) / 10,
      t,
    };
    persist([point, ...points]);
  }, [points, persist]);

  const deletePoint = useCallback((id: string) => {
    persist(points.filter(p => p.id !== id));
  }, [points, persist]);

  const clear = useCallback(() => persist([]), [persist]);

  const exportCsv = useCallback(async () => {
    const header = 'detected_deg,true_deg,offset_deg,timestamp_iso';
    const rows = points
      .slice()
      .sort((a, b) => a.t - b.t)
      .map(p => `${p.detected},${p.trueHeading},${p.offset},${new Date(p.t).toISOString()}`);
    const csv = [header, ...rows].join('\n');
    try { await Share.share({ message: csv }); } catch {}
  }, [points]);

  return { points, fit: computeFit(points), logPoint, deletePoint, clear, exportCsv };
}
