import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import Svg, { Circle, Arc, Path } from 'react-native-svg';
import { Theme } from '../constants/colors';
import { useMicWind, BeaufortInfo } from '../hooks/useMicWind';

const { width: W } = Dimensions.get('window');
const GAUGE_R = W * 0.38;
const CX = W / 2;

// Arc from 210° to 330° (240° sweep) for the Beaufort gauge
const START_DEG = 210;
const SWEEP_DEG = 240;

function polarToXY(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const s = polarToXY(cx, cy, r, startDeg);
  const e = polarToXY(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

interface GaugeProps {
  beaufortFractional: number;
  isRecording: boolean;
  theme: Theme;
}

function WindGauge({ beaufortFractional, isRecording, theme }: GaugeProps) {
  const cy = GAUGE_R + 20;
  const fillDeg = Math.min(beaufortFractional / 8, 1) * SWEEP_DEG;
  const endDeg = START_DEG + fillDeg;
  const needlePt = polarToXY(CX, cy, GAUGE_R * 0.82, START_DEG + fillDeg);

  return (
    <Svg width={W} height={GAUGE_R * 2 + 40}>
      {/* Track arc */}
      <Path
        d={describeArc(CX, cy, GAUGE_R, START_DEG, START_DEG + SWEEP_DEG)}
        stroke={theme.accentDim}
        strokeWidth={10}
        fill="none"
        strokeLinecap="round"
      />
      {/* Filled arc */}
      {fillDeg > 0 && (
        <Path
          d={describeArc(CX, cy, GAUGE_R, START_DEG, endDeg)}
          stroke={isRecording ? theme.accent : theme.accentDim}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {/* Beaufort tick marks */}
      {Array.from({ length: 9 }, (_, i) => {
        const deg = START_DEG + (i / 8) * SWEEP_DEG;
        const inner = polarToXY(CX, cy, GAUGE_R - 18, deg);
        const outer = polarToXY(CX, cy, GAUGE_R + 2, deg);
        return (
          <Path
            key={i}
            d={`M ${inner.x} ${inner.y} L ${outer.x} ${outer.y}`}
            stroke={i <= Math.round(beaufortFractional) && isRecording ? theme.accent : theme.accentDim}
            strokeWidth={i === Math.round(beaufortFractional) ? 2.5 : 1}
          />
        );
      })}
      {/* Beaufort number labels */}
      {Array.from({ length: 9 }, (_, i) => {
        const deg = START_DEG + (i / 8) * SWEEP_DEG;
        const pos = polarToXY(CX, cy, GAUGE_R - 34, deg);
        return (
          <React.Fragment key={i}>
            <Path
              d={`M ${pos.x - 0.01} ${pos.y - 0.01} L ${pos.x} ${pos.y}`}
              stroke="none"
              fill="none"
            />
          </React.Fragment>
        );
      })}
      {/* Needle dot */}
      {isRecording && beaufortFractional > 0 && (
        <Circle cx={needlePt.x} cy={needlePt.y} r={6} fill={theme.accent} />
      )}
      {/* Center dot */}
      <Circle cx={CX} cy={cy} r={5} fill={theme.accentDim} />
    </Svg>
  );
}

function BeaufortBar({ beaufortFractional, isRecording, theme }: GaugeProps) {
  return (
    <View style={styles.bfBar}>
      {Array.from({ length: 9 }, (_, i) => {
        const active = isRecording && i <= beaufortFractional;
        const isCurrent = Math.round(beaufortFractional) === i;
        return (
          <View
            key={i}
            style={[
              styles.bfSegment,
              {
                backgroundColor: active ? theme.accent : theme.accentDim,
                opacity: isCurrent && isRecording ? 1 : active ? 0.7 : 0.25,
                height: 8 + i * 3,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

interface Props {
  theme: Theme;
}

export default function MicWindScreen({ theme }: Props) {
  const mic = useMicWind();

  useEffect(() => {
    return () => {
      mic.stop();
    };
  }, []);

  const knotsText = mic.estimatedKnots !== null
    ? `${mic.estimatedKnots.toFixed(1)}`
    : '--';

  const dbText = mic.smoothedDb !== null
    ? `${mic.smoothedDb.toFixed(1)} dBFS`
    : '-- dBFS';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: theme.accent }]}>MIC WIND</Text>
      <View style={[styles.divider, { backgroundColor: theme.accent }]} />

      <Text style={[styles.hint, { color: theme.muted }]}>
        Point mic into the wind · hold steady · allow 5–10 sec to stabilize
      </Text>

      {/* Gauge */}
      <WindGauge
        beaufortFractional={mic.beaufortFractional}
        isRecording={mic.isRecording}
        theme={theme}
      />

      {/* Beaufort bar */}
      <BeaufortBar
        beaufortFractional={mic.beaufortFractional}
        isRecording={mic.isRecording}
        theme={theme}
      />

      {/* Beaufort labels */}
      <View style={styles.bfLabelRow}>
        <Text style={[styles.bfLabelEdge, { color: theme.muted }]}>B0</Text>
        <Text style={[styles.bfLabelEdge, { color: theme.muted }]}>B8</Text>
      </View>

      {/* Speed readout */}
      <View style={styles.readout}>
        <Text style={[styles.speedValue, { color: mic.isRecording ? theme.textPrimary : theme.accentDim }]}>
          {knotsText}
        </Text>
        <Text style={[styles.speedUnit, { color: theme.muted }]}>kts</Text>
      </View>

      {/* Beaufort label */}
      <View style={styles.beaufortLabelWrap}>
        <Text style={[styles.beaufortNumber, { color: theme.accent }]}>
          {mic.isRecording ? `B${mic.beaufortInfo.number}` : '--'}
        </Text>
        <Text style={[styles.beaufortLabel, { color: theme.textPrimary }]}>
          {mic.isRecording ? mic.beaufortInfo.label : 'NOT MEASURING'}
        </Text>
      </View>

      {mic.isRecording && (
        <Text style={[styles.description, { color: theme.muted }]}>
          {mic.beaufortInfo.description}
        </Text>
      )}

      {/* dBFS level */}
      <View style={styles.levelRow}>
        <Text style={[styles.levelLabel, { color: theme.muted }]}>MIC LEVEL</Text>
        <Text style={[styles.levelValue, { color: mic.isRecording ? theme.textPrimary : theme.accentDim }]}>
          {dbText}
        </Text>
      </View>

      {/* Knot range for this Beaufort */}
      {mic.isRecording && (
        <View style={styles.rangeRow}>
          <Text style={[styles.levelLabel, { color: theme.muted }]}>RANGE</Text>
          <Text style={[styles.levelValue, { color: theme.textPrimary }]}>
            {mic.beaufortInfo.knotsMin}–{mic.beaufortInfo.knotsMax} kts
          </Text>
        </View>
      )}

      {/* Error */}
      {mic.error && (
        <Text style={[styles.error, { color: theme.accent }]}>{mic.error}</Text>
      )}

      {/* Start / Stop button */}
      <TouchableOpacity
        style={[
          styles.button,
          { borderColor: theme.accent, backgroundColor: mic.isRecording ? theme.accent : 'transparent' },
        ]}
        onPress={mic.isRecording ? mic.stop : mic.start}
        activeOpacity={0.7}
      >
        <Text style={[styles.buttonText, { color: mic.isRecording ? theme.background : theme.accent }]}>
          {mic.isRecording ? 'STOP' : 'START MEASURING'}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.disclaimer, { color: theme.accentDim }]}>
        Estimate only · accuracy varies by device, wind angle, and background noise
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontFamily: 'Courier',
    fontWeight: '900',
    letterSpacing: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    opacity: 0.55,
    alignSelf: 'stretch',
    marginBottom: 14,
  },
  hint: {
    fontSize: 10,
    fontFamily: 'Courier',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 8,
  },
  bfBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 8,
    height: 40,
  },
  bfSegment: {
    width: 22,
    borderRadius: 2,
  },
  bfLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 4,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  bfLabelEdge: {
    fontSize: 9,
    fontFamily: 'Courier',
    letterSpacing: 1,
  },
  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  speedValue: {
    fontSize: 72,
    fontFamily: 'Courier',
    fontWeight: '900',
    letterSpacing: -2,
    lineHeight: 80,
  },
  speedUnit: {
    fontSize: 22,
    fontFamily: 'Courier',
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 4,
  },
  beaufortLabelWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    marginTop: 6,
  },
  beaufortNumber: {
    fontSize: 22,
    fontFamily: 'Courier',
    fontWeight: '900',
    letterSpacing: 2,
  },
  beaufortLabel: {
    fontSize: 16,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 3,
  },
  description: {
    fontSize: 11,
    fontFamily: 'Courier',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  levelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(128,128,128,0.2)',
  },
  levelLabel: {
    fontSize: 10,
    fontFamily: 'Courier',
    letterSpacing: 2,
  },
  levelValue: {
    fontSize: 13,
    fontFamily: 'Courier',
    fontWeight: '600',
    letterSpacing: 1,
  },
  error: {
    fontSize: 12,
    fontFamily: 'Courier',
    letterSpacing: 1,
    marginTop: 10,
    textAlign: 'center',
  },
  button: {
    marginTop: 28,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderWidth: 2,
    borderRadius: 4,
  },
  buttonText: {
    fontSize: 15,
    fontFamily: 'Courier',
    fontWeight: '900',
    letterSpacing: 4,
  },
  disclaimer: {
    fontSize: 9,
    fontFamily: 'Courier',
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 20,
  },
});
