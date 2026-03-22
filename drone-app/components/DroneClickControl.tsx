import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  ScrollView,
} from 'react-native';

const DEBOUNCE_MS = 600;
const MAX_CLICKS = 5;
const CLICK_STEP = 1 / MAX_CLICKS;

const COLORS = {
  background: '#000000',
  primary: '#00FF88',
  dim: '#006633',
  divider: '#003322',
  btnBg: '#050f09',
  btnActiveBg: '#001a0d',
  holdActive: '#FF9900',
  holdActiveDim: '#7a4800',
  holdActiveBg: '#1a0e00',
  locked: '#333333',
  lockedBg: '#0a0a0a',
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

type LogEntry =
  | { type: 'cmd'; id: number; direction: Direction; clicks: number; value: number; ts: string }
  | { type: 'hold'; id: number; engaged: boolean; ts: string };

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

let idCounter = 0;
function nowTs() {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

export default function DroneClickControl() {
  const [pending, setPending] = useState<Partial<Record<Direction, number>>>({});
  // Last confirmed value (0–1) per direction — represents "where controls are"
  const [activeValues, setActiveValues] = useState<Partial<Record<Direction, number>>>({});
  const [held, setHeld] = useState(false);
  // Snapshot of activeValues captured when HOLD was engaged
  const [heldValues, setHeldValues] = useState<Partial<Record<Direction, number>>>({});
  const [log, setLog] = useState<LogEntry[]>([]);
  const timers = useRef<Partial<Record<Direction, ReturnType<typeof setTimeout>>>>({});

  function addLog(entry: LogEntry) {
    setLog(prev => [entry, ...prev.slice(0, 29)]);
  }

  const fire = useCallback((direction: Direction, clicks: number) => {
    const value = Math.min(clicks, MAX_CLICKS) * CLICK_STEP;
    addLog({ type: 'cmd', id: ++idCounter, direction, clicks, value, ts: nowTs() });
    setActiveValues(prev => ({ ...prev, [direction]: value }));
    setPending(prev => {
      const next = { ...prev };
      delete next[direction];
      return next;
    });
    Vibration.vibrate(80);
  }, []);

  const handlePress = useCallback((direction: Direction) => {
    if (held) return; // controls locked
    if (timers.current[direction]) clearTimeout(timers.current[direction]!);
    setPending(prev => {
      const next = { ...prev, [direction]: Math.min((prev[direction] ?? 0) + 1, MAX_CLICKS) };
      timers.current[direction] = setTimeout(() => {
        fire(direction, next[direction]!);
      }, DEBOUNCE_MS);
      return next;
    });
  }, [held, fire]);

  const handleHold = useCallback(() => {
    if (!held) {
      // Engage hold: flush any pending timers, snapshot active values
      (Object.keys(timers.current) as Direction[]).forEach(dir => {
        clearTimeout(timers.current[dir]!);
        delete timers.current[dir];
      });
      setPending({});
      setActiveValues(current => {
        setHeldValues(current);
        return current;
      });
      setHeld(true);
      addLog({ type: 'hold', id: ++idCounter, engaged: true, ts: nowTs() });
      Vibration.vibrate([0, 60, 60, 60]);
    } else {
      // Release hold
      setHeld(false);
      setHeldValues({});
      addLog({ type: 'hold', id: ++idCounter, engaged: false, ts: nowTs() });
      Vibration.vibrate(120);
    }
  }, [held]);

  function ClickDots({ direction }: { direction: Direction }) {
    if (held) {
      // Show held value as filled dots
      const v = heldValues[direction];
      if (!v) return <View style={styles.dots}>{Array.from({ length: MAX_CLICKS }, (_, i) => <View key={i} style={[styles.dot, styles.dotEmpty]} />)}</View>;
      const n = Math.round(v / CLICK_STEP);
      return (
        <View style={styles.dots}>
          {Array.from({ length: MAX_CLICKS }, (_, i) => (
            <View key={i} style={[styles.dot, i < n ? styles.dotHeld : styles.dotEmpty]} />
          ))}
        </View>
      );
    }
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
    const active = !held && (pending[direction] ?? 0) > 0;
    const isHeld = held && !!heldValues[direction];
    return (
      <TouchableOpacity
        style={[
          styles.btn,
          active && styles.btnActive,
          held && styles.btnLocked,
          isHeld && styles.btnHeld,
        ]}
        onPress={() => handlePress(direction)}
        activeOpacity={held ? 1 : 0.6}
      >
        <Text style={[
          styles.btnIcon,
          active && styles.btnIconActive,
          held && styles.btnIconLocked,
          isHeld && styles.btnIconHeld,
        ]}>
          {LABELS[direction]}
        </Text>
        <Text style={[
          styles.btnSub,
          active && styles.btnSubActive,
          held && styles.btnSubLocked,
          isHeld && styles.btnSubHeld,
        ]}>
          {isHeld
            ? `${Math.round(heldValues[direction]! * 100)}%`
            : SUBLABELS[direction]}
        </Text>
        <ClickDots direction={direction} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, held && styles.titleHeld]}>
          DRONE CLICK CONTROL
        </Text>
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

      {/* Altitude + Yaw + HOLD */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ALTITUDE · YAW · HOLD</Text>
        <View style={styles.auxRow}>
          <ControlButton direction="down" />
          <ControlButton direction="up" />
          <ControlButton direction="yaw_left" />
          <ControlButton direction="yaw_right" />
          {/* HOLD button */}
          <TouchableOpacity
            style={[styles.btn, styles.holdBtn, held && styles.holdBtnActive]}
            onPress={handleHold}
            activeOpacity={0.7}
          >
            <Text style={[styles.holdIcon, held && styles.holdIconActive]}>
              {held ? '⏸' : '⏺'}
            </Text>
            <Text style={[styles.holdLabel, held && styles.holdLabelActive]}>
              {held ? 'HELD' : 'HOLD'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {held && (
        <View style={styles.holdBanner}>
          <Text style={styles.holdBannerText}>⏸  CONTROLS HELD — TAP HOLD TO RELEASE</Text>
        </View>
      )}

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
          log.map(entry =>
            entry.type === 'hold' ? (
              <View key={entry.id} style={styles.logRow}>
                <Text style={styles.logTs}>{entry.ts}</Text>
                <Text style={[styles.logHoldEntry, entry.engaged ? styles.logHoldOn : styles.logHoldOff]}>
                  {entry.engaged ? '⏸ HOLD ENGAGED' : '▶ HOLD RELEASED'}
                </Text>
              </View>
            ) : (
              <View key={entry.id} style={styles.logRow}>
                <Text style={styles.logTs}>{entry.ts}</Text>
                <Text style={styles.logDir}>{SUBLABELS[entry.direction].padEnd(6)}</Text>
                <Text style={styles.logClicks}>×{entry.clicks}</Text>
                <Text style={styles.logVal}>{Math.round(entry.value * 100)}%</Text>
              </View>
            )
          )
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
  titleHeld: {
    color: COLORS.holdActive,
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
  auxRow: {
    flexDirection: 'row',
    gap: 8,
  },
  // Control buttons
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
  btnLocked: {
    borderColor: COLORS.lockedBg,
    backgroundColor: COLORS.lockedBg,
    opacity: 0.5,
  },
  btnHeld: {
    borderColor: COLORS.holdActiveDim,
    backgroundColor: COLORS.holdActiveBg,
    opacity: 1,
  },
  btnIcon: {
    fontFamily: 'Courier',
    fontSize: 20,
    color: COLORS.dim,
    lineHeight: 22,
  },
  btnIconActive: { color: COLORS.primary },
  btnIconLocked: { color: COLORS.locked },
  btnIconHeld:   { color: COLORS.holdActive },
  btnSub: {
    fontFamily: 'Courier',
    fontSize: 7,
    color: COLORS.dim,
    letterSpacing: 0.5,
  },
  btnSubActive: { color: COLORS.primary },
  btnSubLocked: { color: COLORS.locked },
  btnSubHeld:   { color: COLORS.holdActive, fontSize: 8 },
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
  dotFilled: { backgroundColor: COLORS.primary },
  dotEmpty:  { backgroundColor: COLORS.divider },
  dotHeld:   { backgroundColor: COLORS.holdActive },
  // HOLD button
  holdBtn: {
    borderColor: COLORS.holdActiveDim,
    backgroundColor: '#0d0800',
  },
  holdBtnActive: {
    borderColor: COLORS.holdActive,
    backgroundColor: COLORS.holdActiveBg,
  },
  holdIcon: {
    fontSize: 20,
    color: COLORS.holdActiveDim,
    lineHeight: 22,
  },
  holdIconActive: {
    color: COLORS.holdActive,
  },
  holdLabel: {
    fontFamily: 'Courier',
    fontSize: 7,
    color: COLORS.holdActiveDim,
    letterSpacing: 1,
  },
  holdLabelActive: {
    color: COLORS.holdActive,
  },
  // Hold banner
  holdBanner: {
    backgroundColor: '#1a0e00',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.holdActiveDim,
    paddingVertical: 5,
    alignItems: 'center',
  },
  holdBannerText: {
    fontFamily: 'Courier',
    fontSize: 10,
    color: COLORS.holdActive,
    letterSpacing: 1,
  },
  // Legend
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  legendItem: { alignItems: 'center' },
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
  logContent: { paddingBottom: 16 },
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
  logHoldEntry: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 1,
  },
  logHoldOn:  { color: COLORS.holdActive },
  logHoldOff: { color: COLORS.dim },
});
