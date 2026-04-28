import { useState, useEffect, useCallback } from 'react';

export interface WindReading {
  stationId: string;
  dir: number | null;    // degrees true
  speed: number | null;  // knots
  gust: number | null;   // knots
}

const NDBC_BASE = 'https://www.ndbc.noaa.gov/data/realtime2/';
const REFRESH_MS = 5 * 60 * 1000;

function parseWindTxt(text: string, stationId: string): WindReading | null {
  const lines = text.trim().split('\n');
  const headers = lines[0].replace('#', '').trim().split(/\s+/);
  // first data line is line index 2
  const dataLine = lines[2]?.trim().split(/\s+/);
  if (!dataLine) return null;

  const get = (key: string): number | null => {
    const i = headers.indexOf(key);
    if (i === -1 || i >= dataLine.length) return null;
    const v = parseFloat(dataLine[i]);
    if (isNaN(v) || v === 99 || v === 999 || v === 9999) return null;
    return v;
  };

  const wspd = get('WSPD');
  const gst  = get('GST');
  return {
    stationId,
    dir:   get('WDIR'),
    speed: wspd !== null ? wspd * 1.944 : null,  // m/s → knots
    gust:  gst  !== null ? gst  * 1.944 : null,
  };
}

export function useWindData(stationId: string) {
  const [data, setData] = useState<WindReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchTick, setFetchTick] = useState(0);

  const refetch = () => setFetchTick(t => t + 1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${NDBC_BASE}${stationId}.txt`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = parseWindTxt(text, stationId);
      if (!parsed) throw new Error('Parse error');
      setData(parsed);
    } catch (e: any) {
      setError(e.message ?? 'Fetch error');
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function run() {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${NDBC_BASE}${stationId}.txt`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const parsed = parseWindTxt(text, stationId);
        if (parsed && !cancelled) setData(parsed);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Fetch error');
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) timer = setTimeout(run, REFRESH_MS);
    }

    run();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [stationId, fetchTick]);

  return { data, loading, error, refetch };
}
