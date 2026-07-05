import { useState, useCallback } from 'react';
import { BUOY_STATIONS } from '../constants/buoys';
import { BuoyData } from './useNDBCData';

function parseVal(s: string): number | null {
  const n = parseFloat(s);
  return isNaN(n) || s === 'MM' || s === '999' || s === '99.0' || s === '9999' ? null : n;
}

async function fetchHistoricalBuoy(stationId: string, year: number): Promise<BuoyData> {
  const url = `https://www.ndbc.noaa.gov/view_text_file.php?filename=${stationId}h${year}.txt.gz&dir=data/historical/stdmet/`;
  const data: BuoyData = {
    stationId,
    waveHeightFt: null,
    periodSec: null,
    directionDeg: null,
    windDirDeg: null,
    windSpeedKts: null,
    timestamp: null,
  };

  try {
    const res = await fetch(url);
    if (!res.ok) return data;
    const text = await res.text();
    // Skip header lines (start with # or YY/YYYY)
    const lines = text
      .split('\n')
      .filter(l => l.trim() && !l.startsWith('#') && !/^Y/.test(l.trim()));
    if (lines.length === 0) return data;

    // Sample every ~50th row to get a representative spread across the year
    const step = Math.max(1, Math.floor(lines.length / 200));
    const sampled = lines.filter((_, i) => i % step === 0);

    let wvhtSum = 0, wvhtCount = 0;
    let dpdSum = 0, dpdCount = 0;
    let mwdSinSum = 0, mwdCosSum = 0, mwdCount = 0;
    let windDirSinSum = 0, windDirCosSum = 0, windDirCount = 0;
    let windSpeedSum = 0, windSpeedCount = 0;

    for (const line of sampled) {
      const cols = line.trim().split(/\s+/);
      // Historical format: YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD ...
      // or older format without minute column
      if (cols.length < 12) continue;

      const windDir = parseVal(cols[5]);
      const windSpeedMs = parseVal(cols[6]);
      const wvht = parseVal(cols[8]);
      const dpd = parseVal(cols[9]);
      const mwd = parseVal(cols[11]);

      if (wvht !== null && wvht < 20) { wvhtSum += wvht; wvhtCount++; }
      if (dpd !== null && dpd < 30) { dpdSum += dpd; dpdCount++; }
      if (mwd !== null) {
        const rad = (mwd * Math.PI) / 180;
        mwdSinSum += Math.sin(rad);
        mwdCosSum += Math.cos(rad);
        mwdCount++;
      }
      if (windDir !== null) {
        const rad = (windDir * Math.PI) / 180;
        windDirSinSum += Math.sin(rad);
        windDirCosSum += Math.cos(rad);
        windDirCount++;
      }
      if (windSpeedMs !== null && windSpeedMs < 50) {
        windSpeedSum += windSpeedMs;
        windSpeedCount++;
      }
    }

    if (wvhtCount > 0) {
      const avgWvht = wvhtSum / wvhtCount;
      data.waveHeightFt = Math.round(avgWvht * 3.28084 * 10) / 10;
    }
    if (dpdCount > 0) {
      data.periodSec = Math.round((dpdSum / dpdCount) * 10) / 10;
    }
    if (mwdCount > 0) {
      const avg = (Math.atan2(mwdSinSum / mwdCount, mwdCosSum / mwdCount) * 180) / Math.PI;
      data.directionDeg = Math.round((avg + 360) % 360);
    }
    if (windDirCount > 0) {
      const avg = (Math.atan2(windDirSinSum / windDirCount, windDirCosSum / windDirCount) * 180) / Math.PI;
      data.windDirDeg = Math.round((avg + 360) % 360);
    }
    if (windSpeedCount > 0) {
      data.windSpeedKts = Math.round((windSpeedSum / windSpeedCount) * 1.94384);
    }
    data.timestamp = `${year} avg`;
  } catch {
    // network failure — return empty data
  }

  return data;
}

export function useHistoricalData() {
  const [data, setData] = useState<Record<string, BuoyData>>({});
  const [loading, setLoading] = useState(false);
  const [loadedYear, setLoadedYear] = useState<number | null>(null);

  const fetchYear = useCallback(async (year: number) => {
    if (year === loadedYear) return;
    setLoading(true);
    const results = await Promise.allSettled(
      BUOY_STATIONS.map(s => fetchHistoricalBuoy(s.id, year))
    );
    const map: Record<string, BuoyData> = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        map[BUOY_STATIONS[i].id] = r.value;
      }
    });
    setData(map);
    setLoadedYear(year);
    setLoading(false);
  }, [loadedYear]);

  return { data, loading, loadedYear, fetchYear };
}
