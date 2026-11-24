// Follows each swell train through time, from its first appearance to when it
// fades, and turns it into one swell event.
//
// A partition continues an existing track when its peak frequency and
// direction are close to the track's latest reading. Swells drift slowly
// toward higher frequency (shorter period) as the slower waves arrive, so the
// allowed frequency step grows with the time gap.

import type { Partition } from './partition.ts';
import { angleDiff } from './partition.ts';

export type SwellClass = 'groundswell' | 'swell' | 'windswell';

export interface SwellEvent {
  id: string;
  station: string;
  start: string; // ISO, UTC
  peak: string;
  end: string;
  durationH: number;
  peakHsFt: number;
  peakTp: number;
  peakDir: number | null;
  firstTp: number; // longest period in the first 6 hours (forerunners)
  class: SwellClass;
  stormDistanceKm: number | null; // from period dispersion while the swell built
}

interface Reading { time: number; p: Partition }
interface Track { readings: Reading[] }

const HOUR = 3600 * 1000;
const MAX_GAP_H = 4;
const FREQ_STEP_HZ = 0.012;
const FREQ_STEP_PER_H = 0.003;
const MAX_DIR_STEP = 40;
const MIN_DURATION_H = 12;
const MIN_PEAK_HS_M = 0.5;
const NEW_SWELL_MIN_TP = 11;
const NEW_SWELL_FREQ_DROP = 0.007;
const M_TO_FT = 3.28084;
const G = 9.81;

// Median of the last few peak frequencies, so one noisy reading doesn't count
// as a period jump.
function recentFp(tr: Track): number {
  const fs = tr.readings.slice(-4).map(r => r.p.fp).sort((a, b) => a - b);
  return fs[fs.length >> 1];
}

export function classify(tp: number): SwellClass {
  if (tp >= 13) return 'groundswell';
  if (tp >= 9) return 'swell';
  return 'windswell';
}

// Deep-water waves of frequency f travel at g/(4*pi*f), so if the peak
// frequency rises at rate df/dt the waves left a source about
// g / (4*pi * df/dt) away.
function stormDistanceKm(readings: Reading[]): number | null {
  const peakIdx = readings.reduce((b, r, i) => (r.p.hsM > readings[b].p.hsM ? i : b), 0);
  const rising = readings.slice(0, peakIdx + 1);
  if (rising.length < 6) return null;
  const t = rising.map(r => (r.time - rising[0].time) / 1000);
  const f = rising.map(r => r.p.fp);
  const tm = t.reduce((a, b) => a + b, 0) / t.length;
  const fm = f.reduce((a, b) => a + b, 0) / f.length;
  let num = 0, den = 0;
  t.forEach((ti, i) => { num += (ti - tm) * (f[i] - fm); den += (ti - tm) ** 2; });
  if (den === 0) return null;
  const slope = num / den;
  if (slope <= 0) return null;
  const km = G / (4 * Math.PI * slope) / 1000;
  return km >= 500 && km <= 15000 ? Math.round(km / 50) * 50 : null;
}

function toEvent(station: string, tr: Track): SwellEvent | null {
  const r = tr.readings;
  const start = r[0].time;
  const end = r[r.length - 1].time;
  const durationH = (end - start) / HOUR;
  const peak = r.reduce((b, x) => (x.p.hsM > b.p.hsM ? x : b), r[0]);
  if (durationH < MIN_DURATION_H || peak.p.hsM < MIN_PEAK_HS_M) return null;
  const early = r.filter(x => x.time - start <= 6 * HOUR);
  const firstTp = Math.max(...early.map(x => x.p.tp));
  return {
    id: `${station}-${new Date(peak.time).toISOString().slice(0, 13)}`,
    station,
    start: new Date(start).toISOString(),
    peak: new Date(peak.time).toISOString(),
    end: new Date(end).toISOString(),
    durationH: Math.round(durationH),
    peakHsFt: Math.round(peak.p.hsM * M_TO_FT * 10) / 10,
    peakTp: Math.round(peak.p.tp * 10) / 10,
    peakDir: peak.p.dir,
    firstTp: Math.round(firstTp * 10) / 10,
    class: classify(peak.p.tp),
    stormDistanceKm: stormDistanceKm(r),
  };
}

