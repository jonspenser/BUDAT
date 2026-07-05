import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
} from 'react-native';
import BuoyMap from './components/BuoyMap';
import TideChart from './components/TideChart';
import { useNDBCData } from './hooks/useNDBCData';
import { useTideData } from './hooks/useTideData';
import { useKahuluiWind } from './hooks/useKahuluiWind';
import { useHistoricalData } from './hooks/useHistoricalData';
import { COLORS } from './constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PAGES = [
  { key: 'wave', label: 'DATA' },
  { key: 'wind', label: 'WIND' },
];

const YEAR_MIN = 2004;
const YEAR_MAX = new Date().getFullYear() - 1;
const YEAR_COUNT = YEAR_MAX - YEAR_MIN + 1;
const SLIDER_W = SCREEN_WIDTH - 80;

export default function App() {
  const { data: buoyData, loading } = useNDBCData();
  const tideData = useTideData();
  const kahuluiWind = useKahuluiWind();
  const [pageIndex, setPageIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const [historical, setHistorical] = useState(false);
  const [selectedYear, setSelectedYear] = useState(YEAR_MAX);
  const { data: histData, loading: histLoading, fetchYear } = useHistoricalData();

  // Debounced fetch: wait 400ms after slider stops
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerFetch = useCallback((year: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchYear(year), 400);
  }, [fetchYear]);

  useEffect(() => {
    if (historical) triggerFetch(selectedYear);
  }, [historical, selectedYear, triggerFetch]);

  // Slider pan responder
  const sliderX = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
        sliderX.current = gs.x0;
        const year = xToYear(gs.x0);
        setSelectedYear(year);
      },
      onPanResponderMove: (_: GestureResponderEvent, gs: PanResponderGestureState) => {
        const year = xToYear(gs.moveX);
        setSelectedYear(year);
      },
    })
  ).current;

  function xToYear(screenX: number): number {
    const startX = (SCREEN_WIDTH - SLIDER_W) / 2;
    const ratio = Math.min(1, Math.max(0, (screenX - startX) / SLIDER_W));
    return Math.round(YEAR_MIN + ratio * (YEAR_COUNT - 1));
  }

  function yearToRatio(year: number): number {
    return (year - YEAR_MIN) / (YEAR_COUNT - 1);
  }

  function onScroll(e: any) {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_WIDTH);
    setPageIndex(idx);
  }

  const displayData = historical ? histData : buoyData;
  const isLoading = historical ? histLoading : loading;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>BUDAT</Text>
          <Text style={styles.subtitle}>NOAA Real-Time Wave Data</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.modeBtn, !historical && styles.modeBtnActive]}
            onPress={() => setHistorical(false)}
          >
            <Text style={[styles.modeBtnText, !historical && styles.modeBtnTextActive]}>LIVE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, historical && styles.modeBtnActive]}
            onPress={() => setHistorical(true)}
          >
            <Text style={[styles.modeBtnText, historical && styles.modeBtnTextActive]}>HIST</Text>
          </TouchableOpacity>
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
      </View>

      <View style={styles.divider} />

      {/* Swipeable map area */}
      <View style={styles.mapArea}>
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={COLORS.primary} />
            {historical && (
              <Text style={styles.loadingText}>Loading {selectedYear} data...</Text>
            )}
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScroll}
          >
            {PAGES.map(page => (
              <View key={page.key} style={{ width: SCREEN_WIDTH }}>
                <BuoyMap
                  buoyData={displayData}
                  mode={page.key as 'wave' | 'wind'}
                  kahuluiWind={kahuluiWind}
                  historicalYear={historical ? selectedYear : undefined}
                />
              </View>
            ))}
          </ScrollView>
        )}
        {!historical && (
          <Text style={styles.swipeHint}>SWIPE → DATA | WIND</Text>
        )}
      </View>

      {/* Year slider (historical mode) */}
      {historical && (
        <View style={styles.sliderSection}>
          <Text style={styles.yearLabel}>{selectedYear}</Text>
          <View style={styles.sliderTrack} {...panResponder.panHandlers}>
            <View style={styles.sliderRail} />
            <View
              style={[
                styles.sliderThumb,
                { left: SLIDER_W * yearToRatio(selectedYear) - 10 },
              ]}
            />
            <View style={styles.sliderYearLabels}>
              <Text style={styles.sliderEndLabel}>{YEAR_MIN}</Text>
              <Text style={styles.sliderEndLabel}>{YEAR_MAX}</Text>
            </View>
          </View>
        </View>
      )}

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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 3,
  },
  modeBtnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '22',
  },
  modeBtnText: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    letterSpacing: 1,
  },
  modeBtnTextActive: {
    color: COLORS.primary,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 4,
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
    gap: 12,
  },
  loadingText: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.dim,
    letterSpacing: 1,
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
  sliderSection: {
    paddingHorizontal: 40,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#000',
  },
  yearLabel: {
    fontFamily: 'Courier',
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 2,
    marginBottom: 8,
  },
  sliderTrack: {
    width: SLIDER_W,
    height: 36,
    justifyContent: 'center',
  },
  sliderRail: {
    height: 2,
    backgroundColor: COLORS.divider,
    borderRadius: 1,
  },
  sliderThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    top: 8,
  },
  sliderYearLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sliderEndLabel: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
  },
});
