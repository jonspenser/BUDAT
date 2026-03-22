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
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import BuoyMap from '../components/BuoyMap';
import TideChart from '../components/TideChart';
import { useNDBCData } from '../hooks/useNDBCData';
import { useTideData } from '../hooks/useTideData';
import { COLORS } from '../constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PAGES = [
  { key: 'wave', label: 'DATA' },
  { key: 'wind', label: 'WIND' },
];

export default function Index() {
  const { data: buoyData, loading } = useNDBCData();
  const tideData = useTideData();
  const [pageIndex, setPageIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const router = useRouter();

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
        <View style={styles.headerRight}>
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
          <TouchableOpacity onPress={() => router.push('/drone')} style={styles.droneBtn}>
            <Text style={styles.droneBtnText}>DRONE</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Swipeable map area */}
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
            {PAGES.map(page => (
              <View key={page.key} style={{ width: SCREEN_WIDTH }}>
                <BuoyMap
                  buoyData={buoyData}
                  mode={page.key as 'wave' | 'wind'}
                />
              </View>
            ))}
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
  },
  droneBtn: {
    borderWidth: 1,
    borderColor: COLORS.dim,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  droneBtnText: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    letterSpacing: 2,
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
