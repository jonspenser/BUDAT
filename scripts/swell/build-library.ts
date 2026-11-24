// Builds the swell library: every significant swell recorded at each offshore
// buoy, from the start of NOAA's spectral archive up to the latest reading.
//
//   node scripts/swell/build-library.ts            all offshore buoys
//   node scripts/swell/build-library.ts 51001      one buoy
//
// Raw NOAA files are cached in scripts/swell/.cache so re-runs only download
// what changed (the current month and the realtime feed are always refetched).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { combineArchive, combineRealtime, type Spectrum } from './spectrum.ts';
import { partitionSpectrum } from './partition.ts';
import { trackSwells } from './track.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '.cache');
const OUT = join(HERE, '..', '..', 'data', 'swell-library');
const NDBC = 'https://www.ndbc.noaa.gov/data';

const STATIONS: Record<string, string> = {
  '51001': 'NW',
  '51101': 'NE',
  '51002': 'SW',
  '51004': 'SE',
};

const HOUR = 3600 * 1000;

function download(url: string, file: string, refresh = false): Buffer | null {
  const path = join(CACHE, file);
  if (!refresh && existsSync(path)) {
    const buf = readFileSync(path);
    return buf.length ? buf : null;
  }
  let buf: Buffer;
  try {
    buf = execFileSync('curl', ['-sf', '--retry', '3', url], { maxBuffer: 64 * 1024 * 1024 });
  } catch {
    buf = Buffer.alloc(0); // 404: remember it so we don't ask again
  }
  if (!refresh || buf.length) writeFileSync(path, buf);
  return buf.length ? buf : null;
}

function text(buf: Buffer | null): string | null {
  if (!buf) return null;
  const gz = buf[0] === 0x1f && buf[1] === 0x8b;
  return (gz ? gunzipSync(buf) : buf).toString('utf8');
}

function archiveYears(station: string): number[] {
  const listing = text(download(`${NDBC}/historical/swden/`, 'swden-index.html', true)) ?? '';
  const re = new RegExp(`${station}w(\\d{4})\\.txt\\.gz`, 'g');
  return [...new Set([...listing.matchAll(re)].map(m => +m[1]))].sort();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function loadSpectra(station: string): { spectra: Spectrum[]; dirYears: number[] } {
  const spectra: Spectrum[] = [];
  const dirYears: number[] = [];
  const years = archiveYears(station);
  const thisYear = new Date().getUTCFullYear();

  for (const y of years) {
    const e = text(download(`${NDBC}/historical/swden/${station}w${y}.txt.gz`, `${station}w${y}.gz`));
    const d = text(download(`${NDBC}/historical/swdir/${station}d${y}.txt.gz`, `${station}d${y}.gz`));
    if (!e) continue;
    if (d) dirYears.push(y);
    spectra.push(...combineArchive(e, d));
    process.stdout.write(`  ${y}${d ? '' : ' (no direction)'}\n`);
  }

  // Current year: finished months are gzipped with the month in hex (Oct = a),
  // the most recent month is plain text named after the station.
  if (!years.includes(thisYear)) {
    for (let m = 0; m < 12; m++) {
      const dir = MONTHS[m];
      const gzName = `${station}${(m + 1).toString(16)}${thisYear}.txt.gz`;
      let e = text(download(`${NDBC}/swden/${dir}/${gzName}`, `${station}-${thisYear}-${m + 1}w.gz`));
      let d = text(download(`${NDBC}/swdir/${dir}/${gzName}`, `${station}-${thisYear}-${m + 1}d.gz`));
      if (!e) {
        e = text(download(`${NDBC}/swden/${dir}/${station}.txt`, `${station}-${thisYear}-${m + 1}w.txt`, true));
        d = text(download(`${NDBC}/swdir/${dir}/${station}.txt`, `${station}-${thisYear}-${m + 1}d.txt`, true));
        // These plain files hold the latest month only; skip one left over from last year
        if (e && !e.split('\n')[1]?.startsWith(String(thisYear))) e = null;
      }
      if (!e) continue;
      spectra.push(...combineArchive(e, d));
      process.stdout.write(`  ${thisYear}-${dir}\n`);
    }
    if (!dirYears.includes(thisYear)) dirYears.push(thisYear);
  }

  const rtE = text(download(`${NDBC}/realtime2/${station}.data_spec`, `${station}-rt.spec`, true));
  const rtD = text(download(`${NDBC}/realtime2/${station}.swdir`, `${station}-rt.swdir`, true));
  if (rtE) {
    spectra.push(...combineRealtime(rtE, rtD));
    process.stdout.write('  realtime (last 45 days)\n');
  }

  // One reading per hour; archive and monthly files win over realtime.
  const byHour = new Map<number, Spectrum>();
  for (const s of spectra) {
    const h = Math.floor(s.time / HOUR);
    if (!byHour.has(h)) byHour.set(h, s);
  }
  return { spectra: [...byHour.values()].sort((a, b) => a.time - b.time), dirYears };
}

function build(station: string) {
  console.log(`${station} (${STATIONS[station]} buoy)`);
  const { spectra, dirYears } = loadSpectra(station);
  const series = spectra.map(s => ({ time: s.time, parts: partitionSpectrum(s) }));
  const events = trackSwells(station, series);

  const library = {
    station,
    name: STATIONS[station],
    builtAt: new Date().toISOString(),
    coverage: {
      from: spectra.length ? new Date(spectra[0].time).toISOString() : null,
      to: spectra.length ? new Date(spectra[spectra.length - 1].time).toISOString() : null,
      hoursOfData: spectra.length,
      yearsWithDirection: dirYears,
    },
    events,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${station}.json`), JSON.stringify(library) + '\n');
  console.log(`  -> ${events.length} swells, ${spectra.length} hours of data\n`);
  return library;
}

mkdirSync(CACHE, { recursive: true });
const wanted = process.argv.slice(2).filter(a => STATIONS[a]);
const libs = (wanted.length ? wanted : Object.keys(STATIONS)).map(build);

if (!wanted.length) {
  const index = {
    builtAt: new Date().toISOString(),
    stations: libs.map(l => ({ station: l.station, name: l.name, swells: l.events.length, ...l.coverage })),
  };
  writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');
}
