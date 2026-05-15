import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// All fields recovered from Hermes bytecode disassembly of original app
export interface BuoyReading {
  stationId: string;
  timestamp: Date;
  // Wave fields
  WVHT: number | null;  // Significant wave height (m)
  SwH:  number | null;  // Swell height (m) — from .spec
  SwP:  number | null;  // Swell period (s) — from .spec
  SwD:  number | null;  // Swell direction (deg) — from .spec
  WWH:  number | null;  // Wind wave height (m)
  WWD:  number | null;  // Wind wave direction (deg)
  MWD:  number | null;  // Mean wave direction (deg)
  DPD:  number | null;  // Dominant period (s)
  // Wind fields
  WDIR: number | null;  // Wind direction (deg)
  WSPD: number | null;  // Wind speed (m/s)
  GST:  number | null;  // Wind gust (m/s)
  // Atmosphere/ocean
  ATMP: number | null;  // Air temp (°C)
  WTMP: number | null;  // Water temp (°C)
  PRES: number | null;  // Pressure (hPa)
}

// Serialized form for AsyncStorage (Date stored as ISO string)
interface BuoyReadingCached extends Omit<BuoyReading, 'timestamp'> {
  timestamp: string;
}

function deserializeRows(raw: BuoyReadingCached[]): BuoyReading[] {
  return raw.map(r => ({ ...r, timestamp: new Date(r.timestamp) }));
}

function parseMissing(val: number): number | null {
  if (val >= 99 && (val === 99 || val === 999 || val === 9999 || val === 99.0 || val === 999.0 || val === 9999.0)) return null;
  if (isNaN(val)) return null;
  return val;
}

function rowKey(YY: string, MM: string, DD: string, hh: string, mm: string): string {
  return `${YY}-${MM}-${DD}-${hh}-${mm}`;
}

// Parse standard met .txt file — returns rows newest-first (up to 150)
function parseNOAAStandardData(text: string, stationId: string): BuoyReading[] {
  const lines = text.trim().split('\n');
  if (lines.length < 3) return [];

  const headers = lines[0].replace('#', '').trim().split(/\s+/);
  const results: BuoyReading[] = [];
  const limit = Math.min(lines.length, 150);

  for (let i = 2; i < limit; i++) {
    const fields = lines[i].trim().split(/\s+/);
    if (fields.length < 5) continue;

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = fields[idx]; });

    if (!obj['YY'] || !obj['MM'] || !obj['DD'] || !obj['hh'] || !obj['mm']) continue;

    let year = parseInt(obj['YY'], 10);
    if (year <= 1000) year += 2000;

    const timestamp = new Date(Date.UTC(
      year,
      parseInt(obj['MM'], 10) - 1,
      parseInt(obj['DD'], 10),
      parseInt(obj['hh'], 10),
      parseInt(obj['mm'], 10),
    ));

    const get = (key: string): number | null => {
      const v = obj[key];
      if (!v) return null;
      return parseMissing(parseFloat(v));
    };

    results.push({
      stationId,
      timestamp,
      WVHT: get('WVHT'),
      SwH:  null,  // filled from .spec below
      SwP:  null,
      SwD:  null,
      WWH:  null,
      WWD:  get('WWD'),
      MWD:  get('MWD'),
      DPD:  get('DPD'),
      WDIR: get('WDIR'),
      WSPD: get('WSPD'),
      GST:  get('GST'),
      ATMP: get('ATMP'),
      WTMP: get('WTMP'),
      PRES: get('PRES'),
    });
  }

  return results;
}

interface SpecRow {
  ts: Date;
  SwH: number | null;
  SwP: number | null;
  SwD: number | null;
  WWH: number | null;
  MWD: number | null;
}

// Parse spectral summary .spec file — returns time-sorted rows (newest first)
function parseNOAASpecData(text: string): SpecRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 3) return [];

  const headers = lines[0].replace('#', '').trim().split(/\s+/);
  const rows: SpecRow[] = [];
  const limit = Math.min(lines.length, 150);

  for (let i = 2; i < limit; i++) {
    const fields = lines[i].trim().split(/\s+/);
    if (fields.length < 5) continue;

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = fields[idx]; });

    if (!obj['YY'] || !obj['MM'] || !obj['DD'] || !obj['hh'] || !obj['mm']) continue;

    const ts = new Date(
      `${obj['YY']}-${obj['MM'].padStart(2,'0')}-${obj['DD'].padStart(2,'0')}` +
      `T${obj['hh'].padStart(2,'0')}:${obj['mm'].padStart(2,'0')}:00Z`
    );
    if (isNaN(ts.getTime())) continue;

    const get = (k: string): number | null => {
      const v = obj[k];
      if (!v) return null;
      const n = parseFloat(v);
      return parseMissing(n);
    };

    rows.push({ ts, SwH: get('SwH'), SwP: get('SwP'), SwD: get('SwD'), WWH: get('WWH'), MWD: get('MWD') });
  }

  return rows;
}

