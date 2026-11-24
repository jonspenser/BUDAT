// Splits one wave spectrum into separate swell trains.
//
// Each local energy peak claims the bins that slope up toward it (a 1-D
// watershed). Neighbouring regions are merged back together when the trough
// between them is shallow and they come from about the same direction, so one
// broad swell isn't reported as two.

import type { Spectrum } from './spectrum.ts';

export interface Partition {
  hsM: number; // significant height of this swell alone, metres
  tp: number; // peak period, seconds
  fp: number; // peak frequency, Hz
  dir: number | null; // direction it comes FROM, degT
  energyShare: number; // fraction of total spectrum energy, 0..1
}

const F_MIN = 0.03; // below this the archive bins are mostly noise
const F_MAX = 0.35;
const MIN_HS_M = 0.15;
const SHALLOW_TROUGH = 0.7; // trough/smaller-peak ratio above which regions merge
const SAME_DIR_DEG = 35;

export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function binWidths(f: number[]): number[] {
  return f.map((_, i) => {
    const lo = i === 0 ? f[0] - (f[1] - f[0]) / 2 : (f[i - 1] + f[i]) / 2;
    const hi = i === f.length - 1 ? f[i] + (f[i] - f[i - 1]) / 2 : (f[i] + f[i + 1]) / 2;
    return hi - lo;
  });
}

function circularMean(dirs: (number | null)[], weights: number[]): number | null {
  let s = 0, c = 0, w = 0;
  dirs.forEach((d, i) => {
    if (d === null || weights[i] <= 0) return;
    const r = (d * Math.PI) / 180;
    s += Math.sin(r) * weights[i];
    c += Math.cos(r) * weights[i];
    w += weights[i];
  });
  if (w === 0) return null;
  return Math.round(((Math.atan2(s, c) * 180) / Math.PI + 360) % 360);
}

interface Region { bins: number[]; peak: number }

export function partitionSpectrum(spec: Spectrum): Partition[] {
  const idx = spec.freqs.map((f, i) => i).filter(i => spec.freqs[i] >= F_MIN && spec.freqs[i] <= F_MAX);
  if (idx.length < 3) return [];
  const f = idx.map(i => spec.freqs[i]);
  const e = idx.map(i => spec.energy[i]);
  const dirs = idx.map(i => spec.dirs?.[i] ?? null);
  const df = binWidths(f);
  const n = f.length;

  const sm = e.map((_, i) => 0.25 * e[Math.max(0, i - 1)] + 0.5 * e[i] + 0.25 * e[Math.min(n - 1, i + 1)]);
  const total = e.reduce((a, v, i) => a + v * df[i], 0);
  if (total <= 0) return [];

  // Watershed: each bin climbs to its local maximum.
  const owner = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let j = i;
    for (;;) {
      const l = j > 0 ? sm[j - 1] : -1;
      const r = j < n - 1 ? sm[j + 1] : -1;
      if (l > sm[j] && l >= r) j--;
      else if (r > sm[j]) j++;
      else break;
    }
    owner[i] = j;
  }
  const regions: Region[] = [];
  for (let i = 0; i < n; i++) {
    const last = regions[regions.length - 1];
    if (last && last.peak === owner[i]) last.bins.push(i);
    else regions.push({ bins: [i], peak: owner[i] });
  }

  const regionDir = (r: Region) => circularMean(r.bins.map(b => dirs[b]), r.bins.map(b => e[b]));

  let merged = true;
  while (merged && regions.length > 1) {
    merged = false;
    for (let k = 0; k < regions.length - 1; k++) {
      const a = regions[k], b = regions[k + 1];
      const trough = Math.min(sm[a.bins[a.bins.length - 1]], sm[b.bins[0]]);
      const smaller = Math.min(sm[a.peak], sm[b.peak]);
      const da = regionDir(a), db = regionDir(b);
      const sameDir = da === null || db === null || angleDiff(da, db) <= SAME_DIR_DEG;
      const negligible = Math.min(...[a, b].map(r => r.bins.reduce((s, i) => s + e[i] * df[i], 0))) < total * 0.03;
      if ((trough >= SHALLOW_TROUGH * smaller && sameDir) || negligible) {
        regions.splice(k, 2, { bins: [...a.bins, ...b.bins], peak: sm[a.peak] >= sm[b.peak] ? a.peak : b.peak });
        merged = true;
        break;
      }
    }
  }

  return regions
    .map(r => {
      const m0 = r.bins.reduce((s, i) => s + e[i] * df[i], 0);
      // Peak bin from raw energy, refined with a parabola through its neighbours
      let p = r.bins.reduce((best, i) => (e[i] > e[best] ? i : best), r.bins[0]);
      let fp = f[p];
      if (p > 0 && p < n - 1) {
        const denom = e[p - 1] - 2 * e[p] + e[p + 1];
        if (denom < 0) {
          const shift = (0.5 * (e[p - 1] - e[p + 1])) / denom;
          fp = f[p] + shift * (shift > 0 ? f[p + 1] - f[p] : f[p] - f[p - 1]);
        }
      }
      return {
        hsM: 4 * Math.sqrt(m0),
        fp,
        tp: 1 / fp,
        dir: regionDir(r),
        energyShare: m0 / total,
      };
    })
    .filter(p => p.hsM >= MIN_HS_M)
    .sort((a, b) => b.hsM - a.hsM);
}
