import React from 'react';
import { Svg, Polygon } from 'react-native-svg';
import { NIGHT_THEME } from '../constants/colors';

interface WaveArrowProps {
  /** Direction the wave is coming FROM (degrees, 0=N, 90=E). Arrow points TOWARD shore, i.e. 180° opposite. */
  directionDeg: number;
  size?: number;
  color?: string;
}

/**
 * Draws a solid filled arrowhead pointing in the wave travel direction.
 * Wave direction from NOAA (MWD) is the direction waves are coming FROM,
 * so we add 180° to get the direction they travel toward.
 */
export default function WaveArrow({ directionDeg, size = 36, color = NIGHT_THEME.accent }: WaveArrowProps) {
  // Waves travel TOWARD: directionDeg + 180
  const travelDeg = (directionDeg + 180) % 360;
  // Convert to SVG rotation: 0° = up (north), clockwise
  const rotation = travelDeg;

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  const headW = size * 0.34;
  const headH = size * 0.40;
  const shaftW = size * 0.13;
  const shaftH = size * 0.30;

  // Arrow pointing UP (north = 0°), centered at (cx, cy)
  // tip at top, shaft going down
  const tipY = cy - r;
  const baseY = tipY + headH;
  const shaftTop = baseY;
  const shaftBot = cy + r;

  const points = [
    `${cx},${tipY}`,
    `${cx + headW / 2},${baseY}`,
    `${cx + shaftW / 2},${shaftTop}`,
    `${cx + shaftW / 2},${shaftBot}`,
    `${cx - shaftW / 2},${shaftBot}`,
    `${cx - shaftW / 2},${shaftTop}`,
    `${cx - headW / 2},${baseY}`,
  ].join(' ');

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Polygon
        points={points}
        fill={color}
        transform={`rotate(${rotation}, ${cx}, ${cy})`}
      />
    </Svg>
  );
}
