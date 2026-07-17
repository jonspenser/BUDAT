import { useState, useEffect } from 'react';

export interface OpenMeteoPoint {
  time: Date;
  waveHeightM: number;
  wavePeriod: number;
  waveDirection: number;
  swellHeightM: number;
  swellPeriod: number;
  swellDirection: number;
  windWaveHeightM: number;
  windWavePeriod: number;
  windWaveDirection: number;
}

const BASE = 'https://marine-api.open-meteo.com/v1/marine';
const VARS = [
  'wave_height', 'wave_period', 'wave_direction',
  'swell_wave_height', 'swell_wave_period', 'swell_wave_direction',
  'wind_wave_height', 'wind_wave_period', 'wind_wave_direction',
].join(',');

export function useOpenMeteoForecast(lat: number, lon: number) {
  const [forecast, setForecast] = useState<OpenMeteoPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = `${BASE}?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&hourly=${VARS}&forecast_days=7`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(json.reason ?? 'Open-Meteo error');

        const h = json.hourly as Record<string, (number | null)[]>;
        const times = (json.hourly.time as string[]);
        const pts: OpenMeteoPoint[] = times
          .map((t, i) => ({
            time:             new Date(t),
            waveHeightM:      h.wave_height[i] ?? 0,
            wavePeriod:       h.wave_period[i] ?? 0,
            waveDirection:    h.wave_direction[i] ?? 0,
            swellHeightM:     h.swell_wave_height[i] ?? 0,
            swellPeriod:      h.swell_wave_period[i] ?? 0,
            swellDirection:   h.swell_wave_direction[i] ?? 0,
            windWaveHeightM:  h.wind_wave_height[i] ?? 0,
            windWavePeriod:   h.wind_wave_period[i] ?? 0,
            windWaveDirection:h.wind_wave_direction[i] ?? 0,
          }))
          .filter(p => p.waveHeightM > 0);

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
