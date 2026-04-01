import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';
import { SignalGrid as SignalGridType } from '../constants/types';
import { COLORS } from '../constants/colors';

interface SignalGridProps {
  grid: SignalGridType;
  maxWidth: number;
  maxHeight: number;
}

export function SignalGrid({ grid, maxWidth, maxHeight }: SignalGridProps) {
  const { cols, rows, bits } = grid;

  const cellSize = useMemo(() => {
    return Math.max(
      2,
      Math.min(
        Math.floor(maxWidth / cols),
        Math.floor(maxHeight / rows),
        12,
      ),
    );
  }, [maxWidth, maxHeight, cols, rows]);

  const gridW = cellSize * cols;
  const gridH = cellSize * rows;
  const totalCells = cols * rows;

  const elements = useMemo(() => {
    // For large grids, batch rows into Path elements for performance
    if (totalCells > 3000) {
      const onPath: string[] = [];
      const offPath: string[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * cellSize;
          const y = r * cellSize;
          const w = cellSize - 1;
          const h = cellSize - 1;
          const seg = `M${x} ${y}h${w}v${h}h${-w}Z`;
          if (bits[r * cols + c] === 1) {
            onPath.push(seg);
          } else {
            offPath.push(seg);
          }
        }
      }
      return (
        <>
          <Path d={offPath.join(' ')} fill={COLORS.gridOff} />
          <Path d={onPath.join(' ')} fill={COLORS.gridOn} />
        </>
      );
    }

    // For smaller grids, use individual Rect elements
    const rects: React.ReactElement[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const bit = bits[r * cols + c];
        rects.push(
          <Rect
            key={r * cols + c}
            x={c * cellSize}
            y={r * cellSize}
            width={cellSize - 1}
            height={cellSize - 1}
            fill={bit === 1 ? COLORS.gridOn : COLORS.gridOff}
          />,
        );
      }
    }
    return <>{rects}</>;
  }, [bits, cols, rows, cellSize, totalCells]);

  return (
    <View style={styles.container}>
      <Svg width={gridW} height={gridH}>
        {elements}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
});
