import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { TidePrediction } from '../hooks/useTideData';
import { formatTideTime, formatXAxisLabel } from '../constants/formatters';
import { Theme } from '../constants/colors';

interface Props {
  predictions: TidePrediction[];
  stationName: string;
  width: number;
  height: number;
  theme: Theme;
}

const PAD_LEFT = 36;
const PAD_RIGHT = 8;
const PAD_TOP = 28;
const PAD_BOT = 24;

export default function TideChart({ predictions, stationName, width, height, theme }: Props) {
  const CHART_HEIGHT = Math.max(height, PAD_TOP + PAD_BOT + 40);
  const chartW = Math.max(width - PAD_LEFT - PAD_RIGHT, 1);
  const chartH = CHART_HEIGHT - PAD_TOP - PAD_BOT;

  const { path, dots, yLabels, now, nowY, nowHeight } = useMemo(() => {
    if (predictions.length < 2) return { path: '', dots: [], yLabels: [], now: null, nowY: null, nowHeight: null };

    const toHours = (timeStr: string): number => {
      const parts = timeStr.split(' ');
      if (parts.length < 2) return 0;
      const [h, m] = parts[1].split(':').map(Number);
      return h + m / 60;
    };

    const allHeights = predictions.map(p => p.height);
    const minH = Math.min(...allHeights) - 0.3;
    const maxH = Math.max(...allHeights) + 0.3;

    const xScale = (hour: number) => (hour / 24) * chartW;
    const yScale = (ht: number) => chartH - ((ht - minH) / (maxH - minH)) * chartH;

    const pts = predictions.map(p => ({
      x: xScale(toHours(p.time)),
      y: yScale(p.height),
      h: p.height,
      t: p.time,
      type: p.type,
    }));

    let pathStr = '';
    if (pts.length >= 2) {
      pathStr = `M ${pts[0].x},${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
        const cpy1 = prev.y;
        const cpx2 = curr.x - (curr.x - prev.x) * 0.4;
        const cpy2 = curr.y;
        pathStr += ` C ${cpx1},${cpy1} ${cpx2},${cpy2} ${curr.x},${curr.y}`;
      }
    }

    const dotItems = pts.map((p) => ({
      x: p.x,
      y: p.y,
      label: `${p.h.toFixed(1)} ft`,
      time: formatTideTime(p.t),
      type: p.type,
    }));

    const range = maxH - minH;
    const step = range > 4 ? 1 : 0.5;
    const yLabelArr: { y: number; label: string }[] = [];
    for (let ht = Math.ceil(minH / step) * step; ht <= maxH; ht += step) {
      yLabelArr.push({ y: yScale(ht), label: `${ht.toFixed(1)}` });
    }

    // Current time (Hawaii = UTC-10)
    const nowMs = Date.now() - 10 * 60 * 60 * 1000;
    const nowD = new Date(nowMs);
    const nowHour = nowD.getUTCHours() + nowD.getUTCMinutes() / 60;
    const nowX = xScale(nowHour);

    const predHours = predictions.map(p => toHours(p.time));
    let nowHt: number | null = null;
    for (let i = 0; i < predHours.length - 1; i++) {
      if (nowHour >= predHours[i] && nowHour <= predHours[i + 1]) {
        const t = (nowHour - predHours[i]) / (predHours[i + 1] - predHours[i]);
        nowHt = predictions[i].height + t * (predictions[i + 1].height - predictions[i].height);
        break;
      }
    }
    const nowYVal = nowHt !== null ? yScale(nowHt) : null;

    return { path: pathStr, dots: dotItems, yLabels: yLabelArr, now: nowX, nowY: nowYVal, nowHeight: nowHt };
  }, [predictions, chartW, chartH]);

  const xTickHours = [0, 6, 12, 18, 24];

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.header, { color: theme.accent }]}>TIDES · {stationName}</Text>
      <Svg width={width} height={CHART_HEIGHT}>
        {/* Y-axis labels */}
        {yLabels.map((lbl, i) => (
          <SvgText
            key={i}
            x={PAD_LEFT - 4}
            y={lbl.y + PAD_TOP + 4}
            fontSize={9}
            fontFamily="Courier"
            fill={theme.muted}
            textAnchor="end"
          >
            {lbl.label}
          </SvgText>
        ))}

        {/* X-axis labels */}
        {xTickHours.map((h) => {
          const x = PAD_LEFT + (h / 24) * (width - PAD_LEFT - PAD_RIGHT);
          return (
            <SvgText
              key={h}
              x={x}
              y={CHART_HEIGHT - 4}
              fontSize={9}
              fontFamily="Courier"
              fill={theme.muted}
              textAnchor="middle"
            >
              {formatXAxisLabel(h)}
            </SvgText>
          );
        })}

        {/* Grid lines */}
        {xTickHours.map((h) => {
          const x = PAD_LEFT + (h / 24) * (width - PAD_LEFT - PAD_RIGHT);
          return (
            <Line
              key={h}
              x1={x} y1={PAD_TOP}
              x2={x} y2={CHART_HEIGHT - PAD_BOT}
              stroke={theme.gridLine}
              strokeWidth={1}
            />
          );
        })}

        {/* Tide curve */}
        {path ? (
          <Path
            d={path}
            stroke={theme.accent}
            strokeWidth={2}
            fill="none"
            transform={`translate(${PAD_LEFT}, ${PAD_TOP})`}
          />
        ) : null}

        {/* Current time dashed line */}
        {now !== null && now >= 0 && now <= width - PAD_LEFT - PAD_RIGHT && (
          <Line
            x1={PAD_LEFT + now} y1={PAD_TOP}
            x2={PAD_LEFT + now} y2={CHART_HEIGHT - PAD_BOT}
            stroke={theme.accent}
            strokeWidth={1}
            strokeDasharray="4,3"
            opacity={0.7}
          />
        )}

        {/* Current tide dot + height label */}
        {now !== null && nowY !== null && nowHeight !== null &&
          now >= 0 && now <= width - PAD_LEFT - PAD_RIGHT && (
          <>
            <Circle
              cx={PAD_LEFT + now}
              cy={PAD_TOP + nowY}
              r={5}
              fill={theme.accent}
            />
            <SvgText
              x={PAD_LEFT + now}
              y={PAD_TOP + nowY - 9}
              fontSize={9}
              fontFamily="Courier"
              fontWeight="bold"
              fill={theme.accent}
              textAnchor="middle"
            >
              {nowHeight.toFixed(1)}ft
            </SvgText>
          </>
        )}

        {/* Dot markers at high/low points */}
        {dots.map((dot, i) => {
          const cx = PAD_LEFT + dot.x;
          const cy = PAD_TOP + dot.y;
          const isHigh = dot.type === 'H';
          const labelY = isHigh ? cy - 18 : cy + 20;
          return (
            <React.Fragment key={i}>
              <Circle cx={cx} cy={cy} r={4} fill={theme.accent} />
              <SvgText
                x={cx}
                y={labelY}
                fontSize={8}
                fontFamily="Courier"
                fill={theme.accent}
                textAnchor="middle"
              >
                {dot.label}
              </SvgText>
              <SvgText
                x={cx}
                y={labelY + 9}
                fontSize={7.5}
                fontFamily="Courier"
                fill={theme.muted}
                textAnchor="middle"
              >
                {dot.time}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  header: {
    fontSize: 13,
    fontFamily: 'Courier',
    fontWeight: 'bold',
    letterSpacing: 2,
    paddingLeft: 12,
    paddingTop: 10,
    paddingBottom: 2,
  },
});
