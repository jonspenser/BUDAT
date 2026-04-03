import { useState, useEffect, useCallback } from 'react';

export interface WindReading {
  stationId: string;
  timestamp: string;       // UTC ISO string
  windDirection: number | null;  // degrees true
  windSpeed: number | null;      // m/s
  windGust: number | null;       // m/s
}

function parseMissing(val: number): number | null {
  if (val === 99 || val === 999 || val === 9999 || isNaN(val)) return null;
  return val;
}

function parseWindTxt(text: string, stationId: string): WindReading | null {
  const lines = text.split('\n');
  const dataLines = lines.filter(l => !l.startsWith('#'));
  if (dataLines.length < 3) return null;

  const headers = dataLines[0].trim().split(/\s+/);
  const values = dataLines[2].trim().split(/\s+/);

  const get = (key: string): number | null => {
    const i = headers.indexOf(key);
    if (i === -1 || i >= values.length) return null;
    return parseMissing(parseFloat(values[i]));
  };

  const yr = values[0] ?? '0000';
  const mo = (values[1] ?? '01').padStart(2, '0');
  const dy = (values[2] ?? '01').padStart(2, '0');
  const hr = (values[3] ?? '00').padStart(2, '0');
  const mn = (values[4] ?? '00').padStart(2, '0');

  return {
    stationId,
    timestamp: `${yr}-${mo}-${dy}T${hr}:${mn}:00`,
    windDirection: get('WDIR'),
    windSpeed: get('WSPD'),
    windGust: get('GST'),
  };
}

const NDBC_BASE = 'https://www.ndbc.noaa.gov/data/realtime2/';
const REFRESH_MS = 5 * 60 * 1000;

export function useWindData(stationId: string) {
  const [data, setData] = useState<WindReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (!cancelled) {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch(`${NDBC_BASE}${stationId}.txt`, { cache: 'no-store' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const text = await res.text();
          const parsed = parseWindTxt(text, stationId);
          if (!parsed) throw new Error('Parse error');
          if (!cancelled) setData(parsed);
        } catch (e: any) {
          if (!cancelled) setError(e.message ?? 'Fetch error');
        } finally {
          if (!cancelled) setLoading(false);
        }
        if (!cancelled) timer = setTimeout(run, REFRESH_MS);
      }
    }

    run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stationId]);

  return { data, loading, error, refetch: fetchData };
}
