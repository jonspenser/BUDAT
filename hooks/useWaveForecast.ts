import { useState, useEffect } from 'react';

export interface WaveForecastPoint {
  time: Date;
  heightM: number;
  period: number;
  directionDeg: number;
}

interface ForecastSample {
  time: string;
  value: number;
}

const BASE = 'https://pae-paha.pacioos.hawaii.edu/erddap/griddap/ww3_hawaii_lon180.json';

/** Fetch a single WW3 variable over a date range, return Map<isoTimeStr, value> */
async function fetchVar(
  variable: 'Thgt' | 'Tper' | 'Tdir',
  startISO: string,
  endISO: string,
  gLat: string,
  gLon: string,
): Promise<Map<string, number>> {
  // ERDDAP griddap URL: raw brackets, NOT percent-encoded
  const url = `${BASE}?${variable}[(${startISO}):(${endISO})][0][(${gLat})][(${gLon})]`;
  console.log('[WaveForecast] fetching', variable, url);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} (${variable}): ${body.slice(0, 200)}`);
  }

  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'ERDDAP error');

  const { columnNames, rows } = json.table;
  const ti = columnNames.indexOf('time');
  const vi = columnNames.indexOf(variable);

  const map = new Map<string, number>();
  for (const r of rows) {
    const t = String(r[ti]);
    const v = parseFloat(r[vi]);
    if (!isNaN(v)) map.set(t, v);
  }
  return map;
}

export function useWaveForecast(lat: number, lon: number) {
  const [forecast, setForecast] = useState<WaveForecastPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Snap lat/lon to nearest 0.05° grid
        const gLat = (Math.round(lat / 0.05) * 0.05).toFixed(2);
        const gLon = (Math.round(lon / 0.05) * 0.05).toFixed(2);

        // 5-day window from now (WW3 Hawaii model typically has ~5 days ahead)
        const now = new Date();
        const startISO = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
        const end = new Date(now.getTime() + 5 * 24 * 3600_000);
        const endISO = end.toISOString().replace(/\.\d{3}Z$/, 'Z');

        const [htMap, perMap, dirMap] = await Promise.all([
          fetchVar('Thgt', startISO, endISO, gLat, gLon),
          fetchVar('Tper', startISO, endISO, gLat, gLon),
          fetchVar('Tdir', startISO, endISO, gLat, gLon),
        ]);

        // Merge on time key; use height as the primary timeline
        const pts: WaveForecastPoint[] = [];
        for (const [t, heightM] of htMap) {
          if (heightM <= 0) continue;
          pts.push({
            time:         new Date(t),
            heightM,
            period:       perMap.get(t) ?? 0,
            directionDeg: dirMap.get(t) ?? 0,
          });
        }

        // Sort chronologically
        pts.sort((a, b) => a.time.getTime() - b.time.getTime());

        if (!cancelled) setForecast(pts);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Forecast error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [lat, lon]);

  return { forecast, loading, error };
}
