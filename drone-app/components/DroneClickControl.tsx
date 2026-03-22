import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  ScrollView,
} from 'react-native';

// Each click within the debounce window accumulates; after DEBOUNCE_MS of
// silence the accumulated count fires as a single command.
const DEBOUNCE_MS = 600;
const MAX_CLICKS = 5;
// Each click = 20% of full-scale value (1 click → 0.2, 5 clicks → 1.0)
const CLICK_STEP = 1 / MAX_CLICKS;

const COLORS = {
  background: '#000000',
  primary: '#00FF88',
  dim: '#006633',
  divider: '#003322',
  btnBg: '#050f09',
  btnActiveBg: '#001a0d',
};

type Direction =
  | 'forward'
  | 'backward'
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'yaw_left'
  | 'yaw_right';

interface FiredCommand {
  id: number;
  direction: Direction;
  clicks: number;
  value: number;
  ts: string;
}

const LABELS: Record<Direction, string> = {
  forward:   '▲',
  backward:  '▼',
  left:      '◄',
  right:     '►',
  up:        '+',
  down:      '−',
  yaw_left:  '↺',
  yaw_right: '↻',
};

const SUBLABELS: Record<Direction, string> = {
  forward:   'FWD',
  backward:  'BWD',
  left:      'LEFT',
  right:     'RIGHT',
  up:        'ALT↑',
  down:      'ALT↓',
  yaw_left:  'YAW←',
  yaw_right: 'YAW→',
};

let commandIdCounter = 0;

