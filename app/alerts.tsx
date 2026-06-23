import React, { useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSwellLogContext } from '../contexts/SwellLogContext';
import { useTheme } from '../hooks/useTheme';
import { checkAndNotify } from '../hooks/useSwellAlerts';
import { getCardinalDirection } from '../constants/formatters';

export default function AlertsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { records, disableAlert } = useSwellLogContext();

  const active = records.filter(r => r.alertEnabled && r.offshoreFingerprint?.length);

  useEffect(() => {
    const enabled = records.filter(r => r.alertEnabled && r.offshoreFingerprint?.length);
    if (enabled.length) checkAndNotify(enabled).catch(() => {});
  }, []);

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.background }]}>
      <View style={[s.header, { borderBottomColor: theme.accentDim }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[s.back, { color: theme.accent }]}>← BACK</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: theme.accent }]}>ACTIVE ALERTS</Text>
        <View style={{ width: 60 }} />
      </View>

      {active.length === 0 ? (
        <View style={s.empty}>
          <Text style={[s.emptyTitle, { color: theme.muted }]}>NO ACTIVE ALERTS</Text>
          <Text style={[s.emptyHint, { color: theme.muted }]}>
            Open a logbook entry and enable{'\n'}"NOTIFY WHEN REPEATS".
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {active.map(rec => {
            const fps = rec.offshoreFingerprint ?? [];
            const date = new Date(rec.timestamp);
            const hiDate = new Date(date.getTime() - 10 * 3600_000);
            const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
            const dateStr = `${months[hiDate.getUTCMonth()]} ${hiDate.getUTCDate()}`;

            return (
              <View key={rec.id} style={[s.card, { borderColor: theme.accentDim, backgroundColor: theme.background }]}>
                <View style={s.cardHeader}>
                  <Text style={[s.spot, { color: theme.accent }]}>{rec.spot || rec.stationName}</Text>
                  <Text style={[s.cardDate, { color: theme.muted }]}>{dateStr}</Text>
                </View>

                <Text style={[s.session, { color: theme.muted }]}>
                  {rec.heightFt.toFixed(1)}ft  {rec.period.toFixed(0)}s  {rec.directionLabel}
                </Text>

                <View style={[s.divider, { backgroundColor: theme.accentDim }]} />

                {fps.map(fp => {
                  const dirLabel = fp.dirDeg != null ? (getCardinalDirection(fp.dirDeg) ?? '') : '';
                  const etaH = Math.abs(fp.offsetHours);
                  return (
                    <View key={fp.stationId} style={s.fpRow}>
                      <Text style={[s.fpStation, { color: theme.accent }]}>{fp.stationName}</Text>
                      <Text style={[s.fpVal, { color: theme.textPrimary }]}>{fp.heightFt.toFixed(1)}ft</Text>
                      <Text style={[s.fpVal, { color: theme.textPrimary }]}>{fp.period.toFixed(0)}s</Text>
                      <Text style={[s.fpVal, { color: theme.textPrimary }]}>{dirLabel}</Text>
                      <Text style={[s.fpEta, { color: theme.muted }]}>~{etaH.toFixed(0)}h out</Text>
                    </View>
                  );
                })}

                <View style={[s.divider, { backgroundColor: theme.accentDim }]} />

                <View style={s.cardFooter}>
                  <Text style={[s.fired, { color: theme.muted }]}>
                    {rec.lastAlertFiredAt
                      ? `FIRED ${new Date(rec.lastAlertFiredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()}`
                      : 'NEVER FIRED'}
                  </Text>
                  <TouchableOpacity onPress={() => disableAlert(rec.id)}>
                    <Text style={[s.disable, { color: theme.muted }]}>DISABLE</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  back: { fontFamily: 'Courier', fontSize: 12, letterSpacing: 1 },
  title: { fontFamily: 'Courier', fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyTitle: { fontFamily: 'Courier', fontSize: 14, letterSpacing: 2, fontWeight: '700' },
  emptyHint: { fontFamily: 'Courier', fontSize: 11, letterSpacing: 0.5, textAlign: 'center', opacity: 0.7 },
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 2,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  spot: { fontFamily: 'Courier', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  cardDate: { fontFamily: 'Courier', fontSize: 10, letterSpacing: 0.5 },
  session: { fontFamily: 'Courier', fontSize: 10, letterSpacing: 0.5, paddingHorizontal: 12, paddingBottom: 8 },
  divider: { height: 1, marginHorizontal: 0 },
  fpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 8,
  },
  fpStation: { fontFamily: 'Courier', fontSize: 9, fontWeight: '700', letterSpacing: 1, flex: 1 },
  fpVal: { fontFamily: 'Courier', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  fpEta: { fontFamily: 'Courier', fontSize: 9, letterSpacing: 0.5 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fired: { fontFamily: 'Courier', fontSize: 9, letterSpacing: 1 },
  disable: { fontFamily: 'Courier', fontSize: 9, letterSpacing: 1 },
});
