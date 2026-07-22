import { useState, useEffect } from 'react';
import pako from 'pako';
import { BuoyReading } from './useBuoyData';
import { HistoricalDate } from '../components/HistoricalDateEntry';

// NDBC publishes one gzipped standard-meteorological file per station per year.
// Column layout has shifted over the decades (WD→WDIR, BAR→PRES, added `mm`
// minute column ~2007), so headers are read from the file itself rather than
// assumed — same defensive approach as useBuoyData's realtime parser.
const HISTORICAL_BASE = 'https://www.ndbc.noaa.gov/data/historical/stdmet/';

interface FieldSpec {
  missing: number;
  min: number;
  max: number;
}

// Per-field missing-value sentinel + a sanity range — old archive years mix
// conventions, so a value outside physical bounds is dropped like a fill value.
const FIELD_SPECS: Record<string, FieldSpec> = {
  WVHT: { missing: 99,   min: 0,    max: 20 },
  DPD:  { missing: 99,   min: 0,    max: 30 },
  APD:  { missing: 99,   min: 0,    max: 30 },
  MWD:  { missing: 999,  min: 0,    max: 360 },
  WDIR: { missing: 999,  min: 0,    max: 360 },
  WSPD: { missing: 99,   min: 0,    max: 60 },
  GST:  { missing: 99,   min: 0,    max: 75 },
  PRES: { missing: 9999, min: 900,  max: 1100 },
  ATMP: { missing: 999,  min: -10,  max: 45 },
  WTMP: { missing: 999,  min: -5,   max: 40 },
};

function parseField(raw: string | undefined, spec: FieldSpec): number | null {
  if (!raw) return null;
  const v = parseFloat(raw);
  if (isNaN(v)) return null;
  if (Math.abs(v - spec.missing) < 0.05) return null;
  if (v < spec.min || v > spec.max) return null;
  return v;
}

function arithmeticMean(vals: number[]): number | null {
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Circular mean so e.g. 359° and 1° average to 0°, not 180°.
function circularMeanDeg(degs: number[]): number | null {
  if (degs.length === 0) return null;
  let sumSin = 0;
  let sumCos = 0;
  for (const d of degs) {
    const r = (d * Math.PI) / 180;
    sumSin += Math.sin(r);
    sumCos += Math.cos(r);
  }
  const meanRad = Math.atan2(sumSin / degs.length, sumCos / degs.length);
  const meanDeg = (meanRad * 180) / Math.PI;
  return ((meanDeg % 360) + 360) % 360;
}

function parseHistoricalRow(headers: string[], fields: string[]): Record<string, number | null> | null {
  if (fields.length < headers.length - 2) return null; // tolerate a missing trailing column
  const obj: Record<string, string> = {};
  headers.forEach((h, i) => { obj[h] = fields[i]; });

  const get = (key: string, alias?: string): number | null => {
    const raw = obj[key] ?? (alias ? obj[alias] : undefined);
    return parseField(raw, FIELD_SPECS[key]);
  };

  return {
    WVHT: get('WVHT'),
    DPD:  get('DPD'),
    MWD:  get('MWD'),
    WDIR: get('WDIR', 'WD'),
    WSPD: get('WSPD'),
    GST:  get('GST'),
    ATMP: get('ATMP'),
    WTMP: get('WTMP'),
    PRES: get('PRES', 'BAR'),
  };
}

interface FileStructure {
  rawLines: string[];
  headers: string[];
  dataStart: number;
}

function parseFileStructure(text: string): FileStructure | null {
  const rawLines = text.split('\n');

  let headerLine = -1;
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) headerLine = i;
    break;
  }
  if (headerLine === -1) return null;

  const headers = rawLines[headerLine].replace('#', '').trim().split(/\s+/);
  let dataStart = headerLine + 1;
  if (rawLines[dataStart]?.trim().startsWith('#')) dataStart++; // units line

  return { rawLines, headers, dataStart };
}

