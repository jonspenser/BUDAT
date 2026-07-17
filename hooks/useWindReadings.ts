import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@budat/wind_readings';
const MAX_READINGS = 100;

export interface WindArchiveReading {
  id: string;
  timestamp: string;         // ISO
  knots: number | null;      // null when the estimator had no speed
  headingDeg: number | null; // wind-from direction
  cardinal: string | null;
}

/** Append an anemometer reading to the on-device archive (newest first). */
export async function saveWindReading(
  reading: Omit<WindArchiveReading, 'id'>,
): Promise<WindArchiveReading> {
  const rec: WindArchiveReading = { id: `wind-${Date.now()}`, ...reading };
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list: WindArchiveReading[] = raw ? JSON.parse(raw) : [];
    const next = [rec, ...list].slice(0, MAX_READINGS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  return rec;
}

/** Load the readings archive; bump `refreshKey` to re-read after a save. */
export function useWindReadings(refreshKey = 0): WindArchiveReading[] {
  const [readings, setReadings] = useState<WindArchiveReading[]>([]);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) {
          try { setReadings(JSON.parse(raw)); } catch {}
        }
      })
      .catch(() => {});
  }, [refreshKey]);
  return readings;
}
