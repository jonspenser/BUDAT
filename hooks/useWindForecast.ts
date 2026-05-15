import { useState, useEffect } from 'react';

export interface WindForecastPoint {
  time: Date;
  speedKt: number;
  directionDeg: number;
}

interface ForecastSample {
  time: string;
  value: number;
}

const BASE = 'https://pae-paha.pacioos.hawaii.edu/erddap/griddap/wrf_hi.json';
const INFO = 'https://pae-paha.pacioos.hawaii.edu/erddap/info/wrf_hi/index.json';

const FORECAST_VARS = ['Uwind', 'Vwind'] as const;
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: WRF metadata unavailable`);

  const json = await res.json();
  const row = json.table.rows.find((r: any[]) =>
    r[0] === 'attribute' && r[1] === 'NC_GLOBAL' && r[2] === 'time_coverage_end'
  );
  if (!row?.[4]) throw new Error('WRF metadata missing time coverage');
  return new Date(row[4]);
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
        const gLat = (Math.round(lat / 0.055) * 0.055).toFixed(3);
        const gLon = (Math.round(lon / 0.060) * 0.060).toFixed(3);

        const now = new Date();
        const start = startOfTodayHstUtc(now);
        const coverageEnd = await getCoverageEnd();
        const end = new Date(Math.min(
          coverageEnd.getTime(),
          now.getTime() + 5 * 24 * 3600_000,
        ));
        if (end <= start) throw new Error('WRF forecast unavailable');

        const dims = `[(${isoZ(start)}):(${isoZ(end)})][(${gLat})][(${gLon})]`;
        const tables: ForecastSample[][] = await Promise.all(FORECAST_VARS.map(async variable => {
          const url = forecastUrl(variable, dims);
          console.log('[WindForecast] URL:', url);

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

        const uByTime = new Map(tables[0].map(p => [p.time, p.value]));
        const vByTime = new Map(tables[1].map(p => [p.time, p.value]));

        const pts: WindForecastPoint[] = [];
        for (const [time, u] of uByTime) {
          const v = vByTime.get(time);
          if (v === undefined) continue;

          const speedMs = Math.sqrt(u * u + v * v);
          const speedKt = speedMs * 1.94384;
          const directionDeg = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
          pts.push({ time: new Date(time), speedKt, directionDeg });
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
