// ── Direction utils (recovered from Hermes bytecode, line 67239) ──────────────

const COMPASS_POINTS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'] as const;

export function getCardinalDirection(degrees: number | null): string | null {
  if (degrees === null || degrees === undefined || isNaN(degrees)) return null;
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return COMPASS_POINTS[index];
}

// ── Trend utils (recovered from Hermes bytecode, line 67387) ──────────────────
// Compares the 5 most recent readings of `field` (default SwH = swell height).
// Converts m → ft (× 3.28084), threshold ±1 ft.
export type Trend = 'rising' | 'falling' | 'stable';

export function calculateTrend(data: Array<Record<string, number | null>>, field = 'SwH'): Trend {
  if (!data || data.length < 2) return 'stable';
  const recent = data
    .slice(0, 5)
    .map(d => d[field] as number | null)
    .filter((v): v is number => v !== null && !isNaN(v));
  if (recent.length < 2) return 'stable';
  const newest = recent[0] * 3.28084;
  const oldest = recent[recent.length - 1] * 3.28084;
  const diff = newest - oldest;
  if (diff > 1) return 'rising';
  if (diff < -1) return 'falling';
  return 'stable';
}

export function getTrendIcon(trend: Trend): string {
  if (trend === 'rising')  return '↑';
  if (trend === 'falling') return '↓';
  return '→';
}

// ── Offline detection ─────────────────────────────────────────────────────────

const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

export function isOffline(timestamp: Date | string | null | undefined): boolean {
  if (!timestamp) return true;
  const ms = timestamp instanceof Date ? timestamp.getTime() : Date.parse(timestamp);
  if (isNaN(ms)) return true;
  return Date.now() - ms > STALE_MS;
}

// ── Convert meters to feet and format as "X.Xft" ──────────────────────────────

/** Convert meters to feet and format as "X.Xft" */
export function formatHeight(meters: number | null): string {
  if (meters === null) return '--';
  return `${(meters * 3.28084).toFixed(1)}ft`;
}

/** Format period seconds as "X.Xs" */
export function formatPeriod(seconds: number | null): string {
  if (seconds === null) return '--';
  return `${seconds.toFixed(1)}s`;
}

/** Format wave height+period together as "X.Xft X.Xs" */
export function formatWave(heightM: number | null, periodS: number | null): string {
  return `${formatHeight(heightM)} ${formatPeriod(periodS)}`;
}

/** Format direction degrees as "XXX °" */
export function formatDirection(deg: number | null): string {
  if (deg === null) return '--';
  return `${Math.round(deg)} °`;
}

/**
 * Convert a UTC timestamp (string "YYYY-MM-DDTHH:MM:00" or Date) to Hawaii time (UTC-10)
 * and format as "H:MM AM/PM"
 */
export function formatHawaiiTime(utcIsoOrDate: string | Date): string {
  // Parse the UTC time
  const utcMs = utcIsoOrDate instanceof Date
    ? utcIsoOrDate.getTime()
    : Date.parse(utcIsoOrDate + 'Z');
  if (isNaN(utcMs)) return '--';
  // Hawaii is UTC-10 (no DST)
  const hiMs = utcMs - 10 * 60 * 60 * 1000;
  const d = new Date(hiMs);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/**
 * Format a tide prediction time string "YYYY-MM-DD HH:MM" (local time from API)
 * as "H:MM AM/PM"
 */
export function formatTideTime(localTime: string): string {
  // Format: "2024-01-15 14:30"
  const parts = localTime.split(' ');
  if (parts.length < 2) return '--';
  const [hourStr, minStr] = parts[1].split(':');
  const h = parseInt(hourStr, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${minStr} ${ampm}`;
}

/** Format a tide time string to "H:MM AM" style for axis labels */
export function formatXAxisLabel(hour: number): string {
  if (hour === 0 || hour === 24) return '12a';
  if (hour === 12) return '12p';
  if (hour < 12) return `${hour}a`;
  return `${hour - 12}p`;
}
