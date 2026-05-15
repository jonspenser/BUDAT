import { useState, useEffect } from 'react';
import { BuoyReading, fetchBuoyRows } from './useBuoyData';

// Module-level cache: stationId -> { rows, fetchedAt }
const rowsCache: Record<string, { rows: BuoyReading[]; fetchedAt: number }> = {};
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

async function getRowsForStation(stationId: string): Promise<BuoyReading[]> {
  const cached = rowsCache[stationId];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rows;
  }
  // fetchBuoyRows already fetches up to 150 rows (~5-6 days of hourly data from realtime2)
  const rows = await fetchBuoyRows(stationId);
  rowsCache[stationId] = { rows, fetchedAt: Date.now() };
  return rows;
}

// Find the row closest to a target time, within ±2 hours
const MAX_DIFF_MS = 2 * 60 * 60 * 1000;

function closestToTarget(rows: BuoyReading[], target: Date): BuoyReading | null {
  let best: BuoyReading | null = null;
  let bestDiff = MAX_DIFF_MS + 1;
  // Match by time-of-day: compare hour+minute on the target date
  const targetHour = target.getUTCHours();
  const targetMin = target.getUTCMinutes();
  for (const row of rows) {
    // Check same time-of-day on the same date first (exact match on overlay date)
    const rowDate = row.timestamp;
    const sameDate =
      rowDate.getUTCFullYear() === target.getUTCFullYear() &&
      rowDate.getUTCMonth() === target.getUTCMonth() &&
      rowDate.getUTCDate() === target.getUTCDate();
    if (sameDate) {
      const diff = Math.abs(
        rowDate.getUTCHours() * 60 + rowDate.getUTCMinutes() -
        (targetHour * 60 + targetMin)
      ) * 60 * 1000;
      if (diff < bestDiff) { best = row; bestDiff = diff; }
    }
  }
  return bestDiff <= MAX_DIFF_MS ? best : null;
}

export function useHistoricalBuoyData(
  stationIds: string[],
  overlayDate: Date | null,
): { data: Record<string, BuoyReading | null>; loading: boolean; error: string | null } {
  const [data, setData] = useState<Record<string, BuoyReading | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!overlayDate) {
      setData({});
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(
      stationIds.map(async (id) => {
        try {
          const rows = await getRowsForStation(id);
          const match = closestToTarget(rows, overlayDate);
          return { id, reading: match };
        } catch {
          return { id, reading: null };
        }
      })
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, BuoyReading | null> = {};
      for (const { id, reading } of results) map[id] = reading;
      setData(map);
      setLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      setError(e?.message ?? 'Fetch error');
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [stationIds.join(','), overlayDate?.toISOString()]);

  return { data, loading, error };
}
