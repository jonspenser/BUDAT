import { useState, useEffect, useCallback } from 'react';
import { BUOY_STATIONS, BuoyStation, KAHULUI_WIND_STATION_ID } from '../constants/buoys';

export interface BuoyData {
  stationId: string;
  waveHeightFt: number | null;
  periodSec: number | null;
  directionDeg: number | null;
  windDirDeg: number | null;
  windSpeedKts: number | null;
  timestamp: string | null;
}

function parseVal(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) || s === 'MM' ? null : n;
}

function formatTime(year: string, month: string, day: string, hour: string, min: string): string {
  const d = new Date(Date.UTC(+year, +month - 1, +day, +hour, +min));
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Pacific/Honolulu',
  });
}

async function fetchBuoy(station: BuoyStation): Promise<BuoyData> {
  const url = `https://www.ndbc.noaa.gov/data/realtime2/${station.id}.txt`;
  const res = await fetch(url);
  const text = await res.text();
  const lines = text.split('\n').filter(l => !l.startsWith('#') && l.trim());
  const data: BuoyData = {
    stationId: station.id,
    waveHeightFt: null,
    periodSec: null,
    directionDeg: null,
    windDirDeg: null,
    windSpeedKts: null,
    timestamp: null,
  };
  if (lines.length === 0) return data;
  const cols = lines[0].trim().split(/\s+/);
  if (cols.length < 12) return data;
  const [year, month, day, hour, min] = cols;
  const windDir = parseVal(cols[5]);
  const windSpeedMs = parseVal(cols[6]);
  const wvht = parseVal(cols[8]);
  const dpd = parseVal(cols[9]);
  const mwd = parseVal(cols[11]);
  data.waveHeightFt = wvht !== null ? Math.round(wvht * 3.28084 * 10) / 10 : null;
  data.periodSec = dpd !== null ? Math.round(dpd * 10) / 10 : null;
  data.directionDeg = mwd;
  data.windDirDeg = windDir;
  data.windSpeedKts = windSpeedMs !== null ? Math.round(windSpeedMs * 1.94384) : null;
  data.timestamp = formatTime(year, month, day, hour, min);
  return data;
}

export function useNDBCData() {
  const [data, setData] = useState<Record<string, BuoyData>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const kahuluiWindStation: BuoyStation = {
      id: KAHULUI_WIND_STATION_ID,
      name: 'KAHULUI',
      lat: 20.9,
      lon: -156.47,
      season: ['winter', 'summer'],
    };
    const allStations = [...BUOY_STATIONS, kahuluiWindStation];
    const results = await Promise.allSettled(allStations.map(fetchBuoy));
    const map: Record<string, BuoyData> = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        map[allStations[i].id] = r.value;
      }
    });
    setData(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { data, loading, refresh };
}