export default function DroneClickControl() {
  const [pending, setPending] = useState<Partial<Record<Direction, number>>>({});
  const [log, setLog] = useState<FiredCommand[]>([]);
  const timers = useRef<Partial<Record<Direction, ReturnType<typeof setTimeout>>>>({});

  const fire = useCallback((direction: Direction, clicks: number) => {
    const value = Math.min(clicks, MAX_CLICKS) * CLICK_STEP;
    const now = new Date();
    const ts = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    setLog(prev => [
      { id: ++commandIdCounter, direction, clicks, value, ts },
      ...prev.slice(0, 19),
    ]);
    setPending(prev => {
      const next = { ...prev };
      delete next[direction];
      return next;
    });
    Vibration.vibrate(80);
  }, []);

  const handlePress = useCallback((direction: Direction) => {
    if (timers.current[direction]) {
      clearTimeout(timers.current[direction]!);
    }
    setPending(prev => {
      const next = { ...prev, [direction]: Math.min((prev[direction] ?? 0) + 1, MAX_CLICKS) };
      timers.current[direction] = setTimeout(() => {
        fire(direction, next[direction]!);
      }, DEBOUNCE_MS);
      return next;
    });
  }, [fire]);

  function ClickDots({ direction }: { direction: Direction }) {
    const n = pending[direction] ?? 0;
    return (
      <View style={styles.dots}>
        {Array.from({ length: MAX_CLICKS }, (_, i) => (
          <View key={i} style={[styles.dot, i < n ? styles.dotFilled : styles.dotEmpty]} />
        ))}
      </View>
    );
  }

  function ControlButton({ direction }: { direction: Direction }) {
    const active = (pending[direction] ?? 0) > 0;
    return (
      <TouchableOpacity
        style={[styles.btn, active && styles.btnActive]}
        onPress={() => handlePress(direction)}
        activeOpacity={0.6}
      >
        <Text style={[styles.btnIcon, active && styles.btnIconActive]}>
          {LABELS[direction]}
        </Text>
        <Text style={[styles.btnSub, active && styles.btnSubActive]}>
          {SUBLABELS[direction]}
        </Text>
        <ClickDots direction={direction} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>DRONE CLICK CONTROL</Text>
        <Text style={styles.subtitle}>TAP TO QUEUE  ·  CLICKS = MAGNITUDE</Text>
      </View>

      <View style={styles.divider} />

      {/* D-pad */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MOVEMENT</Text>
        <View style={styles.dpad}>
          <View style={styles.dpadRow}>
            <View style={styles.btnSpacer} />
            <ControlButton direction="forward" />
            <View style={styles.btnSpacer} />
          </View>
          <View style={styles.dpadRow}>
            <ControlButton direction="left" />
            <View style={styles.dpadGap} />
            <ControlButton direction="right" />
          </View>
          <View style={styles.dpadRow}>
            <View style={styles.btnSpacer} />
            <ControlButton direction="backward" />
            <View style={styles.btnSpacer} />
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Altitude + Yaw */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ALTITUDE &amp; YAW</Text>
        <View style={styles.auxRow}>
          <ControlButton direction="down" />
          <ControlButton direction="up" />
          <ControlButton direction="yaw_left" />
          <ControlButton direction="yaw_right" />
        </View>
      </View>

      <View style={styles.divider} />

      {/* Scale legend */}
      <View style={styles.legend}>
        {[1, 2, 3, 4, 5].map(n => (
          <View key={n} style={styles.legendItem}>
            <Text style={styles.legendClicks}>{n}×</Text>
            <Text style={styles.legendValue}>{Math.round(n * CLICK_STEP * 100)}%</Text>
          </View>
        ))}
      </View>

      <View style={styles.divider} />

      {/* Command log */}
      <View style={styles.logHeader}>
        <Text style={styles.logTitle}>COMMAND LOG</Text>
        {log.length > 0 && (
          <TouchableOpacity onPress={() => setLog([])}>
            <Text style={styles.logClear}>CLEAR</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {log.length === 0 ? (
          <Text style={styles.logEmpty}>— no commands yet —</Text>
        ) : (
          log.map(cmd => (
            <View key={cmd.id} style={styles.logRow}>
              <Text style={styles.logTs}>{cmd.ts}</Text>
              <Text style={styles.logDir}>{SUBLABELS[cmd.direction].padEnd(6)}</Text>
              <Text style={styles.logClicks}>×{cmd.clicks}</Text>
              <Text style={styles.logVal}>{Math.round(cmd.value * 100)}%</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const BTN = 68;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Courier',
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
    letterSpacing: 3,
  },
  subtitle: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
    letterSpacing: 1,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.divider,
  },
  section: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  sectionLabel: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
    letterSpacing: 2,
    marginBottom: 10,
  },
  // D-pad
  dpad: {
    gap: 4,
  },
  dpadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  dpadGap: {
    width: BTN,
    height: BTN,
  },
  btnSpacer: {
    width: BTN,
    height: BTN,
  },
  // Aux row
  auxRow: {
    flexDirection: 'row',
    gap: 8,
  },
  // Buttons
  btn: {
    width: BTN,
    height: BTN,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.btnBg,
    gap: 2,
  },
  btnActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.btnActiveBg,
  },
  btnIcon: {
    fontFamily: 'Courier',
    fontSize: 20,
    color: COLORS.dim,
    lineHeight: 22,
  },
  btnIconActive: {
    color: COLORS.primary,
  },
  btnSub: {
    fontFamily: 'Courier',
    fontSize: 7,
    color: COLORS.dim,
    letterSpacing: 0.5,
  },
  btnSubActive: {
    color: COLORS.primary,
  },
  dots: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
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
    justifyContent: 'space-evenly',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  legendItem: {
    alignItems: 'center',
  },
  legendClicks: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.primary,
  },
  legendValue: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
  },
  // Log
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  logTitle: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    letterSpacing: 2,
  },
  logClear: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: COLORS.dim,
    letterSpacing: 1,
  },
  log: {
    flex: 1,
    paddingHorizontal: 16,
  },
  logContent: {
    paddingBottom: 16,
  },
  logEmpty: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.divider,
    textAlign: 'center',
    marginTop: 12,
  },
  logRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  logTs: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    width: 56,
  },
  logDir: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.primary,
    width: 52,
  },
  logClicks: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.dim,
    width: 24,
  },
  logVal: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.primary,
  },
});
