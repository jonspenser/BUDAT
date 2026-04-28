import { useState, useEffect } from 'react';

export interface WaveForecastPoint {
  time: Date;
  heightM: number;
  period: number;
  directionDeg: number;
}

const BASE = 'https://pae-paha.pacioos.hawaii.edu/erddap/griddap/ww3_hawaii_lon180.json';

function isoZ(d: Date): string {
  return d.toISOString().slice(0, 19) + 'Z';
}

/** ERDDAP griddap requires brackets in the query — percent-encode them so
 *  React Native's fetch doesn't mangle them. */
function erddapQuery(vars: string, dims: string): string {
  // dims looks like: [(t1):(t2)][0][(lat)][(lon)]
  // Encode [ and ] so they survive React Native's URL handling
  const encoded = dims
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D');
  return `${vars}${encoded}`;
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
        now.setMinutes(0, 0, 0);
        const start = isoZ(now);
        const end   = isoZ(new Date(now.getTime() + 7 * 24 * 3600_000));

        const dims = `[(${start}):(${end})][0][(${gLat})][(${gLon})]`;
        const query = erddapQuery('Thgt,Tper,Tdir', dims);
        const url = `${BASE}?${query}`;

        console.log('[WaveForecast] URL:', url);

        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
        }
        const json = await res.json();
        if (json.error) throw new Error(json.error.message ?? 'ERDDAP error');

        const { columnNames, rows } = json.table;
        const ti = columnNames.indexOf('time');
        const hi = columnNames.indexOf('Thgt');
        const pi = columnNames.indexOf('Tper');
        const di = columnNames.indexOf('Tdir');

        const pts: WaveForecastPoint[] = rows
          .filter((r: any[]) => r[hi] != null && !isNaN(parseFloat(r[hi])))
          .map((r: any[]) => ({
            time:         new Date(r[ti]),
            heightM:      parseFloat(r[hi]),
            period:       parseFloat(r[pi]) || 0,
            directionDeg: parseFloat(r[di]) || 0,
          }));

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
