/**
 * useRelatedBuoyReadings
 *
 * For a given SwellRecord, finds matching readings from upstream/downstream
 * buoys by propagating the swell at its group velocity.
 *
 * Physics:
 *   Group velocity  Cg = (g × T) / (4π)   [m/s, deep water]
 *   Travel offset   dt = projection / Cg   [hours]
 *   where projection = dot(swell_travel_unit, vector_main→related)
 *
 * Negative dt means the related buoy saw the swell BEFORE the main buoy.
 */

import { useState, useEffect } from 'react';
import { SwellRecord } from './useSwellLog';
import { NEARSHORE_STATIONS } from '../constants/buoys';

// ── Which buoys to correlate for each main station ────────────────────────────

const RELATED_MAP: Record<string, string[]> = {
  '51208': ['51201'],            // Pauwela → Waimea Bay
  '51201': ['51208'],            // Waimea Bay → Pauwela
  '51213': ['51201', '51208'],   // Hanalei → Waimea, Pauwela
};

// ── Buoy coords (from NEARSHORE_STATIONS, duplicated for quick lookup) ────────

const COORDS: Record<string, { lat: number; lon: number }> = {};
for (const s of NEARSHORE_STATIONS) COORDS[s.id] = { lat: s.lat, lon: s.lon };

// ── NDBC .spec cache (module-level, 30-min TTL) ───────────────────────────────

interface CacheEntry { text: string; fetchedAt: number }
const specCache: Record<string, CacheEntry> = {};
const CACHE_TTL = 30 * 60 * 1000;

async function fetchSpec(id: string): Promise<string> {
  const now = Date.now();
  if (specCache[id] && now - specCache[id].fetchedAt < CACHE_TTL) {
    return specCache[id].text;
  }
  const url = `https://www.ndbc.noaa.gov/data/realtime2/${id}.spec`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${id} spec HTTP ${res.status}`);
  const text = await res.text();
  specCache[id] = { text, fetchedAt: now };
  return text;
}

// ── Parse .spec text into rows ────────────────────────────────────────────────

interface SpecRow {
  time: Date;
  heightM: number;
  period: number;
  dirDeg: number | null;
}

function parseSpec(text: string): SpecRow[] {
  const rows: SpecRow[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const p = line.trim().split(/\s+/);
    if (p.length < 9) continue;
    const [yr, mo, dy, hr, mn] = p;
    const time = new Date(`${yr}-${mo.padStart(2,'0')}-${dy.padStart(2,'0')}T${hr.padStart(2,'0')}:${mn.padStart(2,'0')}:00Z`);
    if (isNaN(time.getTime())) continue;
    const heightM = parseFloat(p[5]);          // WVHT
    const swH     = parseFloat(p[6]);          // SwH
    const swP     = parseFloat(p[7]);          // SwP
    const swD     = parseFloat(p[10]);         // SwD
    const mwd     = parseFloat(p[14]);         // MWD
    if (isNaN(heightM)) continue;
    rows.push({
      time,
      heightM: isNaN(swH) ? heightM : swH,
      period:  isNaN(swP) ? parseFloat(p[8]) : swP,
      dirDeg:  isNaN(swD) ? (isNaN(mwd) ? null : mwd) : swD,
    });
  }
  return rows;
}

// ── Closest row to a target timestamp ────────────────────────────────────────

function closestRow(rows: SpecRow[], target: Date): SpecRow | null {
  if (!rows.length) return null;
  let best = rows[0];
  let bestDiff = Math.abs(rows[0].time.getTime() - target.getTime());
  for (let i = 1; i < rows.length; i++) {
    const d = Math.abs(rows[i].time.getTime() - target.getTime());
    if (d < bestDiff) { best = rows[i]; bestDiff = d; }
  }
  return best;
}

// ── Swell propagation offset ──────────────────────────────────────────────────

function swellOffset(
  mainLat: number, mainLon: number,
  relLat: number,  relLon: number,
  fromDeg: number,   // swell coming FROM (meteorological convention)
  periodS: number,
): number {
  // Vector from main buoy to related buoy (km)
  const R = 6371;
  const midLat = ((mainLat + relLat) / 2) * Math.PI / 180;
  const dLat_km = (relLat - mainLat) * (Math.PI / 180) * R;
  const dLon_km = (relLon - mainLon) * (Math.PI / 180) * R * Math.cos(midLat);

  // Swell travel-to direction
  const travelDeg = (fromDeg + 180) % 360;
  const travelRad = travelDeg * Math.PI / 180;
  const swellE = Math.sin(travelRad);
  const swellN = Math.cos(travelRad);

  // Projection of (main→related) onto swell travel axis
  // Positive → related is downstream (sees swell after main)
  // Negative → related is upstream  (sees swell before main)
  const projKm = swellE * dLon_km + swellN * dLat_km;

  // Deep-water group velocity
  const Cg_ms  = (9.81 * periodS) / (4 * Math.PI);
  const Cg_kmh = Cg_ms * 3.6;

  return projKm / Cg_kmh; // hours offset (negative = earlier)
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface RelatedReading {
  stationId:   string;
  stationName: string;
  targetTime:  Date;   // when the swell should have been there
  actualTime:  Date;   // closest NDBC observation
  timeDiffMin: number; // |target - actual| in minutes
  heightFt:    number;
  period:      number;
  dirDeg:      number | null;
  offsetHours: number; // negative = upstream (saw it first)
}

export interface RelatedBuoyState {
  readings: RelatedReading[];
  loading:  boolean;
  error:    string | null;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRelatedBuoyReadings(rec: SwellRecord): RelatedBuoyState {
  const [state, setState] = useState<RelatedBuoyState>({ readings: [], loading: false, error: null });

  useEffect(() => {
    const relatedIds = RELATED_MAP[rec.stationId];
    if (!relatedIds?.length) return;

    const mainCoords = COORDS[rec.stationId];
    if (!mainCoords) return;

    setState({ readings: [], loading: true, error: null });

    const mainTime = new Date(rec.timestamp);

    Promise.all(
      relatedIds.map(async (relId): Promise<RelatedReading | null> => {
        const relCoords = COORDS[relId];
        const relStation = NEARSHORE_STATIONS.find(s => s.id === relId);
        if (!relCoords || !relStation) return null;

        const offsetHours = swellOffset(
          mainCoords.lat, mainCoords.lon,
          relCoords.lat,  relCoords.lon,
          rec.directionDeg,
          rec.period,
        );

        // Skip if related buoy is downstream for this swell direction —
        // it would have seen the swell AFTER the main buoy, making the
        // correlation less meaningful (and the target time would be in
        // the future relative to the record).
        if (offsetHours >= 0) return null;

        const targetTime = new Date(mainTime.getTime() + offsetHours * 3_600_000);

        const text = await fetchSpec(relId);
        const rows = parseSpec(text);
        const row  = closestRow(rows, targetTime);
        if (!row) return null;

        const timeDiffMin = Math.abs(row.time.getTime() - targetTime.getTime()) / 60_000;

        return {
          stationId:   relId,
          stationName: relStation.name,
          targetTime,
          actualTime:  row.time,
          timeDiffMin,
          heightFt:    row.heightM * 3.28084,
          period:      row.period,
          dirDeg:      row.dirDeg,
          offsetHours,
        };
      })
    ).then(results => {
      const readings = results.filter(Boolean) as RelatedReading[];
      setState({ readings, loading: false, error: null });
    }).catch(err => {
      setState({ readings: [], loading: false, error: String(err) });
    });
  }, [rec.id]);

  return state;
}
