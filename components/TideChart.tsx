import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Text as SvgText } from 'react-native-svg';
import { TidePrediction } from '../hooks/useTideData';
import { Theme } from '../constants/colors';

interface Props {
  predictions: TidePrediction[];
  width: number;
  height: number;
  theme: Theme;
  dayOffset?: number;
}

const PAD_LEFT = 36;
const PAD_RIGHT = 8;
const PAD_TOP = 36;
const PAD_BOT = 24;

function hourToLabel(h: number): string {
  const h24 = h % 24;
  if (h24 === 0) return '12a';
  if (h24 === 12) return '12p';
  if (h24 < 12) return `${h24}a`;
  return `${h24 - 12}p`;
}

function dayOffsetLabel(offset: number): string {
  if (offset === 0) return 'TODAY';
  if (offset === 1) return 'TOMORROW';
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${days[d.getDay()]}  ${months[d.getMonth()]} ${d.getDate()}`;
}

export default function TideChart({ predictions, width, height, theme, dayOffset = 0 }: Props) {
  const CHART_HEIGHT = Math.max(height, PAD_TOP + PAD_BOT + 40);
  const chartW = Math.max(width - PAD_LEFT - PAD_RIGHT, 1);
  const chartH = CHART_HEIGHT - PAD_TOP - PAD_BOT;

  type HiloMarker = { x: number; y: number; type: 'H' | 'L'; timeLabel: string; htLabel: string };
  const { path, yLabels, xTicks, hiloMarkers, now, nowY, nowHeight, nowLabel } = useMemo(() => {
    const empty = { path: '', yLabels: [], xTicks: [], hiloMarkers: [] as HiloMarker[], now: null, nowY: null, nowHeight: null, nowLabel: '' };
    if (predictions.length < 2) return empty;

    const todayDate = predictions[0].time.split(' ')[0];
    const toHours = (timeStr: string): number => {
      const [date, time] = timeStr.split(' ');
      if (!time) return 0;
      const [h, m] = time.split(':').map(Number);
      return h + m / 60 + (date !== todayDate ? 24 : 0);
    };

    const allHours = predictions.map(p => toHours(p.time));
    const allHeights = predictions.map(p => p.height);

    // Fixed 24-hour window: today midnight → tomorrow midnight (local time)
    const WIN_START = 0;
    const WIN_END = 24;

    const minH = Math.min(...allHeights) - 0.3;
    const maxH = Math.max(...allHeights) + 0.3;

    const xScale = (hour: number) => ((hour - WIN_START) / (WIN_END - WIN_START)) * chartW;
    const yScale = (ht: number) => chartH - ((ht - minH) / (maxH - minH)) * chartH;

    // Cosine interpolation between each adjacent hilo pair
    const STEPS = 20;
    const interpPts: { x: number; y: number }[] = [];
    for (let i = 0; i < allHours.length - 1; i++) {
      const h0 = allHours[i], h1 = allHours[i + 1];
      const ht0 = allHeights[i], ht1 = allHeights[i + 1];
      for (let s = 0; s < STEPS; s++) {
        const t = s / STEPS;
        const cosT = (1 - Math.cos(t * Math.PI)) / 2;
        const hour = h0 + (h1 - h0) * t;
        if (hour < WIN_START || hour > WIN_END) continue;
        interpPts.push({
          x: xScale(hour),
          y: yScale(ht0 + (ht1 - ht0) * cosT),
        });
      }
    }
    // Include final point if within window
    const lastH = allHours[allHours.length - 1];
    if (lastH <= WIN_END) {
      interpPts.push({
        x: xScale(lastH),
        y: yScale(allHeights[allHeights.length - 1]),
      });
    }

    if (interpPts.length < 2) return empty;

    let pathStr = `M ${interpPts[0].x},${interpPts[0].y}`;
    for (let i = 1; i < interpPts.length; i++) {
      pathStr += ` L ${interpPts[i].x},${interpPts[i].y}`;
    }

    // Y-axis labels
    const range = maxH - minH;
    const step = range > 4 ? 1 : 0.5;
    const yLabelArr: { y: number; label: string }[] = [];
    for (let ht = Math.ceil(minH / step) * step; ht <= maxH; ht += step) {
      yLabelArr.push({ y: yScale(ht), label: `${ht.toFixed(1)}` });
    }

    // X-axis ticks: every 3 hours across the 24-hour window
    const xTickArr: { x: number; label: string }[] = [];
    for (let h = WIN_START; h <= WIN_END; h += 3) {
      xTickArr.push({ x: xScale(h), label: hourToLabel(h) });
    }

    // Current time (Hawaii = UTC-10)
    const nowD = new Date(Date.now() - 10 * 60 * 60 * 1000);
    const nowHour = nowD.getUTCHours() + nowD.getUTCMinutes() / 60;
    const nowHr24 = nowD.getUTCHours();
    const nowMin = nowD.getUTCMinutes();
    const isPm = nowHr24 >= 12;
    const hr12 = nowHr24 % 12 || 12;
    const nowLabel = `${hr12}:${String(nowMin).padStart(2, '0')}${isPm ? 'p' : 'a'}`;
    const nowX = xScale(nowHour);

    let nowHt: number | null = null;
    for (let i = 0; i < allHours.length - 1; i++) {
      if (nowHour >= allHours[i] && nowHour <= allHours[i + 1]) {
        const t = (nowHour - allHours[i]) / (allHours[i + 1] - allHours[i]);
        const cosT = (1 - Math.cos(t * Math.PI)) / 2;
        nowHt = allHeights[i] + (allHeights[i + 1] - allHeights[i]) * cosT;
        break;
      }
    }
    const nowYVal = nowHt !== null ? yScale(nowHt) : null;

    // Hilo markers — only those within the 24h window
    const hiloArr: HiloMarker[] = [];
    predictions.forEach((p, i) => {
      const hr = allHours[i];
      const ht = allHeights[i];
      if (hr < WIN_START || hr > WIN_END) return;
      const [, timePart] = p.time.split(' ');
      const [hStr, mStr] = (timePart ?? '').split(':');
      const h24 = parseInt(hStr, 10);
      const mn  = parseInt(mStr, 10);
      const isPm = h24 >= 12;
      const h12  = h24 % 12 || 12;
      const tLabel = `${h12}:${String(mn).padStart(2,'0')}${isPm ? 'p' : 'a'}`;
      hiloArr.push({
        x: xScale(hr),
        y: yScale(ht),
        type: p.type,
        timeLabel: tLabel,
        htLabel: `${ht.toFixed(1)}ft`,
      });
    });

    return { path: pathStr, yLabels: yLabelArr, xTicks: xTickArr, hiloMarkers: hiloArr, now: nowX, nowY: nowYVal, nowHeight: nowHt, nowLabel };
  }, [predictions, chartW, chartH]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
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
        {xTicks.map((tick, i) => (
          <SvgText
            key={i}
            x={PAD_LEFT + tick.x}
            y={CHART_HEIGHT - 4}
            fontSize={9}
            fontFamily="Courier"
            fill={theme.muted}
            textAnchor="middle"
          >
            {tick.label}
          </SvgText>
        ))}

        {/* Hilo markers: dotted vertical line + time + height labels */}
        {hiloMarkers.map((m, i) => {
          const cx = PAD_LEFT + m.x;
          const cy = PAD_TOP + m.y;
          const isHigh = m.type === 'H';
          // Labels above curve for highs, below for lows
          const labelY = isHigh ? cy - 8 : cy + 18;
          const htLabelY = isHigh ? cy - 18 : cy + 28;
          return (
            <React.Fragment key={i}>
<SvgText x={cx} y={htLabelY} fontSize={9} fontFamily="Courier" fill={theme.accent} textAnchor="middle" fontWeight="700">
                {m.htLabel}
              </SvgText>
              <SvgText x={cx} y={labelY} fontSize={8} fontFamily="Courier" fill={theme.muted} textAnchor="middle">
                {m.timeLabel}
              </SvgText>
            </React.Fragment>
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

        {/* Day label (top-right) */}
        <SvgText
          x={PAD_LEFT + chartW}
          y={PAD_TOP - 8}
          fontSize={9}
          fontFamily="Courier"
          fill={dayOffset === 0 ? theme.accent : theme.muted}
          textAnchor="end"
          fontWeight="700"
        >
          {dayOffsetLabel(dayOffset)}
        </SvgText>

        {/* Current time dot — today only */}
        {dayOffset === 0 && now !== null && nowY !== null && nowHeight !== null &&
          now >= 0 && now <= chartW && (
          <Circle
            cx={PAD_LEFT + now}
            cy={PAD_TOP + nowY}
            r={5}
            fill={theme.accent}
          />
        )}

      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
});