export function trackSwells(station: string, series: { time: number; parts: Partition[] }[]): SwellEvent[] {
  const active: Track[] = [];
  const done: Track[] = [];

  for (const { time, parts } of series) {
    for (let i = active.length - 1; i >= 0; i--) {
      const last = active[i].readings[active[i].readings.length - 1];
      if (time - last.time > MAX_GAP_H * HOUR) done.push(...active.splice(i, 1));
    }

    const taken = new Set<Track>();
    for (const p of parts) {
      let best: Track | null = null;
      let bestCost = Infinity;
      for (const tr of active) {
        if (taken.has(tr)) continue;
        const last = tr.readings[tr.readings.length - 1];
        const gapH = (time - last.time) / HOUR;
        const fTol = FREQ_STEP_HZ + FREQ_STEP_PER_H * gapH;
        const dF = Math.abs(p.fp - last.p.fp);
        if (dF > fTol) continue;
        // Within one swell the period only shortens. A clear jump to a longer
        // period means a new swell has arrived behind the old one.
        if (p.tp >= NEW_SWELL_MIN_TP && recentFp(tr) - p.fp > NEW_SWELL_FREQ_DROP) continue;
        let cost = dF / fTol;
        if (p.dir !== null && last.p.dir !== null) {
          const dD = angleDiff(p.dir, last.p.dir);
          if (dD > MAX_DIR_STEP) continue;
          cost += dD / MAX_DIR_STEP;
        }
        if (cost < bestCost) { bestCost = cost; best = tr; }
      }
      if (best) {
        best.readings.push({ time, p });
        taken.add(best);
      } else {
        const tr = { readings: [{ time, p }] };
        active.push(tr);
        taken.add(tr);
      }
    }
  }
  done.push(...active);

  const events = done
    .map(tr => toEvent(station, tr))
    .filter((e): e is SwellEvent => e !== null);
  return mergeOverlapping(events).sort((a, b) => a.peak.localeCompare(b.peak));
}

const MERGE_TP_S = 2;
const MERGE_DIR_DEG = 30;
const MERGE_PEAK_GAP_H = 24;

// The spectrum split can occasionally cut one swell into two neighbouring
// pieces that are tracked side by side. Overlapping events with nearly the
// same period and direction are the same swell.
function mergeOverlapping(events: SwellEvent[]): SwellEvent[] {
  const out = [...events].sort((a, b) => b.peakHsFt - a.peakHsFt);
  for (let i = 0; i < out.length; i++) {
    for (let j = out.length - 1; j > i; j--) {
      const a = out[i], b = out[j];
      const overlap = a.start <= b.end && b.start <= a.end;
      const peakGapH = Math.abs(Date.parse(a.peak) - Date.parse(b.peak)) / HOUR;
      const sameDir = a.peakDir === null || b.peakDir === null || angleDiff(a.peakDir, b.peakDir) <= MERGE_DIR_DEG;
      if (!overlap || peakGapH > MERGE_PEAK_GAP_H || !sameDir || Math.abs(a.peakTp - b.peakTp) > MERGE_TP_S) continue;
      const earliest = a.start <= b.start ? a : b;
      const start = earliest.start;
      const end = a.end >= b.end ? a.end : b.end;
      out[i] = {
        ...a,
        start,
        end,
        durationH: Math.round((Date.parse(end) - Date.parse(start)) / HOUR),
        firstTp: earliest.firstTp,
        stormDistanceKm: a.stormDistanceKm ?? b.stormDistanceKm,
      };
      out.splice(j, 1);
    }
  }
  return out;
}