/** All observations for one calendar day, averaged into a single reading. */
export function summarizeHistoricalDate(text: string, stationId: string, date: HistoricalDate): BuoyReading | null {
  const structure = parseFileStructure(text);
  if (!structure) return null;
  const { rawLines, headers, dataStart } = structure;

  const monthIdx = headers.indexOf('MM');
  const dayIdx = headers.indexOf('DD');
  if (monthIdx === -1 || dayIdx === -1) return null;

  // Cheap month/day filter on the split fields before full row parsing —
  // a year file has ~9k rows, the requested day only ~24–144.
  const dayRows: string[][] = [];
  for (let i = dataStart; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;
    const fields = line.split(/\s+/);
    if (parseInt(fields[monthIdx], 10) !== date.month) continue;
    if (parseInt(fields[dayIdx], 10) !== date.day) continue;
    dayRows.push(fields);
  }
  if (dayRows.length === 0) return null;

  const heights: number[] = [];
  const periods: number[] = [];
  const waveDirs: number[] = [];
  const speeds: number[] = [];
  const gusts: number[] = [];
  const windDirs: number[] = [];
  const atmps: number[] = [];
  const wtmps: number[] = [];
  const pressures: number[] = [];

  for (const fields of dayRows) {
    const row = parseHistoricalRow(headers, fields);
    if (!row) continue;
    if (row.WVHT !== null) heights.push(row.WVHT);
    if (row.DPD  !== null) periods.push(row.DPD);
    if (row.MWD  !== null) waveDirs.push(row.MWD);
    if (row.WSPD !== null) speeds.push(row.WSPD);
    if (row.GST  !== null) gusts.push(row.GST);
    if (row.WDIR !== null) windDirs.push(row.WDIR);
    if (row.ATMP !== null) atmps.push(row.ATMP);
    if (row.WTMP !== null) wtmps.push(row.WTMP);
    if (row.PRES !== null) pressures.push(row.PRES);
  }

  if (heights.length === 0 && speeds.length === 0) return null;

  const waveHt  = arithmeticMean(heights);
  const wavePd  = arithmeticMean(periods);
  const waveDir = circularMeanDeg(waveDirs);

  return {
    stationId,
    timestamp: new Date(Date.UTC(date.year, date.month - 1, date.day, 12)),
    // Historical stdmet files don't split swell vs. wind-wave the way realtime2
    // .spec files do — mirror the wave summary into SwH/SwP/SwD so map/detail
    // components (which prefer SwH ?? WVHT etc.) render without extra branching.
    WVHT: waveHt,
    SwH:  waveHt,
    SwP:  wavePd,
    SwD:  waveDir,
    WWH:  null,
    WWD:  null,
    MWD:  waveDir,
    DPD:  wavePd,
    WDIR: circularMeanDeg(windDirs),
    WSPD: arithmeticMean(speeds),
    GST:  arithmeticMean(gusts),
    ATMP: arithmeticMean(atmps),
    WTMP: arithmeticMean(wtmps),
    PRES: arithmeticMean(pressures),
  };
}

// How far a row may be from the requested hour and still count as a match —
// generous enough for the 6-hourly cadence of some early archive years.
const HOUR_MATCH_TOLERANCE_MS = 3 * 60 * 60 * 1000;

