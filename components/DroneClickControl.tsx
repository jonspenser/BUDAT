import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
} from 'react-native';
import { COLORS } from '../constants/colors';

// Each click within the debounce window accumulates; after DEBOUNCE_MS of
// silence the accumulated count fires as a single command.
const DEBOUNCE_MS = 600;
const MAX_CLICKS = 5;
// Each click = 20% of full-scale value (1 click → 0.2, 5 clicks → 1.0)
const CLICK_STEP = 1 / MAX_CLICKS;

type Direction = 'forward' | 'backward' | 'left' | 'right' | 'up' | 'down' | 'yaw_left' | 'yaw_right';

interface PendingCommand {
  direction: Direction;
  clicks: number;
}

interface FiredCommand {
  id: number;
  direction: Direction;
  clicks: number;
  value: number;
}

const LABELS: Record<Direction, string> = {
  forward:   '▲',
  backward:  '▼',
  left:      '◄',
  right:     '►',
  up:        '+ALT',
  down:      '−ALT',
  yaw_left:  '↺',
  yaw_right: '↻',
};

const DIRECTION_NAMES: Record<Direction, string> = {
  forward:   'FORWARD',
  backward:  'BACKWARD',
  left:      'LEFT',
  right:     'RIGHT',
  up:        'ALT UP',
  down:      'ALT DOWN',
  yaw_left:  'YAW L',
  yaw_right: 'YAW R',
};

let commandIdCounter = 0;

export default function DroneClickControl() {
  // pending[dir] = current unconfirmed click count for that direction
  const [pending, setPending] = useState<Partial<Record<Direction, number>>>({});
  const [log, setLog] = useState<FiredCommand[]>([]);
  const timers = useRef<Partial<Record<Direction, ReturnType<typeof setTimeout>>>>({});

  const fire = useCallback((direction: Direction, clicks: number) => {
    const value = Math.min(clicks, MAX_CLICKS) * CLICK_STEP;
    setLog(prev => [
      { id: ++commandIdCounter, direction, clicks, value },
      ...prev.slice(0, 9),
    ]);
    setPending(prev => {
      const next = { ...prev };
      delete next[direction];
      return next;
    });
    Vibration.vibrate(80);
  }, []);

  const handlePress = useCallback((direction: Direction) => {
    // Clear existing debounce timer
    if (timers.current[direction]) {
      clearTimeout(timers.current[direction]!);
    }
    // Increment click count
    setPending(prev => {
      const next = { ...prev, [direction]: Math.min((prev[direction] ?? 0) + 1, MAX_CLICKS) };
      // Schedule fire with the updated count
      timers.current[direction] = setTimeout(() => {
        fire(direction, next[direction]!);
      }, DEBOUNCE_MS);
      return next;
    });
  }, [fire]);

  function clickDots(direction: Direction) {
    const n = pending[direction] ?? 0;
    return Array.from({ length: MAX_CLICKS }, (_, i) => (
      <View
        key={i}
        style={[styles.dot, i < n ? styles.dotFilled : styles.dotEmpty]}
      />
    ));
  }

  function ControlButton({ direction, style }: { direction: Direction; style?: object }) {
    const active = (pending[direction] ?? 0) > 0;
    return (
      <TouchableOpacity
        style={[styles.btn, active && styles.btnActive, style]}
        onPress={() => handlePress(direction)}
        activeOpacity={0.6}
      >
        <Text style={[styles.btnLabel, active && styles.btnLabelActive]}>
          {LABELS[direction]}
        </Text>
        <View style={styles.dots}>{clickDots(direction)}</View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>CLICK CONTROL</Text>
      <Text style={styles.subheading}>TAP TO QUEUE · COUNT = MAGNITUDE</Text>

      {/* D-pad: forward / back / left / right */}
      <View style={styles.dpad}>
        <View style={styles.dpadRow}>
          <View style={styles.dpadSpacer} />
          <ControlButton direction="forward" />
          <View style={styles.dpadSpacer} />
        </View>
        <View style={styles.dpadRow}>
          <ControlButton direction="left" />
          <View style={styles.dpadCenter}>
            <Text style={styles.dpadCenterText}>MOVE</Text>
          </View>
          <ControlButton direction="right" />
        </View>
        <View style={styles.dpadRow}>
          <View style={styles.dpadSpacer} />
          <ControlButton direction="backward" />
          <View style={styles.dpadSpacer} />
        </View>
      </View>

      {/* Altitude + Yaw row */}
      <View style={styles.auxRow}>
        <ControlButton direction="down" />
        <ControlButton direction="up" />
        <ControlButton direction="yaw_left" />
        <ControlButton direction="yaw_right" />
      </View>

      {/* Click scale legend */}
      <View style={styles.legend}>
        {[1, 2, 3, 4, 5].map(n => (
          <Text key={n} style={styles.legendItem}>
            {n}× = {Math.round(n * CLICK_STEP * 100)}%
          </Text>
        ))}
      </View>

      {/* Command log */}
      <View style={styles.log}>
        <Text style={styles.logTitle}>COMMAND LOG</Text>
        {log.length === 0 ? (
          <Text style={styles.logEmpty}>— no commands yet —</Text>
        ) : (
          log.map(cmd => (
            <Text key={cmd.id} style={styles.logEntry}>
              {DIRECTION_NAMES[cmd.direction].padEnd(10)}
              {'  '}×{cmd.clicks}{'  '}
              {Math.round(cmd.value * 100)}%
            </Text>
          ))
        )}
      </View>
    </View>
  );
}

const BTN = 64;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  heading: {
    fontFamily: 'Courier',
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 3,
    textAlign: 'center',
  },
  subheading: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 16,
  },
  // D-pad
  dpad: {
    alignSelf: 'center',
    marginBottom: 12,
  },
  dpadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dpadSpacer: {
    width: BTN,
    height: BTN,
  },
  dpadCenter: {
    width: BTN,
    height: BTN,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dpadCenterText: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: COLORS.dim,
    letterSpacing: 1,
  },
  // Aux row
  auxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  // Buttons
  btn: {
    width: BTN,
    height: BTN,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
  },
  btnActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#1a0a0a',
  },
  btnLabel: {
    fontFamily: 'Courier',
    fontSize: 18,
    color: COLORS.dim,
  },
  btnLabelActive: {
    color: COLORS.primary,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  dotFilled: {
    backgroundColor: COLORS.primary,
  },
  dotEmpty: {
    backgroundColor: COLORS.divider,
  },
  // Legend
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 14,
  },
  legendItem: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
  },
  // Log
  log: {
    borderTopWidth: 1,
    borderTopColor: COLORS.divider,
    paddingTop: 8,
    flex: 1,
  },
  logTitle: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    letterSpacing: 2,
    marginBottom: 6,
  },
  logEmpty: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.divider,
    textAlign: 'center',
    marginTop: 8,
  },
  logEntry: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: COLORS.primary,
    marginBottom: 3,
  },
});
