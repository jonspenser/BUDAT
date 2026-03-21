import { useState, useEffect, useCallback } from 'react';
import { TIDE_STATION_ID } from '../constants/buoys';

export interface KahuluiWindData {
  windDirDeg: number | null;
  windSpeedKts: number | null;
  gustKts: number | null;
  timestamp: string | null;
}

export function useKahuluiWind() {
  const [data, setData] = useState<KahuluiWindData>({
    windDirDeg: null,
    windSpeedKts: null,
    gustKts: null,
    timestamp: null,
  });

  const refresh = useCallback(async () => {
    try {
      const url =
        `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter` +
        `?station=${TIDE_STATION_ID}&product=wind&units=english` +
        `&time_zone=lst_ldt&application=budat&format=json&date=latest`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.data || json.data.length === 0) return;
      const latest = json.data[json.data.length - 1];
      const speed = parseFloat(latest.s);
      const dir = parseFloat(latest.d);
      const gust = parseFloat(latest.g);
      // Timestamp is already in local (Hawaii) time: "YYYY-MM-DD HH:MM"
      const [, timePart] = (latest.t as string).split(' ');
      const [hStr, mStr] = timePart.split(':');
      const h = parseInt(hStr, 10);
      const m = parseInt(mStr, 10);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      const timestamp = `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
      setData({
        windDirDeg: isNaN(dir) ? null : Math.round(dir),
        windSpeedKts: isNaN(speed) ? null : Math.round(speed),
        gustKts: isNaN(gust) ? null : Math.round(gust),
        timestamp,
      });
    } catch {
      // keep previous data on error
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return data;
}
