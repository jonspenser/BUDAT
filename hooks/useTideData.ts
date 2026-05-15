import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface TidePrediction {
  time: string;    // "YYYY-MM-DD HH:MM" local time
  height: number;  // feet
  type: 'H' | 'L';
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const REFRESH_MS = 5 * 60 * 1000;
const tideCacheKey = (stationId: string, dayOffset: number) =>
  `@budat/tide_cache/${stationId}/${dayOffset}`;

async function loadCachedTides(stationId: string, dayOffset: number): Promise<TidePrediction[] | null> {
  try {
    const raw = await AsyncStorage.getItem(tideCacheKey(stationId, dayOffset));
    if (!raw) return null;
    return JSON.parse(raw) as TidePrediction[];
  } catch {
    return null;
  }
}

async function saveCachedTides(stationId: string, dayOffset: number, preds: TidePrediction[]): Promise<void> {
  try {
    await AsyncStorage.setItem(tideCacheKey(stationId, dayOffset), JSON.stringify(preds));
  } catch {}
}

export function useTideData(stationId: string, dayOffset = 0) {
  const [predictions, setPredictions] = useState<TidePrediction[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [fromCache, setFromCache]     = useState(false);
  const [fetchTick, setFetchTick]     = useState(0);

  const refetch = () => setFetchTick(t => t + 1);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function run() {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const today = new Date();
        today.setDate(today.getDate() + dayOffset);
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const url =
          `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
          `?product=predictions&application=budat` +
          `&begin_date=${formatDate(yesterday)}` +
          `&end_date=${formatDate(tomorrow)}` +
          `&datum=MLLW&station=${stationId}` +
          `&time_zone=lst_ldt&interval=hilo&units=english&format=json`;

        const res = await fetch(url, { cache: 'no-store' });
        const json = await res.json();

        if (json.error) throw new Error(json.error.message ?? 'Tide API error');

        const preds: TidePrediction[] = (json.predictions ?? []).map((p: any) => ({
          time: p.t,
          height: parseFloat(p.v),
          type: p.type as 'H' | 'L',
        }));

        if (!cancelled) {
          setPredictions(preds);
          setFromCache(false);
          await saveCachedTides(stationId, dayOffset, preds);
        }
      } catch (e: any) {
        if (!cancelled) {
          // Try cached tide data
          const cached = await loadCachedTides(stationId, dayOffset);
          if (cached && cached.length > 0) {
            setPredictions(cached);
            setFromCache(true);
            setError(null);
          } else {
            setError(e.message ?? 'Fetch error');
            setFromCache(false);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) timer = setTimeout(run, REFRESH_MS);
    }

    run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stationId, dayOffset, fetchTick]);

  return { predictions, loading, error, fromCache, refetch };
}
