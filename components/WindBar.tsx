import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon, Circle } from 'react-native-svg';
import { WindReading } from '../hooks/useWindData';
import { Theme } from '../constants/colors';

interface Props {
  data: WindReading | null;
  theme: Theme;
}

function arrowPoints(cx: number, cy: number, size: number, travelDeg: number): string {
  const r = size * 0.42;
  const headW = size * 0.34;
  const headH = size * 0.40;
  const shaftW = size * 0.13;
  const pts: [number, number][] = [
    [0, -r],
    [headW / 2, -r + headH],
    [shaftW / 2, -r + headH],
    [shaftW / 2, r],
    [-shaftW / 2, r],
    [-shaftW / 2, -r + headH],
    [-headW / 2, -r + headH],
  ];
  const rad = (travelDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pts.map(([px, py]) => `${cx + px * cos - py * sin},${cy + px * sin + py * cos}`).join(' ');
}

const ARROW = 48;

export default function WindBar({ data, theme }: Props) {
  const dir   = data?.dir   ?? null;
  const speed = data?.speed ?? null;

  const travelDeg = dir !== null ? (dir + 180) % 360 : null;
  const ktsStr = speed !== null ? `${Math.round(speed)}kt` : '--';

  return (
    <View style={styles.container}>
      <Svg width={ARROW} height={ARROW}>
        {travelDeg !== null ? (
          <Polygon
            points={arrowPoints(ARROW / 2, ARROW / 2, ARROW, travelDeg)}
            fill={theme.accent}
          />
        ) : (
          <Circle cx={ARROW / 2} cy={ARROW / 2} r={6} fill={theme.muted} />
        )}
      </Svg>
      <Text style={[styles.kts, { color: theme.accent }]}>{ktsStr}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  kts: {
    fontFamily: 'Courier',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 1,
    marginTop: 5,
  },
});
