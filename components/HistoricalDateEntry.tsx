import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Keyboard } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Theme } from '../constants/colors';

export interface HistoricalDate {
  year: number;
  month: number; // 1–12
  day: number;   // 1–31
  hour?: number | null; // 0–23 HST; null/undefined = whole-day average
}

interface Props {
  date: HistoricalDate;
  minYear: number;
  maxYear: number;
  onDateChange: (date: HistoricalDate) => void;
  theme: Theme;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// ── iOS-style wheel geometry / physics ────────────────────────────────────────
const ITEM_H = 26;
const VISIBLE_ROWS = 5;
const WHEEL_H = ITEM_H * VISIBLE_ROWS;
// Extra travel projected from release velocity (seconds of coast)
const MOMENTUM_S = 0.18;
// How far past the ends a clamped (year) wheel may be pulled
const OVERSCROLL = 0.35;

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number | null;
}

// ── Single picker wheel ───────────────────────────────────────────────────────
//
// A vertical strip of values behind a fixed center band, iOS-timer style:
// tracks the finger per pixel, coasts with momentum on release, then snaps to
// the nearest row and reports it. Tapping the rows above/below steps by one;
// tapping the center value focuses an invisible input for typing.

interface WheelProps {
  count: number;               // number of positions in the cycle
  wrap: boolean;               // wrap around (month/day/hour) vs clamp (year)
  index: number;               // selected position, 0-based
  width: number;
  textFor: (i: number) => string;
  onSettle: (i: number) => void;
  theme: Theme;
  inputValue: string;
  onInputText: (t: string) => void;
  inputMaxLen: number;
  inputRef?: React.RefObject<TextInput | null>;
  inputPlaceholder: string;
}

