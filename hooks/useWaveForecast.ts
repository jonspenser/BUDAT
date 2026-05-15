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
const INFO = 'https://pae-paha.pacioos.hawaii.edu/erddap/info/ww3_hawaii_lon180/index.json';

const FORECAST_VARS = ['Thgt', 'Tper', 'Tdir'] as const;
type ForecastVar = typeof FORECAST_VARS[number];

function forecastUrl(variable: ForecastVar, dims: string): string {
  return `${BASE}?${encodeURIComponent(`${variable}${dims}`)}#`;
}

function isoZ(d: Date): string {
  return d.toISOString().slice(0, 19) + 'Z';
}

function startOfTodayHstUtc(now = new Date()): Date {
  const hst = new Date(now.getTime() - 10 * 3600_000);
  return new Date(Date.UTC(
    hst.getUTCFullYear(),
    hst.getUTCMonth(),
    hst.getUTCDate(),
    10,
    0,
    0,
  ));
}

async function getCoverageEnd(): Promise<Date> {
  const res = await fetch(INFO);
  if (!res.ok) throw new Error(`HTTP ${res.status}: WW3 metadata unavailable`);

  const json = await res.json();
  const row = json.table.rows.find((r: any[]) =>
    r[0] === 'attribute' && r[1] === 'NC_GLOBAL' && r[2] === 'time_coverage_end'
  );
  if (!row?.[4]) throw new Error('WW3 metadata missing time coverage');
  return new Date(row[4]);
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
        const gLat = (Math.round(lat / 0.05) * 0.05).toFixed(2);
        const gLon = (Math.round(lon / 0.05) * 0.05).toFixed(2);

        const now = new Date();
        const start = startOfTodayHstUtc(now);
        const coverageEnd = await getCoverageEnd();
        const end = new Date(Math.min(
          coverageEnd.getTime(),
          now.getTime() + 5 * 24 * 3600_000,
        ));
        if (end <= start) throw new Error('WW3 forecast unavailable');

        const dims = `[(${isoZ(start)}):(${isoZ(end)})][0][(${gLat})][(${gLon})]`;
        const tables: ForecastSample[][] = await Promise.all(FORECAST_VARS.map(async variable => {
          const url = forecastUrl(variable, dims);
          console.log('[WaveForecast] URL:', url);

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

          return rows.map((r: any[]) => ({
            time: String(r[ti]),
            value: parseFloat(r[vi]),
          }));
        }));

        const heights = tables[0];
        const periodsByTime = new Map(tables[1].map(p => [p.time, p.value]));
        const directionsByTime = new Map(tables[2].map(p => [p.time, p.value]));

        const pts: WaveForecastPoint[] = heights
          .filter(p => !isNaN(p.value))
          .map(p => ({
            time:         new Date(p.time),
            heightM:      p.value,
            period:       periodsByTime.get(p.time) ?? 0,
            directionDeg: directionsByTime.get(p.time) ?? 0,
          }));

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