/** The single observation closest to the requested HST hour on the given day. */
export function readingClosestToHour(text: string, stationId: string, date: HistoricalDate, hstHour: number): BuoyReading | null {
  const structure = parseFileStructure(text);
  if (!structure) return null;
  const { rawLines, headers, dataStart } = structure;

  const monthIdx = headers.indexOf('MM');
  const dayIdx = headers.indexOf('DD');
  const hourIdx = headers.indexOf('hh');
  const minIdx = headers.indexOf('mm'); // absent pre-2005 (readings on the hour)
  if (monthIdx === -1 || dayIdx === -1 || hourIdx === -1) return null;

  // The entered hour is HST; file timestamps are UTC. Date.UTC normalizes the
  // +10h overflow into the next day/month as needed.
  const targetMs = Date.UTC(date.year, date.month - 1, date.day, hstHour + 10);

  // Prune to the (at most two) UTC calendar days the tolerance window can
  // touch before doing the expensive per-row Date.UTC diff — a year file has
  // thousands of rows and scanning all of them per lookup is what made
  // switching hours feel laggy.
  const dayKey = (ms: number) => {
    const d = new Date(ms);
    return d.getUTCMonth() * 100 + d.getUTCDate();
  };
  const candidateDays = new Set([
    dayKey(targetMs - HOUR_MATCH_TOLERANCE_MS),
    dayKey(targetMs),
    dayKey(targetMs + HOUR_MATCH_TOLERANCE_MS),
  ]);

  let bestFields: string[] | null = null;
  let bestMs = 0;
  let bestDiff = HOUR_MATCH_TOLERANCE_MS + 1;

  for (let i = dataStart; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;
    const fields = line.split(/\s+/);
    const month = parseInt(fields[monthIdx], 10);
    const day = parseInt(fields[dayIdx], 10);
    if (!candidateDays.has((month - 1) * 100 + day)) continue;
    let year = parseInt(fields[0], 10);
    if (isNaN(year)) continue;
    if (year < 100) year += 2000; // legacy 2-digit years
    const ms = Date.UTC(
      year,
      month - 1,
      day,
      parseInt(fields[hourIdx], 10),
      minIdx !== -1 ? parseInt(fields[minIdx], 10) : 0,
    );
    if (isNaN(ms)) continue;
    const diff = Math.abs(ms - targetMs);
    if (diff < bestDiff) { bestFields = fields; bestMs = ms; bestDiff = diff; }
  }

  if (!bestFields) return null;
  const row = parseHistoricalRow(headers, bestFields);
  if (!row) return null;
  if (row.WVHT === null && row.WSPD === null) return null;

  return {
    stationId,
    timestamp: new Date(bestMs),
    WVHT: row.WVHT,
    SwH:  row.WVHT,
    SwP:  row.DPD,
    SwD:  row.MWD,
    WWH:  null,
    WWD:  null,
    MWD:  row.MWD,
    DPD:  row.DPD,
    WDIR: row.WDIR,
    WSPD: row.WSPD,
    GST:  row.GST,
    ATMP: row.ATMP,
    WTMP: row.WTMP,
    PRES: row.PRES,
  };
}

// Two-level module cache: raw year files (one NDBC hit per station-year, ever)
// and per-date summaries derived from them — revisiting any date is instant.
const yearTextCache: Record<string, string | null> = {};
const summaryCache: Record<string, BuoyReading | null> = {};
const yearKey = (stationId: string, year: number) => `${stationId}_${year}`;
const dateKey = (stationId: string, d: HistoricalDate) =>
  `${stationId}_${d.year}-${d.month}-${d.day}${d.hour != null ? `T${d.hour}` : ''}`;

async function fetchStationYearText(stationId: string, year: number): Promise<string | null> {
  const key = yearKey(stationId, year);
  if (key in yearTextCache) return yearTextCache[key];
  try {
    const url = `${HISTORICAL_BASE}${stationId}h${year}.txt.gz`;
    const res = await fetch(url);
    if (!res.ok) { yearTextCache[key] = null; return null; }
    const buf = await res.arrayBuffer();
    const text = pako.ungzip(new Uint8Array(buf), { to: 'string' });
    yearTextCache[key] = text;
    return text;
  } catch {
    yearTextCache[key] = null;
    return null;
  }
}

async function fetchStationDate(stationId: string, date: HistoricalDate): Promise<BuoyReading | null> {
  const key = dateKey(stationId, date);
  if (key in summaryCache) return summaryCache[key];
  const text = await fetchStationYearText(stationId, date.year);
  const summary = text
    ? (date.hour != null
        ? readingClosestToHour(text, stationId, date, date.hour)
        : summarizeHistoricalDate(text, stationId, date))
    : null;
  summaryCache[key] = summary;
  return summary;
}

export function useHistoricalData(stationIds: string[], date: HistoricalDate | null) {
  const [data, setData] = useState<Record<string, BuoyReading | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (date == null) {
      setData({});
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(stationIds.map(async id => ({ id, reading: await fetchStationDate(id, date) })))
      .then(results => {
        if (cancelled) return;
        const map: Record<string, BuoyReading | null> = {};
        for (const { id, reading } of results) map[id] = reading;
        setData(map);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e?.message ?? 'Historical fetch error');
        setLoading(false);
      });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationIds.join(','), date ? `${date.year}-${date.month}-${date.day}-${date.hour ?? ''}` : null]);

  return { data, loading, error };
}
