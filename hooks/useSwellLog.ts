import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BuoyReading } from './useBuoyData';
import { getCardinalDirection } from '../constants/formatters';

const STORAGE_KEY = '@budat/swell_log';

export type SwellCategory = 'S' | 'M' | 'L' | 'XL' | 'XXL';

export interface SwellRecord {
  id: string;
  stationId: string;
  stationName: string;
  timestamp: string;       // ISO string
  heightFt: number;
  category: SwellCategory;
  period: number;          // seconds
  directionDeg: number;
  directionLabel: string;  // cardinal
  speedMph: number;
  // Wind snapshot (from local port station at time of log)
  windKt?: number | null;
  windGustKt?: number | null;
  windDirDeg?: number | null;
  windDirLabel?: string | null;
  // Tide snapshot
  tideHeightFt?: number | null;
  tideLabel?: string | null;   // e.g. "rising" / "falling"
  photoUri?: string;
  audioUri?: string;
  note?: string;
}

// ── Categorize height (meters → category) ────────────────────────────────────

export function categorize(heightFt: number): SwellCategory {
  if (heightFt >= 15) return 'XXL';
  if (heightFt >= 10) return 'XL';
  if (heightFt >= 6)  return 'L';
  if (heightFt >= 3)  return 'M';
  return 'S';
}

/** Deep-water group velocity in mph: Cg = gT/4π × 2.237 */
export function swellSpeedMph(periodS: number): number {
  return (9.81 * periodS / (4 * Math.PI)) * 2.237;
}

// ── Build a record from a BuoyReading ────────────────────────────────────────

export function buildSwellRecord(
  reading: BuoyReading,
  stationId: string,
  stationName: string,
  overrides?: Partial<SwellRecord>,
): SwellRecord {
  const heightM = reading.SwH ?? reading.WVHT ?? 0;
  const heightFt = heightM * 3.28084;
  const period = reading.SwP ?? reading.DPD ?? 0;
  const directionDeg = reading.SwD ?? reading.MWD ?? 0;
  const directionLabel = getCardinalDirection(directionDeg) ?? '--';
  const speedMph = period > 0 ? swellSpeedMph(period) : 0;

  return {
    id: `${stationId}-${reading.timestamp.toISOString()}`,
    stationId,
    stationName,
    timestamp: reading.timestamp.toISOString(),
    heightFt: Math.round(heightFt * 10) / 10,
    category: categorize(heightFt),
    period: Math.round(period * 10) / 10,
    directionDeg,
    directionLabel,
    speedMph: Math.round(speedMph * 10) / 10,
    ...overrides,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSwellLog() {
  const [records, setRecords] = useState<SwellRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) {
        try { setRecords(JSON.parse(val)); } catch {}
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const persist = useCallback((next: SwellRecord[]) => {
    setRecords(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  /** Manually save a swell from the current reading */
  const logSwell = useCallback((
    reading: BuoyReading,
    stationId: string,
    stationName: string,
    overrides?: Partial<SwellRecord>,
  ) => {
    const rec = buildSwellRecord(reading, stationId, stationName, overrides);
    setRecords(prev => {
      // Avoid exact duplicates
      if (prev.some(r => r.id === rec.id)) return prev;
      const next = [rec, ...prev];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    return rec;
  }, []);

  /** Update a record (e.g. attach photo/audio URI) */
  const updateRecord = useCallback((id: string, patch: Partial<SwellRecord>) => {
    setRecords(prev => {
      const next = prev.map(r => r.id === id ? { ...r, ...patch } : r);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const deleteRecord = useCallback((id: string) => {
    setRecords(prev => {
      const next = prev.filter(r => r.id !== id);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setRecords([]);
    AsyncStorage.setItem(STORAGE_KEY, '[]').catch(() => {});
  }, []);

  /**
   * Auto-detect new swells from a stream of readings (newest first).
   * Compares reading[0] to the median of readings[6..18] (6–18 hrs ago at 30min intervals).
   * Returns true if a new swell is detected.
   */
  const detectNewSwell = useCallback((
    history: BuoyReading[],
    stationId: string,
    stationName: string,
    minHeightFt = 2,
  ): SwellRecord | null => {
    if (history.length < 10) return null;
    const current = history[0];
    const currentHtM = current.SwH ?? current.WVHT ?? 0;
    const currentHtFt = currentHtM * 3.28084;
    if (currentHtFt < minHeightFt) return null;

    // Baseline: readings from 6–18 hours ago
    const now = current.timestamp.getTime();
    const baseline = history.filter(r => {
      const age = now - r.timestamp.getTime();
      return age >= 6 * 3600000 && age <= 18 * 3600000;
    }).map(r => r.SwH ?? r.WVHT ?? 0);

    if (baseline.length < 3) return null;
    const sorted = [...baseline].sort((a, b) => a - b);
    const medianM = sorted[Math.floor(sorted.length / 2)];
    const medianFt = medianM * 3.28084;

    // New swell: current is ≥50% higher than baseline AND crosses category up
    if (currentHtFt > medianFt * 1.5 && categorize(currentHtFt) !== categorize(medianFt)) {
      const rec = buildSwellRecord(current, stationId, stationName);
      // Only log if we haven't logged this station in the last 6 hours
      setRecords(prev => {
        const recentForStation = prev.find(r =>
          r.stationId === stationId &&
          now - new Date(r.timestamp).getTime() < 6 * 3600000
        );
        if (recentForStation) return prev;
        const next = [rec, ...prev];
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      return rec;
    }
    return null;
  }, []);

  return { records, loaded, logSwell, updateRecord, deleteRecord, clearAll, detectNewSwell };
}
