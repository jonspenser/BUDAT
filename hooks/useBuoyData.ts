import { useState, useEffect, useCallback } from 'react';

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

// Parse spectral summary .spec file — returns Map keyed by timestamp string
function parseNOAASpecData(text: string): Map<string, { SwH: number | null; SwP: number | null; WWH: number | null; MWD: number | null }> {
  const lines = text.trim().split('\n');
  const result = new Map<string, { SwH: number | null; SwP: number | null; WWH: number | null; MWD: number | null }>();
  if (lines.length < 3) return result;

  const headers = lines[0].replace('#', '').trim().split(/\s+/);
  const limit = Math.min(lines.length, 150);

  for (let i = 2; i < limit; i++) {
    const fields = lines[i].trim().split(/\s+/);
    if (fields.length < 5) continue;

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h] = fields[idx]; });

    if (!obj['YY'] || !obj['MM'] || !obj['DD'] || !obj['hh'] || !obj['mm']) continue;

    const key = rowKey(obj['YY'], obj['MM'], obj['DD'], obj['hh'], obj['mm']);

    const get = (k: string): number | null => {
      const v = obj[k];
      if (!v) return null;
      const n = parseFloat(v);
      return parseMissing(n);
    };

    result.set(key, {
      SwH: get('SwH'),
      SwP: get('SwP'),
      WWH: get('WWH'),
      MWD: get('MWD'),
    });
  }

  return result;
}

function specKey(ts: Date): string {
  const YY = String(ts.getUTCFullYear()); // match 4-digit year used in NDBC files
  const MM = String(ts.getUTCMonth() + 1).padStart(2, '0');
  const DD = String(ts.getUTCDate()).padStart(2, '0');
  const hh = String(ts.getUTCHours()).padStart(2, '0');
  const mm = String(ts.getUTCMinutes()).padStart(2, '0');
  return `${YY}-${MM}-${DD}-${hh}-${mm}`;
}

const NDBC_BASE = 'https://www.ndbc.noaa.gov/data/realtime2/';
const REFRESH_MS = 5 * 60 * 1000;

export async function fetchBuoyRows(stationId: string): Promise<BuoyReading[]> {
  const [txtRes, specRes] = await Promise.all([
    fetch(`${NDBC_BASE}${stationId}.txt`, { cache: 'no-store' }),
    fetch(`${NDBC_BASE}${stationId}.spec`, { cache: 'no-store' }).catch(() => null),
  ]);

  if (!txtRes.ok) throw new Error(`HTTP ${txtRes.status}`);
  const txtText = await txtRes.text();
  const rows = parseNOAAStandardData(txtText, stationId);
  if (rows.length === 0) throw new Error('Parse error');

  // Merge spec data if available
  if (specRes?.ok) {
    const specText = await specRes.text();
    const specMap = parseNOAASpecData(specText);
    for (const row of rows) {
      const key = specKey(row.timestamp);
      const spec = specMap.get(key);
      if (spec) {
        row.SwH  = spec.SwH;
        row.SwP  = spec.SwP;
        row.WWH  = spec.WWH;
        if (spec.MWD !== null) row.MWD = spec.MWD;
      }
    }
  }

  return rows;
}

export function useBuoyData(stationId: string) {
  const [data, setData]       = useState<BuoyReading | null>(null);
  const [history, setHistory] = useState<BuoyReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchBuoyRows(stationId);
      setData(rows[0]);
      setHistory(rows);
    } catch (e: any) {
      setError(e.message ?? 'Fetch error');
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
        if (!cancelled) { setData(rows[0]); setHistory(rows); }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Fetch error');
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) timer = setTimeout(run, REFRESH_MS);
    }

    run();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [stationId]);

  return { data, history, loading, error, refetch: fetchData };
}
