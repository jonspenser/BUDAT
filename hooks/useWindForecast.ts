import { useState, useEffect } from 'react';

export interface WindForecastPoint {
  time: Date;
  speedKt: number;       // knots
  directionDeg: number;  // coming-from, meteorological convention
}

const BASE = 'https://pae-paha.pacioos.hawaii.edu/erddap/griddap/wrf_hi.json';

async function fetchWindVar(
  variable: 'Uwind' | 'Vwind',
  startISO: string,
  endISO: string,
  gLat: string,
  gLon: string,
): Promise<Map<string, number>> {
  // wrf_hi has no depth dimension: time × lat × lon only
  const url = `${BASE}?${variable}[(${startISO}):(${endISO})][(${gLat})][(${gLon})]`;
  console.log('[WindForecast] fetching', variable, url);

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
    const v = parseFloat(r[vi]);
    if (!isNaN(v)) map.set(String(r[ti]), v);
  }
  return map;
}

export function useWindForecast(lat: number, lon: number) {
  const [forecast, setForecast] = useState<WindForecastPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Snap to nearest WRF grid (0.055° lat × 0.060° lon)
        const gLat = (Math.round(lat / 0.055) * 0.055).toFixed(3);
        const gLon = (Math.round(lon / 0.060) * 0.060).toFixed(3);

        const now = new Date();
        const startISO = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
        const end = new Date(now.getTime() + 5 * 24 * 3600_000);
        const endISO = end.toISOString().replace(/\.\d{3}Z$/, 'Z');

        const [uMap, vMap] = await Promise.all([
          fetchWindVar('Uwind', startISO, endISO, gLat, gLon),
          fetchWindVar('Vwind', startISO, endISO, gLat, gLon),
        ]);

        const pts: WindForecastPoint[] = [];
        for (const [t, u] of uMap) {
          const v = vMap.get(t);
          if (v === undefined) continue;
          const speedMs = Math.sqrt(u * u + v * v);
          const speedKt = speedMs * 1.94384;
          // Meteorological "coming from" direction
          const dirDeg = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
          pts.push({ time: new Date(t), speedKt, directionDeg: dirDeg });
        }

        pts.sort((a, b) => a.time.getTime() - b.time.getTime());

        if (!cancelled) setForecast(pts);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Wind forecast error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [lat, lon]);

  return { forecast, loading, error };
}
