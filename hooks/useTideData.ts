import { useState, useEffect } from 'react';

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

export function useTideData(stationId: string) {
  const [predictions, setPredictions] = useState<TidePrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function run() {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const url =
          `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
          `?product=predictions&application=budat` +
          `&begin_date=${formatDate(today)}` +
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

        if (!cancelled) setPredictions(preds);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Fetch error');
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
  }, [stationId]);

  return { predictions, loading, error };
}
