import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { TideData } from '../hooks/useTideData';
import { TIDE_STATION_NAME } from '../constants/buoys';
import { COLORS } from '../constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PAD_L = 36;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 28;
const CHART_W = SCREEN_WIDTH;
const CHART_H = 180;
const DRAW_W = CHART_W - PAD_L - PAD_R;
const DRAW_H = CHART_H - PAD_T - PAD_B;

function timeToMinutes(t: string): number {
  const parts = t.split(' ');
  const [h, m] = parts[1]?.split(':').map(Number) ?? [0, 0];
  return h * 60 + m;
}

function formatHiLoTime(t: string): string {
  const parts = t.split(' ');
  if (!parts[1]) return '';
  const [h, m] = parts[1].split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function TideChart({ data }: { data: TideData | null }) {
  const { pathD, minH, maxH, hiLoPoints, nowX, yTicks } = useMemo(() => {
    if (!data || data.predictions.length === 0) {
      return { pathD: '', minH: 0, maxH: 2, hiLoPoints: [], nowX: 0, yTicks: [] };
    }

    const preds = data.predictions;
    const heights = preds.map(p => parseFloat(p.v));
    const minH = Math.min(...heights);
    const maxH = Math.max(...heights);
    const range = maxH - minH || 1;

    function tx(minutes: number) {
      return PAD_L + (minutes / 1440) * DRAW_W;
    }
    function ty(h: number) {
      return PAD_T + DRAW_H - ((h - minH) / range) * DRAW_H;
    }

    // Build smooth SVG path using bezier curves
    let pathD = '';
    for (let i = 0; i < preds.length; i++) {
      const mins = timeToMinutes(preds[i].t);
      const x = tx(mins);
      const y = ty(parseFloat(preds[i].v));
      if (i === 0) {
        pathD += `M ${x} ${y}`;
      } else {
        const prevMins = timeToMinutes(preds[i - 1].t);
        const px = tx(prevMins);
        const py = ty(parseFloat(preds[i - 1].v));
        const cpx = (px + x) / 2;
        pathD += ` C ${cpx} ${py} ${cpx} ${y} ${x} ${y}`;
      }
    }

    const hiLoPoints = data.hiLo.map(hl => ({
      x: tx(timeToMinutes(hl.t)),
      y: ty(parseFloat(hl.v)),
      v: parseFloat(hl.v).toFixed(1),
      t: formatHiLoTime(hl.t),
      type: hl.type,
    }));

    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const nowX = tx(nowMins);

    // Y-axis ticks: 3 evenly spaced
    const yTicks = [minH, (minH + maxH) / 2, maxH].map(h => ({
      y: ty(h),
      label: h.toFixed(1),
    }));

    return { pathD, minH, maxH, hiLoPoints, nowX, yTicks };
  }, [data]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>TIDES · {TIDE_STATION_NAME}</Text>
      <Svg width={CHART_W} height={CHART_H}>
        {/* Y-axis labels */}
        {yTicks.map((t, i) => (
          <SvgText
            key={i}
            x={PAD_L - 4}
            y={t.y + 4}
            fill={COLORS.dim}
            fontSize={9}
            fontFamily="Courier"
            textAnchor="end"
          >
            {t.label}
          </SvgText>
        ))}

        {/* X-axis labels */}
        {['12a', '6a', '12p', '6p', '12a'].map((label, i) => (
          <SvgText
            key={label + i}
            x={PAD_L + (i / 4) * DRAW_W}
            y={CHART_H - 6}
            fill={COLORS.dim}
            fontSize={9}
            fontFamily="Courier"
            textAnchor="middle"
          >
            {label}
          </SvgText>
        ))}

        {/* Tide curve */}
        {pathD ? (
          <Path
            d={pathD}
            stroke={COLORS.primary}
            strokeWidth={2}
            fill="none"
          />
        ) : null}

        {/* Hi/Lo dots and labels */}
        {hiLoPoints.map((pt, i) => (
          <React.Fragment key={i}>
            <Circle cx={pt.x} cy={pt.y} r={4} fill={COLORS.primary} />
            <SvgText
              x={pt.x}
              y={pt.type === 'H' ? pt.y - 10 : pt.y + 16}
              fill={COLORS.primary}
              fontSize={9}
              fontFamily="Courier"
              textAnchor="middle"
            >
              {pt.v} ft
            </SvgText>
            <SvgText
              x={pt.x}
              y={pt.type === 'H' ? pt.y - 20 : pt.y + 26}
              fill={COLORS.dim}
              fontSize={8}
              fontFamily="Courier"
              textAnchor="middle"
            >
              {pt.t}
            </SvgText>
          </React.Fragment>
        ))}

        {/* Current time dashed line */}
        {nowX > PAD_L && (
          <Line
            x1={nowX} y1={PAD_T}
            x2={nowX} y2={CHART_H - PAD_B}
            stroke={COLORS.dim}
            strokeWidth={1}
            strokeDasharray="4,4"
          />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    paddingTop: 12,
  },
  header: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.primary,
    paddingLeft: PAD_L,
    marginBottom: 4,
    letterSpacing: 1,
  },
});
