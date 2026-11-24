// Parsers for NDBC spectral wave files.
//
// Archive files (data/historical/swden, swdir) have a header row listing the
// frequency bins, then one row per reading. Old years use 2-digit years and no
// minute column, and the frequency bins change between buoy generations, so
// everything is read from each file's own header.
//
// Realtime files (data/realtime2/*.data_spec, *.swdir) put each value next to
// its frequency in parentheses: "0.182 (0.048)".

export interface Spectrum {
  time: number; // ms since epoch, UTC
  freqs: number[]; // Hz
  energy: number[]; // m^2/Hz
  dirs: (number | null)[] | null; // mean direction waves come FROM, degT, per bin
}

const MISSING = 999;

function toTime(cols: string[], hasMinute: boolean): number {
  let year = +cols[0];
  if (year < 100) year += year > 50 ? 1900 : 2000;
  const min = hasMinute ? +cols[4] : 0;
  return Date.UTC(year, +cols[1] - 1, +cols[2], +cols[3], min);
}

interface Table {
  freqs: number[];
  rows: Map<number, number[]>;
}

export function parseArchiveTable(text: string): Table {
  const lines = text.split('\n').filter(l => l.trim());
  const header = lines[0].replace(/^#/, '').trim().split(/\s+/);
  const hasMinute = header[4] === 'mm';
  const timeCols = hasMinute ? 5 : 4;
  const freqs = header.slice(timeCols).map(Number);
  const rows = new Map<number, number[]>();
  for (const line of lines.slice(1)) {
    if (line.startsWith('#')) continue;
    const cols = line.trim().split(/\s+/);
    if (cols.length < timeCols + freqs.length) continue;
    rows.set(toTime(cols, hasMinute), cols.slice(timeCols, timeCols + freqs.length).map(Number));
  }
  return { freqs, rows };
}

function cleanDirs(raw: number[] | undefined): (number | null)[] | null {
  if (!raw) return null;
  return raw.map(d => (d >= MISSING || d < 0 ? null : d % 360));
}

export function combineArchive(energyText: string, dirText: string | null): Spectrum[] {
  const e = parseArchiveTable(energyText);
  const d = dirText ? parseArchiveTable(dirText) : null;
  const sameBins = d !== null && d.freqs.join() === e.freqs.join();
  const out: Spectrum[] = [];
  for (const [time, vals] of e.rows) {
    if (vals.every(v => v >= MISSING)) continue;
    out.push({
      time,
      freqs: e.freqs,
      energy: vals.map(v => (v >= MISSING || v < 0 ? 0 : v)),
      dirs: sameBins ? cleanDirs(d!.rows.get(time)) : null,
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

// Realtime: "YY MM DD hh mm [Sep_Freq] v (f) v (f) ..."
function parseRealtimeRows(text: string, hasSepFreq: boolean) {
  const rows = new Map<number, { freqs: number[]; vals: number[] }>();
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const cols = line.trim().split(/\s+/);
    const time = toTime(cols, true);
    const rest = cols.slice(hasSepFreq ? 6 : 5);
    const freqs: number[] = [];
    const vals: number[] = [];
    for (let i = 0; i + 1 < rest.length; i += 2) {
      vals.push(Number(rest[i]));
      freqs.push(Number(rest[i + 1].replace(/[()]/g, '')));
    }
    rows.set(time, { freqs, vals });
  }
  return rows;
}

export function combineRealtime(specText: string, dirText: string | null): Spectrum[] {
  if (specText.trimStart().startsWith('<')) return [];
  const e = parseRealtimeRows(specText, true);
  const d = dirText && !dirText.trimStart().startsWith('<') ? parseRealtimeRows(dirText, false) : null;
  const out: Spectrum[] = [];
  for (const [time, { freqs, vals }] of e) {
    const dr = d?.get(time);
    out.push({
      time,
      freqs,
      energy: vals.map(v => (v >= MISSING || v < 0 ? 0 : v)),
      dirs: dr && dr.freqs.join() === freqs.join() ? cleanDirs(dr.vals) : null,
    });
  }
  return out.sort((a, b) => a.time - b.time);
}
