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
 * Convert a UTC timestamp string "YYYY-MM-DDTHH:MM:00" (from NOAA, already UTC)
 * to Hawaii time (UTC-10) and format as "H:MM AM/PM"
 */
export function formatHawaiiTime(utcIso: string): string {
  // Parse the UTC time
  const utcMs = Date.parse(utcIso + 'Z');
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