function Wheel({
  count, wrap, index, width, textFor, onSettle, theme,
  inputValue, onInputText, inputMaxLen, inputRef, inputPlaceholder,
}: WheelProps) {
  // offset = continuous position in row units; row `index` sits centered when
  // offset === index
  const [offset, setOffsetState] = useState(index);
  const [focused, setFocused] = useState(false);
  const offsetRef = useRef(index);
  const dragBase = useRef(0);
  const raf = useRef<number | null>(null);
  const interacting = useRef(false);

  // Gesture callbacks and rAF ticks outlive the render that created them, so
  // they read everything through this ref.
  const live = useRef({ count, wrap, onSettle });
  live.current = { count, wrap, onSettle };

  const setOffset = (v: number) => { offsetRef.current = v; setOffsetState(v); };

  const normalize = (i: number) => {
    const { count: n, wrap: w } = live.current;
    return w ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i));
  };

  const stopAnim = () => {
    if (raf.current != null) { cancelAnimationFrame(raf.current); raf.current = null; }
  };
  useEffect(() => stopAnim, []);

  // Follow the parent when it moves the value (typing, month-length clamp)
  useEffect(() => {
    if (!interacting.current && raf.current == null && normalize(Math.round(offsetRef.current)) !== index) {
      setOffset(index);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, count]);

  const finish = (target: number) => {
    const i = normalize(target);
    setOffset(i);
    live.current.onSettle(i);
  };

  // Ease-out glide to a row, then report it
  const settleTo = (rawTarget: number) => {
    const target = Math.round(rawTarget);
    const start = offsetRef.current;
    const dist = target - start;
    stopAnim();
    if (Math.abs(dist) < 0.001) { finish(target); return; }
    const dur = Math.min(900, 160 + Math.abs(dist) * 110);
    const t0 = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - t0) / dur);
      const ease = 1 - Math.pow(1 - t, 3);
      setOffset(start + dist * ease);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else { raf.current = null; finish(target); }
    };
    raf.current = requestAnimationFrame(tick);
  };

  const pan = useMemo(() =>
    Gesture.Pan()
      .runOnJS(true)
      .activeOffsetY([-4, 4])
      .failOffsetX([-10, 10])
      .onStart(() => {
        Keyboard.dismiss();
        stopAnim();
        interacting.current = true;
        dragBase.current = offsetRef.current;
      })
      .onUpdate(e => {
        const { count: n, wrap: w } = live.current;
        let v = dragBase.current - e.translationY / ITEM_H;
        if (!w) v = Math.min(n - 1 + OVERSCROLL, Math.max(-OVERSCROLL, v));
        setOffset(v);
      })
      .onEnd(e => {
        interacting.current = false;
        const { count: n, wrap: w } = live.current;
        let target = offsetRef.current - (e.velocityY / ITEM_H) * MOMENTUM_S;
        if (!w) target = Math.min(n - 1, Math.max(0, target));
        settleTo(target);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  // Step-by-one taps on the rows above/below the center — RNGH taps so they
  // compose with the pan (a still tap fails the pan's activeOffset and lands
  // here; any real drag wins)
  const tapStepUp = useMemo(() =>
    Gesture.Tap().runOnJS(true).onEnd((_e, success) => {
      if (success) settleTo(Math.round(offsetRef.current) - 1);
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  []);
  const tapStepDown = useMemo(() =>
    Gesture.Tap().runOnJS(true).onEnd((_e, success) => {
      if (success) settleTo(Math.round(offsetRef.current) + 1);
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  const centerTop = WHEEL_H / 2 - ITEM_H / 2;
  const baseRow = Math.round(offset);
  const rows: React.ReactNode[] = [];
  for (let k = -3; k <= 3; k++) {
    const slot = baseRow + k;
    const y = centerTop + (slot - offset) * ITEM_H;
    if (y < -ITEM_H || y > WHEEL_H) continue;
    let text = '';
    if (wrap) text = textFor(normalize(slot));
    else if (slot >= 0 && slot < count) text = textFor(slot);
    const dist = Math.abs(slot - offset);
    const isCenter = dist < 0.5;
    rows.push(
      <Text
        key={k}
        style={[
          styles.wheelItem,
          {
            top: y,
            width,
            lineHeight: ITEM_H,
            fontSize: isCenter ? 17 : 13,
            color: isCenter ? theme.textPrimary : theme.muted,
            opacity: focused && isCenter ? 0 : isCenter ? 1 : dist < 1.5 ? 0.55 : 0.25,
          },
        ]}
      >
        {text}
      </Text>
    );
  }

  return (
    <GestureDetector gesture={pan}>
      <View style={{ width, height: WHEEL_H, overflow: 'hidden' }}>
        {rows}
        {/* Step-by-one tap zones over the faded rows */}
        <GestureDetector gesture={tapStepUp}>
          <View style={[styles.tapZone, { top: 0 }]} />
        </GestureDetector>
        <GestureDetector gesture={tapStepDown}>
          <View style={[styles.tapZone, { bottom: 0 }]} />
        </GestureDetector>
        {/* Invisible-until-focused input over the center row for typing */}
        <TextInput
          ref={inputRef}
          value={focused ? inputValue : ''}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChangeText={t => onInputText(t.replace(/\D/g, '').slice(0, inputMaxLen))}
          keyboardType="number-pad"
          placeholder={focused ? inputPlaceholder : undefined}
          placeholderTextColor={theme.muted}
          style={[styles.wheelInput, { top: centerTop, width, color: theme.textPrimary }]}
        />
      </View>
    </GestureDetector>
  );
}

// ── Date entry: MM / DD / YYYY · HH wheels + GO ───────────────────────────────

export default function HistoricalDateEntry({ date, minYear, maxYear, onDateChange, theme }: Props) {
  const [mm, setMm] = useState(pad2(date.month));
  const [dd, setDd] = useState(pad2(date.day));
  const [yyyy, setYyyy] = useState(String(date.year));
  const [hh, setHh] = useState(date.hour != null ? pad2(date.hour) : '');

  const ddRef = useRef<TextInput>(null);
  const yyyyRef = useRef<TextInput>(null);
  const hhRef = useRef<TextInput>(null);

  // Normalize whatever is currently typed into a valid date + optional hour
  const parseCurrent = (): DateParts => {
    const year = Math.min(maxYear, Math.max(minYear, parseInt(yyyy, 10) || maxYear));
    const month = Math.min(12, Math.max(1, parseInt(mm, 10) || 1));
    const daysInMonth = new Date(year, month, 0).getDate();
    const day = Math.min(daysInMonth, Math.max(1, parseInt(dd, 10) || 1));
    const hour = hh === '' ? null : Math.min(23, Math.max(0, parseInt(hh, 10) || 0));
    return { year, month, day, hour };
  };

  const setDisplay = ({ year, month, day, hour }: DateParts) => {
    setYyyy(String(year));
    setMm(pad2(month));
    setDd(pad2(day));
    setHh(hour != null ? pad2(hour) : '');
  };

  const parts = parseCurrent();
  const daysInMonth = new Date(parts.year, parts.month, 0).getDate();

  // Wheel settles are display-only — GO is what fires the fetch
  const updateField = (patch: Partial<DateParts>) => {
    const p = { ...parseCurrent(), ...patch };
    const dim = new Date(p.year, p.month, 0).getDate();
    if (p.day > dim) p.day = dim;
    setDisplay(p);
  };

  const commit = () => {
    Keyboard.dismiss();
    const p = parseCurrent();
    setDisplay(p);
    onDateChange(p);
  };

  const centerTop = WHEEL_H / 2 - ITEM_H / 2;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.wheels}>
          {/* iOS-style selection band behind the center row */}
          <View
            pointerEvents="none"
            style={[styles.band, { top: centerTop - 3, backgroundColor: theme.accentDim + '2e' }]}
          />
          <Wheel
            count={12}
            wrap
            index={parts.month - 1}
            width={44}
            textFor={i => pad2(i + 1)}
            onSettle={i => updateField({ month: i + 1 })}
            theme={theme}
            inputValue={mm}
            onInputText={t => {
              setMm(t);
              if (t.length === 2) ddRef.current?.focus();
            }}
            inputMaxLen={2}
            inputPlaceholder="MM"
          />
          <Text style={[styles.sep, { color: theme.muted, lineHeight: WHEEL_H }]}>/</Text>
          <Wheel
            count={daysInMonth}
            wrap
            index={parts.day - 1}
            width={44}
            textFor={i => pad2(i + 1)}
            onSettle={i => updateField({ day: i + 1 })}
            theme={theme}
            inputValue={dd}
            onInputText={t => {
              setDd(t);
              if (t.length === 2) yyyyRef.current?.focus();
            }}
            inputMaxLen={2}
            inputRef={ddRef}
            inputPlaceholder="DD"
          />
          <Text style={[styles.sep, { color: theme.muted, lineHeight: WHEEL_H }]}>/</Text>
          <Wheel
            count={maxYear - minYear + 1}
            wrap={false}
            index={parts.year - minYear}
            width={62}
            textFor={i => String(minYear + i)}
            onSettle={i => updateField({ year: minYear + i })}
            theme={theme}
            inputValue={yyyy}
            onInputText={t => {
              setYyyy(t);
              if (t.length === 4) hhRef.current?.focus();
            }}
            inputMaxLen={4}
            inputRef={yyyyRef}
            inputPlaceholder="YYYY"
          />
          <Text style={[styles.sep, { color: theme.muted, lineHeight: WHEEL_H }]}>·</Text>
          <Wheel
            count={25}
            wrap
            index={parts.hour == null ? 0 : parts.hour + 1}
            width={44}
            textFor={i => (i === 0 ? '--' : pad2(i - 1))}
            onSettle={i => updateField({ hour: i === 0 ? null : i - 1 })}
            theme={theme}
            inputValue={hh}
            onInputText={setHh}
            inputMaxLen={2}
            inputRef={hhRef}
            inputPlaceholder="--"
          />
        </View>
        <TouchableOpacity
          style={[styles.goButton, { borderColor: theme.accent }]}
          onPress={commit}
          activeOpacity={0.7}
        >
          <Text style={[styles.goText, { color: theme.accent }]}>GO</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.rangeLabel, { color: theme.muted }]}>
        {minYear} – {maxYear} · HR HST · -- = day avg · GO to load
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 6,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wheels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  band: {
    position: 'absolute',
    left: -4,
    right: -4,
    height: ITEM_H + 6,
    borderRadius: 8,
  },
  wheelItem: {
    position: 'absolute',
    left: 0,
    textAlign: 'center',
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 1,
  },
  wheelInput: {
    position: 'absolute',
    left: 0,
    height: ITEM_H,
    padding: 0,
    textAlign: 'center',
    fontFamily: 'Courier',
    fontWeight: '700',
    fontSize: 17,
    letterSpacing: 1,
    backgroundColor: 'transparent',
  },
  tapZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_H * 1.5,
  },
  sep: {
    fontFamily: 'Courier',
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
  },
  goButton: {
    borderWidth: 1.5,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  goText: {
    fontFamily: 'Courier',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 2,
  },
  rangeLabel: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 1,
    marginTop: 2,
  },
});
