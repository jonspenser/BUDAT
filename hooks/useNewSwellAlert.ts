import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { BuoyReading } from './useBuoyData';
import { SwellRecord, categorize, swellSpeedMph } from './useSwellLog';
import { getCardinalDirection } from '../constants/formatters';
import { AlertSettings } from './useAlertSettings';

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function requestPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function sendNewSwellNotification(stationName: string, rec: SwellRecord): Promise<void> {
  const granted = await requestPermissions();
  if (!granted) return;

  const dir = rec.directionLabel;
  const ht = rec.heightFt.toFixed(1);
  const pd = rec.period.toFixed(0);
  const cat = rec.category;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `New Swell · ${stationName}`,
      body: `${cat}  ${ht}ft  ${dir}  ${pd}s  ·  ${rec.speedMph.toFixed(0)} mph`,
      sound: true,
    },
    trigger: null, // immediate
  });
}

/**
 * Monitors a map of station histories and fires a notification when a
 * new swell is detected (height rises ≥50% above 6–18hr baseline and
 * crosses a size category boundary).
 *
 * Deduplicates by station: only one notification per station per 6 hours.
 */
export function useNewSwellAlert(
  nearshoreHistory: Record<string, BuoyReading[]>,
  stationNames: Record<string, string>,
  settings: AlertSettings,
) {
  // Track last-alerted timestamp per station
  const lastAlerted = useRef<Record<string, number>>({});

  const check = useCallback(() => {
    if (!settings.enabled) return;

    const watchIds = settings.stationIds.length > 0
      ? settings.stationIds
      : Object.keys(nearshoreHistory);

    for (const stationId of watchIds) {
      const history = nearshoreHistory[stationId];
      if (!history || history.length < 10) continue;

      const current = history[0];
      const currentHtM = current.SwH ?? current.WVHT ?? 0;
      const currentHtFt = currentHtM * 3.28084;
      if (currentHtFt < settings.minHeightFt) continue;

      const now = current.timestamp.getTime();

      // Skip if we alerted this station in the last 6 hours
      const lastTime = lastAlerted.current[stationId] ?? 0;
      if (now - lastTime < 6 * 3600000) continue;

      // Baseline: readings 6–18 hours ago
      const baseline = history
        .filter(r => {
          const age = now - r.timestamp.getTime();
          return age >= 6 * 3600000 && age <= 18 * 3600000;
        })
        .map(r => r.SwH ?? r.WVHT ?? 0);

      if (baseline.length < 3) continue;
      const sorted = [...baseline].sort((a, b) => a - b);
      const medianM = sorted[Math.floor(sorted.length / 2)];
      const medianFt = medianM * 3.28084;

      if (currentHtFt > medianFt * 1.5 && categorize(currentHtFt) !== categorize(medianFt)) {
        const period = current.SwP ?? current.DPD ?? 0;
        const directionDeg = current.SwD ?? current.MWD ?? 0;
        const rec: SwellRecord = {
          id: `alert-${stationId}-${now}`,
          stationId,
          stationName: stationNames[stationId] ?? stationId,
          timestamp: current.timestamp.toISOString(),
          heightFt: currentHtFt,
          category: categorize(currentHtFt),
          period,
          directionDeg,
          directionLabel: getCardinalDirection(directionDeg) ?? '--',
          speedMph: period > 0 ? swellSpeedMph(period) : 0,
        };

        lastAlerted.current[stationId] = now;
        sendNewSwellNotification(stationNames[stationId] ?? stationId, rec).catch(() => {});
      }
    }
  }, [nearshoreHistory, stationNames, settings]);

  // Run check whenever history updates
  useEffect(() => {
    check();
  }, [check]);
}
