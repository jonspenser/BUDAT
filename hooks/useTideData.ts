import { useState, useEffect } from 'react';
import { TIDE_STATION_ID } from '../constants/buoys';

export interface TidePrediction {
  t: string; // "2024-03-20 00:00"
  v: string; // height in feet
}

export interface TideHiLo {
  t: string;
  v: string;
  type: 'H' | 'L';
}

export interface TideData {
  predictions: TidePrediction[];
  hiLo: TideHiLo[];
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function useTideData() {
  const [data, setData] = useState<TideData | null>(null);

  useEffect(() => {
    const base = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';
    const common = `station=${TIDE_STATION_ID}&datum=MLLW&time_zone=lst_ldt&units=english&format=json&product=predictions&begin_date=${todayStr()}&end_date=${todayStr()}`;

    Promise.all([
      fetch(`${base}?${common}&interval=6`).then(r => r.json()),
      fetch(`${base}?${common}&interval=hilo`).then(r => r.json()),
    ]).then(([curve, hilo]) => {
      setData({
        predictions: curve.predictions ?? [],
        hiLo: hilo.predictions ?? [],
      });
    }).catch(() => {});
  }, []);

  return data;
}
