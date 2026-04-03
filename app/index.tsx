import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import {
  NEARSHORE_STATIONS,
  TIDE_STATION_ID,
  TIDE_STATION_NAME,
} from '../constants/buoys';
import { useBuoyData, BuoyReading } from '../hooks/useBuoyData';
import { useTideData } from '../hooks/useTideData';
import { useWindData, WindReading } from '../hooks/useWindData';
import { useTheme } from '../hooks/useTheme';
import HawaiiMap from '../components/HawaiiMap';
import TideChart from '../components/TideChart';
import DataScreen from '../components/DataScreen';
import WindScreen from '../components/WindScreen';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const TIDE_H = Math.floor(SCREEN_H / 4);

interface BuoyGridProps {
  nearshoreData: Record<string, BuoyReading | null>;
  theme: ReturnType<typeof useTheme>;
}

function BuoyGrid({ nearshoreData, theme }: BuoyGridProps) {
  const [mapH, setMapH] = useState(300);
  return (
    <View
      style={{ flex: 1 }}
      onLayout={e => setMapH(e.nativeEvent.layout.height)}
    >
      <HawaiiMap
        width={SCREEN_W}
        height={mapH}
        nearshoreStations={NEARSHORE_STATIONS}
        nearshoreData={nearshoreData}
        theme={theme}
      />
    </View>
  );
}

const SCREEN_LABELS = ['MAP', 'DATA', 'WIND'] as const;

export default function HomeScreen() {
  const theme = useTheme();

  // ── Wave data ──
  const hanalei   = useBuoyData('51213');
  const waimeaBay = useBuoyData('51201');
  const pauwela   = useBuoyData('51208');
  const barberspt = useBuoyData('51205');
  const hilo      = useBuoyData('51206');
  const lanai     = useBuoyData('51212');

  const nearshoreData: Record<string, BuoyReading | null> = {
    '51213': hanalei.data,
    '51201': waimeaBay.data,
    '51208': pauwela.data,
    '51205': barberspt.data,
    '51206': hilo.data,
    '51212': lanai.data,
  };

  // ── Wind data ──
  const windHanalei   = useWindData('51213');
  const windWaimeaBay = useWindData('51201');
  const windPauwela   = useWindData('51208');
  const windBarberspt = useWindData('51205');
  const windHilo      = useWindData('51206');
  const windLanai     = useWindData('51212');

  const windData: Record<string, WindReading | null> = {
    '51213': windHanalei.data,
    '51201': windWaimeaBay.data,
    '51208': windPauwela.data,
    '51205': windBarberspt.data,
    '51206': windHilo.data,
    '51212': windLanai.data,
  };

  // ── Tide data ──
  const { predictions, loading: tidesLoading } = useTideData(TIDE_STATION_ID);

  // ── Pager state ──
  const [activeScreen, setActiveScreen] = useState(0);
  const [pagerHeight, setPagerHeight] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActiveScreen(page);
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      hanalei.refetch(),
      waimeaBay.refetch(),
      pauwela.refetch(),
      barberspt.refetch(),
      hilo.refetch(),
      lanai.refetch(),
      windHanalei.refetch(),
      windWaimeaBay.refetch(),
      windPauwela.refetch(),
      windBarberspt.refetch(),
      windHilo.refetch(),
      windLanai.refetch(),
    ]);
    setIsRefreshing(false);
  }, [
    hanalei, waimeaBay, pauwela, barberspt, hilo, lanai,
    windHanalei, windWaimeaBay, windPauwela, windBarberspt, windHilo, windLanai,
  ]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      {/* ── Shared header ── */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.accent }]}>BUDAT</Text>
          <Text style={[styles.headerSubtitle, { color: theme.muted }]}>
            NOAA Real-Time Wave Data · {SCREEN_LABELS[activeScreen]}
          </Text>
        </View>
        <View style={styles.dots}>
          {SCREEN_LABELS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: theme.accentDim },
                i === activeScreen && [styles.dotActive, { backgroundColor: theme.accent }],
              ]}
            />
          ))}
        </View>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.accent }]} />

      {/* ── Horizontal pager ── */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        style={{ flex: 1 }}
        onLayout={e => setPagerHeight(e.nativeEvent.layout.height)}
      >
        {pagerHeight > 0 && (
          <>
            {/* ── Page 0: Map + Tide ── */}
            <ScrollView
              style={{ width: SCREEN_W, height: pagerHeight }}
              contentContainerStyle={{ flex: 1 }}
              scrollEnabled={false}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={theme.accent}
                  colors={[theme.accent]}
                />
              }
            >
              <BuoyGrid nearshoreData={nearshoreData} theme={theme} />
              <View style={styles.swipeHint}>
                <Text style={[styles.swipeText, { color: theme.muted }]}>SWIPE → DATA | WIND</Text>
              </View>
              <View style={{ height: TIDE_H, backgroundColor: theme.background }}>
                <View style={[styles.divider, { backgroundColor: theme.accent }]} />
                {tidesLoading && predictions.length === 0 ? (
                  <View style={styles.tideLoading}>
                    <ActivityIndicator color={theme.accent} />
                  </View>
                ) : (
                  <TideChart
                    predictions={predictions}
                    stationName={TIDE_STATION_NAME}
                    width={SCREEN_W}
                    height={TIDE_H}
                    theme={theme}
                  />
                )}
              </View>
            </ScrollView>

            {/* ── Page 1: Wave Data ── */}
            <DataScreen
              nearshoreData={nearshoreData}
              height={pagerHeight}
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              theme={theme}
            />

            {/* ── Page 2: Wind Data ── */}
            <WindScreen
              windData={windData}
              height={pagerHeight}
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              theme={theme}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: 'Courier',
    fontWeight: '900',
    letterSpacing: 4,
    lineHeight: 36,
  },
  headerSubtitle: {
    fontSize: 10,
    fontFamily: 'Courier',
    letterSpacing: 1,
    marginTop: 1,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotActive: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  divider: {
    height: 1,
    opacity: 0.55,
  },
  swipeHint: {
    alignItems: 'center',
    paddingVertical: 7,
  },
  swipeText: {
    fontSize: 10,
    fontFamily: 'Courier',
    letterSpacing: 2,
  },
  tideLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
