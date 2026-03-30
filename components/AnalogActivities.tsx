import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { BuoyData } from '../hooks/useNDBCData';
import { TideData } from '../hooks/useTideData';
import { Season } from '../constants/buoys';
import { COLORS } from '../constants/colors';

type Rating = 'GOOD' | 'FAIR' | 'POOR';

const RATING_COLOR: Record<Rating, string> = {
  GOOD: '#3DCC6E',
  FAIR: '#E8A030',
  POOR: '#CC3D3D',
};

interface ActivityResult {
  rating: Rating;
  note: string;
}

// Prefer nearshore buoys; fall back to offshore corners
const SEASON_BUOY_PRIORITY: Record<Season, string[]> = {
  winter: ['51208', '51201', '51206', '51204', '51001', '51003'],
  summer: ['51205', '51202', '51002', '51004'],
};

function getBestBuoy(
  buoyData: Record<string, BuoyData>,
  season: Season,
): BuoyData | null {
  for (const id of SEASON_BUOY_PRIORITY[season]) {
    const d = buoyData[id];
    if (d && d.waveHeightFt !== null) return d;
  }
  return null;
}

function assessSurf(wh: number | null, period: number | null): ActivityResult {
  if (wh === null) return { rating: 'FAIR', note: 'no data' };
  const periodNote = period ? ` @ ${period}s` : '';
  if (wh < 1) return { rating: 'POOR', note: `${wh}ft — flat` };
  if (wh <= 3) return { rating: 'FAIR', note: `${wh}ft — waist-chest${periodNote}` };
  if (wh <= 8) return { rating: 'GOOD', note: `${wh}ft${periodNote}` };
  if (wh <= 15) return { rating: 'FAIR', note: `${wh}ft — overhead+${periodNote}` };
  return { rating: 'POOR', note: `${wh}ft — XXL` };
}

function assessSUP(wh: number | null, windKts: number | null): ActivityResult {
  if (wh === null) return { rating: 'FAIR', note: 'no data' };
  if (wh > 4 || (windKts !== null && windKts > 25))
    return { rating: 'POOR', note: `${wh}ft — too rough` };
  if (wh > 2 || (windKts !== null && windKts > 18))
    return { rating: 'FAIR', note: `${wh}ft` };
  return { rating: 'GOOD', note: `${wh}ft — mellow` };
}

function assessSnorkel(wh: number | null): ActivityResult {
  if (wh === null) return { rating: 'FAIR', note: 'no data' };
  if (wh > 3) return { rating: 'POOR', note: `${wh}ft — murky` };
  if (wh > 1.5) return { rating: 'FAIR', note: `${wh}ft — choppy` };
  return { rating: 'GOOD', note: `${wh}ft — clear water` };
}

function assessDive(wh: number | null, windKts: number | null): ActivityResult {
  if (wh === null) return { rating: 'FAIR', note: 'no data' };
  if (wh > 3 || (windKts !== null && windKts > 20))
    return { rating: 'POOR', note: 'poor visibility' };
  if (wh > 2) return { rating: 'FAIR', note: `${wh}ft — limited viz` };
  return { rating: 'GOOD', note: `${wh}ft — good viz` };
}

function assessKite(windKts: number | null): ActivityResult {
  if (windKts === null) return { rating: 'FAIR', note: 'no data' };
  if (windKts < 10) return { rating: 'POOR', note: `${windKts}kt — too light` };
  if (windKts <= 14) return { rating: 'FAIR', note: `${windKts}kt — marginal` };
  if (windKts <= 30) return { rating: 'GOOD', note: `${windKts}kt` };
  return { rating: 'POOR', note: `${windKts}kt — too strong` };
}

function assessFish(tideData: TideData | null): ActivityResult {
  if (!tideData || tideData.hiLo.length === 0)
    return { rating: 'FAIR', note: 'check tides' };
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let nearestDiff = Infinity;
  let nearestType = '';
  for (const hl of tideData.hiLo) {
    const parts = hl.t.split(' ');
    if (!parts[1]) continue;
    const [h, m] = parts[1].split(':').map(Number);
    const mins = h * 60 + m;
    const diff = Math.abs(mins - nowMins);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearestType = hl.type;
    }
  }
  const label = nearestType === 'H' ? 'high' : 'low';
  if (nearestDiff <= 60) return { rating: 'GOOD', note: `${label} tide — active bite` };
  if (nearestDiff <= 120) return { rating: 'FAIR', note: `tide changing` };
  return { rating: 'FAIR', note: `mid tide` };
}

function assessBodysurf(wh: number | null, period: number | null): ActivityResult {
  if (wh === null) return { rating: 'FAIR', note: 'no data' };
  if (wh < 0.5) return { rating: 'POOR', note: `${wh}ft — flat` };
  if (wh <= 2) return { rating: 'GOOD', note: `${wh}ft${period ? ` @ ${period}s` : ''}` };
  if (wh <= 4) return { rating: 'FAIR', note: `${wh}ft — punchy` };
  return { rating: 'POOR', note: `${wh}ft — too big` };
}

interface Props {
  buoyData: Record<string, BuoyData>;
  tideData: TideData | null;
  season: Season;
}

export default function AnalogActivities({ buoyData, tideData, season }: Props) {
  const buoy = getBestBuoy(buoyData, season);
  const wh = buoy?.waveHeightFt ?? null;
  const period = buoy?.periodSec ?? null;
  const windKts = buoy?.windSpeedKts ?? null;

  const activities: Array<{ name: string; result: ActivityResult }> = [
    { name: 'SURF',      result: assessSurf(wh, period) },
    { name: 'SUP',       result: assessSUP(wh, windKts) },
    { name: 'SNORKEL',   result: assessSnorkel(wh) },
    { name: 'DIVE',      result: assessDive(wh, windKts) },
    { name: 'KITE',      result: assessKite(windKts) },
    { name: 'BODYSURF',  result: assessBodysurf(wh, period) },
    { name: 'FISH',      result: assessFish(tideData) },
  ];

  const sourceNote = buoy
    ? `CONDITIONS VIA BUOY ${buoy.stationId}${buoy.timestamp ? ' · ' + buoy.timestamp : ''}`
    : 'NO BUOY DATA';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>ANALOG ACTIVITIES</Text>
      <Text style={styles.source}>{sourceNote}</Text>
      {activities.map(({ name, result }) => (
        <View key={name} style={styles.row}>
          <View style={[styles.ratingDot, { backgroundColor: RATING_COLOR[result.rating] }]} />
          <Text style={styles.actName}>{name}</Text>
          <Text style={[styles.actRating, { color: RATING_COLOR[result.rating] }]}>
            {result.rating}
          </Text>
          <Text style={styles.actNote}>{result.note}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  header: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 2,
    marginBottom: 4,
  },
  source: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
    letterSpacing: 1,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
    gap: 10,
  },
  ratingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  actName: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primary,
    width: 80,
  },
  actRating: {
    fontFamily: 'Courier',
    fontSize: 11,
    fontWeight: 'bold',
    width: 40,
  },
  actNote: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    flex: 1,
  },
});
