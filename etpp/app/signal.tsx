import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  SafeAreaView,
  LayoutChangeEvent,
  StyleSheet,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { SignalGrid } from '../components/SignalGrid';
import { TransmitButton } from '../components/TransmitButton';
import { TransmitAnimation } from '../components/TransmitAnimation';
import { useSignalEncoder } from '../hooks/useSignalEncoder';
import { useTransmissionLog } from '../hooks/useTransmissionLog';
import { COLORS } from '../constants/colors';
import { STARS } from '../constants/stars';

function computeArrivalDate(sentAt: Date, distanceLy: number): Date {
  const yearsMs = distanceLy * 365.25 * 24 * 60 * 60 * 1000;
  return new Date(sentAt.getTime() + yearsMs);
}

function formatArrivalDate(d: Date): string {
  const year = d.getFullYear();
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const day = String(d.getDate()).padStart(2, '0');
  return `${year} ${month} ${day}`;
}

export default function SignalScreen() {
  const { message, starId } = useLocalSearchParams<{ message: string; starId: string }>();
  const star = STARS.find(s => s.id === starId) ?? STARS[0];
  const grid = useSignalEncoder(message ?? '');
  const { addTransmission } = useTransmissionLog();

  const [gridAreaWidth, setGridAreaWidth] = useState(0);
  const [gridAreaHeight, setGridAreaHeight] = useState(240);
  const [transmitting, setTransmitting] = useState(false);

  const sentAt = new Date();
  const arrivalDate = computeArrivalDate(sentAt, star.distanceLy);

  const handleGridLayout = useCallback((e: LayoutChangeEvent) => {
    setGridAreaWidth(e.nativeEvent.layout.width);
    setGridAreaHeight(e.nativeEvent.layout.height);
  }, []);

  const handleTransmit = useCallback(() => {
    setTransmitting(true);
  }, []);

  const handleAnimationComplete = useCallback(async () => {
    const now = new Date();
    const arrival = computeArrivalDate(now, star.distanceLy);
    await addTransmission({
      message: message ?? '',
      starId: star.id,
      starName: star.name,
      distanceLy: star.distanceLy,
      sentAt: now.toISOString(),
      arrivalAt: arrival.toISOString(),
      gridCols: grid.cols,
      gridRows: grid.rows,
      binaryPayload: Array.from(grid.bits).join(''),
    });
    setTransmitting(false);
    router.push('/log');
  }, [message, star, grid, addTransmission]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" backgroundColor="#000000" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.back}>← BACK</Text>
        </Pressable>
        <Text style={styles.title}>SIGNAL ENCODED</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.divider} />

      {/* Target info */}
      <View style={styles.infoBlock}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>TARGET</Text>
          <Text style={styles.infoValue}>{star.name.toUpperCase()}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>DIST</Text>
          <Text style={styles.infoValue}>{star.distanceLy.toFixed(2)} LY</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>ARRIVAL</Text>
          <Text style={styles.infoValue}>{formatArrivalDate(arrivalDate)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>GRID</Text>
          <Text style={styles.infoValue}>
            {grid.cols} × {grid.rows} = {grid.cols * grid.rows} BITS
          </Text>
        </View>
      </View>
      <View style={styles.divider} />

      {/* Signal grid */}
      <ScrollView
        style={styles.gridScroll}
        contentContainerStyle={styles.gridContent}
        onLayout={handleGridLayout}
      >
        {gridAreaWidth > 0 && (
          <SignalGrid
            grid={grid}
            maxWidth={gridAreaWidth - 32}
            maxHeight={gridAreaHeight}
          />
        )}
      </ScrollView>

      <View style={styles.divider} />

      {/* Transmit */}
      <View style={styles.transmitArea}>
        <TransmitButton onPress={handleTransmit} />
      </View>

      <TransmitAnimation visible={transmitting} onComplete={handleAnimationComplete} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.dim,
    letterSpacing: 1,
    width: 70,
  },
  title: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: COLORS.primary,
    letterSpacing: 2,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 70,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
  },
  infoBlock: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  infoLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    letterSpacing: 2,
    width: 64,
  },
  infoValue: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.primary,
    letterSpacing: 1,
    flex: 1,
  },
  gridScroll: {
    flex: 1,
  },
  gridContent: {
    padding: 16,
    alignItems: 'center',
    flexGrow: 1,
  },
  transmitArea: {
    paddingVertical: 16,
  },
});
