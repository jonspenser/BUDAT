import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { SwellRecord, OffshoreFingerprint } from './useSwellLog';
import { fetchSpec, parseSpec, closestRow, swellOffset, DIRECTION_BUOYS, COORDS } from './useRelatedBuoyReadings';
import { NEARSHORE_STATIONS } from '../constants/buoys';
import { getCardinalDirection } from '../constants/formatters';

const OFFSHORE_IDS = new Set(['51001', '51000', '51002', '51004']);
const MATCH_PERIOD_TOL = 2.5;   // seconds
const MATCH_DIR_TOL    = 35;    // degrees
const COOLDOWN_MS      = 24 * 3600 * 1000;

function angleDiff(a: number, b: number): number {
  return Math.abs(((a - b + 180 + 360) % 360) - 180);
}

export async function computeFingerprint(rec: SwellRecord): Promise<OffshoreFingerprint[]> {
  const mainCoords = COORDS[rec.stationId];
  if (!mainCoords) return [];

  const candidateIds: string[] = rec.swellWindow
    ? DIRECTION_BUOYS[rec.swellWindow].filter(id => OFFSHORE_IDS.has(id))
    : Array.from(OFFSHORE_IDS);

  const results: OffshoreFingerprint[] = [];

  await Promise.allSettled(
    candidateIds.map(async (offshoreId) => {
      const offshoreCoords = COORDS[offshoreId];
      if (!offshoreCoords) return;

      const offsetHours = swellOffset(
        mainCoords.lat, mainCoords.lon,
        offshoreCoords.lat, offshoreCoords.lon,
        rec.directionDeg,
        rec.period,
      );
      if (offsetHours >= 0) return; // downstream, skip

      const targetTime = new Date(new Date(rec.timestamp).getTime() + offsetHours * 3_600_000);
      const text = await fetchSpec(offshoreId);
      const rows = parseSpec(text);
      const row = closestRow(rows, targetTime);
      if (!row) return;

      const diffMin = Math.abs(row.time.getTime() - targetTime.getTime()) / 60_000;
      if (diffMin > 240) return; // no reading within 4h of target

      const station = NEARSHORE_STATIONS.find(s => s.id === offshoreId);
      results.push({
        stationId: offshoreId,
        stationName: station?.name ?? offshoreId,
        heightFt: row.heightM * 3.28084,
        period: row.period,
        dirDeg: row.dirDeg,
        offsetHours,
      });
    }),
  );

  return results;
}

export async function checkAndNotify(records: SwellRecord[]): Promise<void> {
  const now = Date.now();
  const firedIds: string[] = [];

  for (const rec of records) {
    if (!rec.alertEnabled || !rec.offshoreFingerprint?.length) continue;
    if (rec.lastAlertFiredAt && now - new Date(rec.lastAlertFiredAt).getTime() < COOLDOWN_MS) continue;

    let matchedFp: OffshoreFingerprint | null = null;
    let currentH = 0;
    let currentP = 0;

    for (const fp of rec.offshoreFingerprint) {
      try {
        const rows = parseSpec(await fetchSpec(fp.stationId));
        if (!rows.length) continue;
        const cur = rows[0];
        const hFt = cur.heightM * 3.28084;

        if (hFt < fp.heightFt * 0.4 || hFt > fp.heightFt * 2.0) continue;
        if (Math.abs(cur.period - fp.period) > MATCH_PERIOD_TOL) continue;
        if (fp.dirDeg !== null && cur.dirDeg !== null && angleDiff(cur.dirDeg, fp.dirDeg) > MATCH_DIR_TOL) continue;

        matchedFp = fp;
        currentH = hFt;
        currentP = cur.period;
        break;
      } catch {
        continue;
      }
    }

    if (!matchedFp) continue;

    const etaH = Math.abs(matchedFp.offsetHours);
    const etaStr = etaH < 1 ? `${Math.round(etaH * 60)}min` : `~${etaH.toFixed(0)}h`;
    const dirLabel = matchedFp.dirDeg !== null ? (getCardinalDirection(matchedFp.dirDeg) ?? '') : '';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `SWELL ALERT — ${rec.spot || rec.stationName}`,
        body: `${matchedFp.stationName}: ${currentH.toFixed(1)}ft @ ${currentP.toFixed(0)}s ${dirLabel}. ETA ${etaStr}`,
      },
      trigger: null,
    });

    firedIds.push(rec.id);
  }

  if (!firedIds.length) return;

  try {
    const raw = await AsyncStorage.getItem('@budat/swell_log');
    if (!raw) return;
    const all: SwellRecord[] = JSON.parse(raw);
    const isoNow = new Date().toISOString();
    const updated = all.map(r => firedIds.includes(r.id) ? { ...r, lastAlertFiredAt: isoNow } : r);
    await AsyncStorage.setItem('@budat/swell_log', JSON.stringify(updated));
  } catch {}
}

export function useNotificationPermission(): { granted: boolean } {
  const [granted, setGranted] = useState(false);
  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => setGranted(status === 'granted'));
  }, []);
  return { granted };
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}