// Find the closest spec row within a 30-minute window
const SPEC_TOLERANCE_MS = 30 * 60 * 1000;
function closestSpecRow(rows: SpecRow[], target: Date): SpecRow | null {
  let best: SpecRow | null = null;
  let bestDiff = SPEC_TOLERANCE_MS + 1;
  for (const row of rows) {
    const diff = Math.abs(row.ts.getTime() - target.getTime());
    if (diff < bestDiff) { best = row; bestDiff = diff; }
  }
  return bestDiff <= SPEC_TOLERANCE_MS ? best : null;
}

const NDBC_BASE = 'https://www.ndbc.noaa.gov/data/realtime2/';
const REFRESH_MS = 5 * 60 * 1000;
const cacheKey = (id: string) => `@budat/buoy_cache/v2/${id}`;

function hasWaveData(row: BuoyReading): boolean {
  return row.SwH !== null || row.WVHT !== null || row.SwP !== null || row.DPD !== null || row.MWD !== null;
}

function latestWaveReading(rows: BuoyReading[]): BuoyReading | null {
  return rows.find(hasWaveData) ?? rows[0] ?? null;
}

function displayWaveRows(rows: BuoyReading[]): BuoyReading[] {
  const waveRows = rows.filter(hasWaveData);
  return waveRows.length > 0 ? waveRows : rows;
}

export async function fetchBuoyRows(stationId: string): Promise<BuoyReading[]> {
  const [txtRes, specRes] = await Promise.all([
    fetch(`${NDBC_BASE}${stationId}.txt`, { cache: 'no-store' }),
    fetch(`${NDBC_BASE}${stationId}.spec`, { cache: 'no-store' }).catch(() => null),
  ]);

  if (!txtRes.ok) throw new Error(`HTTP ${txtRes.status}`);
  const txtText = await txtRes.text();
  const rows = parseNOAAStandardData(txtText, stationId);
  if (rows.length === 0) throw new Error('Parse error');

  // Merge spec data if available — use closest-match within 30 min
  if (specRes?.ok) {
    const specText = await specRes.text();
    const specRows = parseNOAASpecData(specText);
    for (const row of rows) {
      const spec = closestSpecRow(specRows, row.timestamp);
      if (spec) {
        row.SwH  = spec.SwH;
        row.SwP  = spec.SwP;
        row.SwD  = spec.SwD;
        row.WWH  = spec.WWH;
        if (spec.MWD !== null) row.MWD = spec.MWD;
      }
    }
  }

  return rows;
}

async function loadCachedRows(stationId: string): Promise<BuoyReading[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(stationId));
    if (!raw) return null;
    const parsed: BuoyReadingCached[] = JSON.parse(raw);
    return deserializeRows(parsed);
  } catch {
    return null;
  }
}

async function saveCachedRows(stationId: string, rows: BuoyReading[]): Promise<void> {
  try {
    const serialized: BuoyReadingCached[] = rows.map(r => ({
      ...r,
      timestamp: r.timestamp.toISOString(),
    }));
    await AsyncStorage.setItem(cacheKey(stationId), JSON.stringify(serialized));
  } catch {}
}

export function useBuoyData(stationId: string) {
  const [data, setData]           = useState<BuoyReading | null>(null);
  const [history, setHistory]     = useState<BuoyReading[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchBuoyRows(stationId);
      const displayRows = displayWaveRows(rows);
      setData(latestWaveReading(displayRows));
      setHistory(displayRows);
      setFromCache(false);
      await saveCachedRows(stationId, displayRows);
    } catch (e: any) {
      // Network failure — try to serve from cache
      const cached = await loadCachedRows(stationId);
      if (cached && cached.length > 0) {
        const displayRows = displayWaveRows(cached);
        setData(latestWaveReading(displayRows));
        setHistory(displayRows);
        setFromCache(true);
        setError(null);
      } else {
        setError(e.message ?? 'Fetch error');
        setFromCache(false);
      }
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function run() {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchBuoyRows(stationId);
        const displayRows = displayWaveRows(rows);
        if (!cancelled) {
          setData(latestWaveReading(displayRows));
          setHistory(displayRows);
          setFromCache(false);
          await saveCachedRows(stationId, displayRows);
        }
      } catch (e: any) {
        if (!cancelled) {
          // Network failure — try cache
          const cached = await loadCachedRows(stationId);
          if (cached && cached.length > 0) {
            const displayRows = displayWaveRows(cached);
            setData(latestWaveReading(displayRows));
            setHistory(displayRows);
            setFromCache(true);
            setError(null);
          } else {
            setError(e.message ?? 'Fetch error');
            setFromCache(false);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) timer = setTimeout(run, REFRESH_MS);
    }

    run();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [stationId]);

  return { data, history, loading, error, fromCache, refetch: fetchData };
}
