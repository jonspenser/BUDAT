import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import BuoyMap from '../components/BuoyMap';
import TideChart from '../components/TideChart';
import AnalogActivities from '../components/AnalogActivities';
import { useNDBCData } from '../hooks/useNDBCData';
import { useTideData } from '../hooks/useTideData';
import { Season } from '../constants/buoys';
import { COLORS } from '../constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function currentSeason(): Season {
  const month = new Date().getMonth() + 1; // 1–12
  return month >= 5 && month <= 9 ? 'summer' : 'winter';
}

function getCurrentTideHeight(tideData: ReturnType<typeof useTideData>): number | null {
  if (!tideData || tideData.predictions.length === 0) return null;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const preds = tideData.predictions;
  for (let i = 0; i < preds.length - 1; i++) {
    const parseParts = (t: string) => {
      const parts = t.split(' ');
      const [h, m] = parts[1]?.split(':').map(Number) ?? [0, 0];
      return h * 60 + m;
    };
    const m0 = parseParts(preds[i].t);
    const m1 = parseParts(preds[i + 1].t);
    if (nowMins >= m0 && nowMins <= m1) {
      const t = (nowMins - m0) / (m1 - m0);
      const h0 = parseFloat(preds[i].v);
      const h1 = parseFloat(preds[i + 1].v);
      return Math.round((h0 + t * (h1 - h0)) * 10) / 10;
    }
  }
  return null;
}

const PAGES = [
  { key: 'wave', label: 'DATA' },
  { key: 'activities', label: 'ACTIVITIES' },
];

export default function Index() {
  const { data: buoyData, loading } = useNDBCData();
  const tideData = useTideData();
  const [pageIndex, setPageIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const season = currentSeason();
  const currentTideHeight = getCurrentTideHeight(tideData);

  function onScroll(e: any) {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_WIDTH);
    setPageIndex(idx);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>BUDAT</Text>
          <Text style={styles.subtitle}>NOAA Real-Time Wave Data</Text>
        </View>
        <View style={styles.dots}>
          {PAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === pageIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.divider} />

      {/* Swipeable area */}
      <View style={styles.mapArea}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
          >
            {/* Page 1 — buoy map */}
            <View style={{ width: SCREEN_WIDTH }}>
              <BuoyMap
                buoyData={buoyData}
                season={season}
                currentTideHeight={currentTideHeight}
              />
            </View>

            {/* Page 2 — analog activities */}
            <View style={{ width: SCREEN_WIDTH }}>
              <AnalogActivities
                buoyData={buoyData}
                tideData={tideData}
                season={season}
              />
            </View>
          </ScrollView>
        )}
        <Text style={styles.swipeHint}>
          SWIPE → {PAGES.map(p => p.label).join(' | ')}
        </Text>
      </View>

      <View style={styles.divider} />

      {/* Tide chart */}
      <TideChart data={tideData} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  title: {
    fontFamily: 'Courier',
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  subtitle: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    letterSpacing: 1,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: COLORS.pageDotActive,
  },
  dotInactive: {
    backgroundColor: COLORS.pageDotInactive,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
  },
  mapArea: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeHint: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    letterSpacing: 1,
  },
});
