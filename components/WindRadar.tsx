import React from 'react';
import Svg, { Circle, Polygon, Line, G, Text as SvgText } from 'react-native-svg';
import { Theme } from '../constants/colors';

interface Props {
  signalProfile: number[];   // normalized 0..1 per bearing bin (length N)
  headingDeg: number | null; // detected wind-from bearing (peak)
  currentHeadingDeg: number | null; // where the phone points right now
  theme: Theme;
  size: number;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Radar-lobe compass. As the user pans the phone, each bearing bin fills with
 * the loudest sound heard there, growing a lobe that points into the wind.
 * A live needle shows the current heading so the user can steer toward the peak.
 */
export default function WindRadar({ signalProfile, headingDeg, currentHeadingDeg, theme, size }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.40;
  const rInner = size * 0.12;

  const bins = signalProfile.length || 24;
  const binSize = 360 / bins;

  // Lobe polygon points — one vertex per bin at radius scaled by signal
  const lobePts = signalProfile.length
    ? signalProfile
        .map((norm, i) => {
          const deg = i * binSize + binSize / 2;
          const r = rInner + Math.max(0, Math.min(1, norm)) * (rOuter - rInner);
          const p = polar(cx, cy, r, deg);
          return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(' ')
    : '';

  const cardinals = [
    { label: 'N', deg: 0 },
    { label: 'E', deg: 90 },
    { label: 'S', deg: 180 },
    { label: 'W', deg: 270 },
  ];

  const peak = headingDeg !== null ? polar(cx, cy, rOuter, headingDeg) : null;
  const needle = currentHeadingDeg !== null ? polar(cx, cy, rOuter * 0.92, currentHeadingDeg) : null;

  return (
    <Svg width={size} height={size}>
      {/* Rings */}
      <Circle cx={cx} cy={cy} r={rOuter} stroke={theme.accentDim} strokeWidth={1} fill="none" />
      <Circle cx={cx} cy={cy} r={(rOuter + rInner) / 2} stroke={theme.accentDim} strokeWidth={0.5} fill="none" opacity={0.5} />

      {/* Cross spokes */}
      {cardinals.map(({ deg }) => {
        const o = polar(cx, cy, rOuter, deg);
        return <Line key={deg} x1={cx} y1={cy} x2={o.x} y2={o.y} stroke={theme.accentDim} strokeWidth={0.5} opacity={0.4} />;
      })}

      {/* Signal lobe */}
      {lobePts && (
        <Polygon points={lobePts} fill={theme.accent} fillOpacity={0.22} stroke={theme.accent} strokeWidth={1.5} strokeOpacity={0.7} />
      )}

      {/* Live heading needle — where the phone points now */}
      {needle && (
        <>
          <Line x1={cx} y1={cy} x2={needle.x} y2={needle.y} stroke={theme.muted} strokeWidth={2} strokeLinecap="round" />
          <Circle cx={needle.x} cy={needle.y} r={4} fill={theme.background} stroke={theme.muted} strokeWidth={2} />
        </>
      )}

      {/* Locked peak bearing — into the wind */}
      {peak && (
        <>
          <Line x1={cx} y1={cy} x2={peak.x} y2={peak.y} stroke={theme.accent} strokeWidth={3} strokeLinecap="round" />
          <Circle cx={peak.x} cy={peak.y} r={6} fill={theme.accent} />
        </>
      )}

      {/* Cardinal labels */}
      {cardinals.map(({ label, deg }) => {
        const t = polar(cx, cy, rOuter + size * 0.075, deg);
        return (
          <SvgText
            key={label}
            x={t.x}
            y={t.y + 4}
            fill={theme.muted}
            fontSize={size * 0.07}
            fontFamily="Courier"
            fontWeight="700"
            textAnchor="middle"
          >
            {label}
          </SvgText>
        );
      })}

      {/* Center */}
      <Circle cx={cx} cy={cy} r={3} fill={theme.accentDim} />
    </Svg>
  );
}
