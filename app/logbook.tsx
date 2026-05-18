import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  Image,
  Dimensions,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Svg, { Polygon, Path, Circle } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
// import { Audio } from 'expo-av'; // disabled: expo-av crashes on iOS 26
import { SwellRecord } from '../hooks/useSwellLog';
import { useSwellLogContext } from '../contexts/SwellLogContext';
import { useTheme } from '../hooks/useTheme';
import { useRelatedBuoyReadings, RelatedReading } from '../hooks/useRelatedBuoyReadings';
import { getCardinalDirection } from '../constants/formatters';

type SortKey = 'date' | 'size' | 'direction' | 'speed';

// ── Notebook paper layout constants (theme-independent) ───────────────────────

const MARGIN_X = 10;
const LINE_H   = 52;

// ── Notebook color palettes ───────────────────────────────────────────────────

interface NbColors {
  paper:          string;
  ruled:          string;
  marginC:        string;
  ink:            string;
  inkMid:         string;
  inkFaint:       string;
  expandedBg:     string;
  coverLabelBg:   string;
  deleteBtnColor: string;
  isNight:        boolean;
}

const DAY_COLORS: NbColors = {
  paper:          '#f0f4ff',   // cool blue-white
  ruled:          '#c4cfe8',   // blue-gray ruled lines
  marginC:        '#2255cc',   // blue accent
  ink:            '#0d1433',   // dark navy ink
  inkMid:         '#3a4a7a',   // mid navy
  inkFaint:       '#8899cc',   // faint blue
  expandedBg:     '#e4ecff',   // light blue tint for expanded
  coverLabelBg:   '#0d1433',   // dark navy label
  deleteBtnColor: '#cc2222',
  isNight:        false,
};

/** Red-on-black nautical night palette — matches the app's NIGHT_THEME */
const NIGHT_COLORS: NbColors = {
  paper:          '#0a0000',   // NIGHT_THEME.background
  ruled:          '#2a0808',   // slightly brighter than gridLine for readability
  marginC:        '#ff3030',   // NIGHT_THEME.accent
  ink:            '#ffe8e8',   // NIGHT_THEME.textPrimary
  inkMid:         '#883030',   // NIGHT_THEME.muted
  inkFaint:       '#5a1010',   // NIGHT_THEME.accentDim
  expandedBg:     '#120000',   // slightly lighter than paper
  coverLabelBg:   '#1a0808',   // dark red-tinted label background
  deleteBtnColor: '#ff4040',   // vivid red keeps destructive action clear
  isNight:        true,
};

// ── Color context ─────────────────────────────────────────────────────────────

const NbColorsContext = React.createContext<NbColors>(DAY_COLORS);
function useNbColors(): NbColors { return React.useContext(NbColorsContext); }

// ── Dynamic style factory ─────────────────────────────────────────────────────

function makeNbStyles(c: NbColors) {
  return StyleSheet.create({
    page: {
      backgroundColor: c.paper,
    },
    marginLine: {
      position: 'absolute',
      left: MARGIN_X,
      top: 0,
      bottom: 0,
      width: 1.5,
      backgroundColor: c.marginC,
      zIndex: 10,
      pointerEvents: 'none',
    },

    // ── Cover label ──
    coverRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingLeft: MARGIN_X + 10,
      paddingRight: 14,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.ruled,
    },
    coverLabel: {
      backgroundColor: c.coverLabelBg,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 3,
    },
    coverTitle: {
      fontFamily: 'Courier',
      fontWeight: '900',
      fontSize: 12,
      letterSpacing: 5,
      color: c.paper,
    },
    clearBtn: {
      fontFamily: 'Courier',
      fontSize: 9,
      letterSpacing: 2,
      color: c.inkFaint,
    },

    // ── Sort tabs ──
    sortTab: {
      paddingHorizontal: 10,
      paddingVertical: 2,
    },
    sortLabel: {
      fontFamily: 'Courier',
      fontSize: 9,
      letterSpacing: 2,
      color: c.inkFaint,
    },
    sortActive: {
      color: c.marginC,
      textDecorationLine: 'underline',
    },

    // ── Ruled row ──
    row: {
      height: LINE_H,
      borderBottomWidth: 1,
      borderBottomColor: c.ruled,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: MARGIN_X + 9,
      paddingRight: 12,
    },

    // ── Entry fields ──
    entryDay: {
      fontFamily: 'Courier',
      fontWeight: '900',
      fontSize: 18,
      color: c.marginC,
      letterSpacing: 2,
      marginRight: 6,
    },
    entryDate: {
      fontFamily: 'Courier',
      fontWeight: '700',
      fontSize: 18,
      color: c.ink,
      letterSpacing: 1,
    },
    entryTime: {
      fontFamily: 'Courier',
      fontSize: 16,
      color: c.inkMid,
    },
    station: {
      fontFamily: 'Courier',
      fontWeight: '700',
      fontSize: 16,
      color: c.inkMid,
      letterSpacing: 2,
      flex: 1,
    },
    spotLine: {
      fontFamily: 'Courier',
      fontWeight: '700',
      fontSize: 18,
      color: c.marginC,
      letterSpacing: 1,
      flex: 1,
    },
    swellLine: {
      fontFamily: 'Courier',
      fontWeight: '600',
      fontSize: 18,
      color: c.ink,
      letterSpacing: 0.4,
      flex: 1,
    },
    metaLine: {
      fontFamily: 'Courier',
      fontSize: 16,
      color: c.inkMid,
      letterSpacing: 0.8,
    },

    // ── Expanded (photo / audio / delete) ──
    expanded: {
      backgroundColor: c.expandedBg,
      marginLeft: MARGIN_X + 1.5,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.ruled,
    },
    photo: {
      width: '100%',
      height: 160,
      borderRadius: 3,
      marginBottom: 8,
    },
    mediaRow: {
      flexDirection: 'row',
      gap: 16,
      marginBottom: 2,
    },
    sectionLabel: {
      fontFamily: 'Courier',
      fontSize: 8,
      letterSpacing: 2,
      color: c.inkFaint,
      marginTop: 10,
      marginBottom: 2,
    },
    mediaBtn: {
      fontFamily: 'Courier',
      fontSize: 10,
      letterSpacing: 1,
      color: c.inkMid,
      paddingVertical: 3,
    },
    deleteBtn: {
      fontFamily: 'Courier',
      fontSize: 9,
      letterSpacing: 1,
      color: c.deleteBtnColor,
    },

    // ── Screen header (full-screen mode) ──
    screenHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: LINE_H * 2,
      paddingLeft: MARGIN_X + 9,
      paddingRight: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.ruled,
      backgroundColor: c.paper,
    },
    screenTitle: {
      fontFamily: 'Courier',
      fontWeight: '900',
      fontSize: 13,
      letterSpacing: 4,
      color: c.ink,
    },
    backBtn: {
      fontFamily: 'Courier',
      fontWeight: '700',
      fontSize: 11,
      color: c.marginC,
      letterSpacing: 1,
    },

    // ── Empty state ──
    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 30,
    },
    emptyText: {
      fontFamily: 'Courier',
      fontSize: 14,
      color: c.inkMid,
      marginBottom: 10,
    },
    emptyHint: {
      fontFamily: 'Courier',
      fontSize: 11,
      color: c.inkFaint,
      textAlign: 'center',
      lineHeight: 18,
    },

    // ── PIN gate screen ──
    pinScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
    },
    pinPrompt: {
      fontFamily: 'Courier',
      fontSize: 10,
      letterSpacing: 2,
      color: c.inkFaint,
      marginTop: 20,
      marginBottom: 4,
    },
    pinDots: {
      flexDirection: 'row',
      gap: 14,
      marginVertical: 24,
    },
    pinDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: c.ink,
      backgroundColor: 'transparent',
    },
    pinError: {
      fontFamily: 'Courier',
      fontSize: 9,
      letterSpacing: 2,
      color: c.marginC,
      marginBottom: 14,
    },
    pinHint: {
      fontFamily: 'Courier',
      fontSize: 9,
      letterSpacing: 1,
      color: c.inkFaint,
      marginBottom: 8,
    },

    // ── NumPad ──
    numRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 10,
    },
    numKey: {
      width: 64,
      height: 44,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: c.inkMid,
      alignItems: 'center',
      justifyContent: 'center',
    },
    numLabel: {
      fontFamily: 'Courier',
      fontSize: 20,
      color: c.ink,
    },

    // ── PIN setup modal ──
    pinModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinModalBox: {
      width: 300,
      backgroundColor: c.paper,
      borderRadius: 6,
      overflow: 'hidden',
      paddingTop: 20,
    },
    pinModalTitle: {
      fontFamily: 'Courier',
      fontWeight: '900',
      fontSize: 12,
      letterSpacing: 4,
      color: c.ink,
      textAlign: 'center',
      marginBottom: 20,
      paddingHorizontal: 20,
    },
    pinMenuBtn: {
      borderWidth: 1,
      borderColor: c.inkMid,
      borderRadius: 4,
      paddingVertical: 12,
      alignItems: 'center',
    },
    pinMenuBtnText: {
      fontFamily: 'Courier',
      fontWeight: '700',
      fontSize: 10,
      letterSpacing: 2,
      color: c.ink,
    },
  });
}

// Pre-compute both theme style sets once at module level (no per-render cost)
const nbDay   = makeNbStyles(DAY_COLORS);
const nbNight = makeNbStyles(NIGHT_COLORS);

// ── Entry card styles (theme-color-independent layout) ────────────────────────

const es = StyleSheet.create({
  card: {
    borderBottomWidth: 1,
    position: 'relative',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 2,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 4,
  },
  chipVal: {
    fontFamily: 'Courier',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  chipUnit: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  chipDiv: {
    width: 1,
    height: 12,
    alignSelf: 'center',
    marginHorizontal: 2,
  },
  spotName: {
    fontFamily: 'Courier',
    fontWeight: '900',
    fontSize: 18,
    letterSpacing: 1,
  },
  dateGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  dateText: {
    fontFamily: 'Courier',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 1,
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  stationText: {
    fontFamily: 'Courier',
    fontSize: 9,
    letterSpacing: 2,
    flex: 1,
  },
  timeText: {
    fontFamily: 'Courier',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  metric: {
    alignItems: 'center',
    width: 58,
  },
  bigNum: {
    fontFamily: 'Courier',
    fontWeight: '900',
    fontSize: 34,
    letterSpacing: 1,
    lineHeight: 38,
  },
  bigUnit: {
    fontFamily: 'Courier',
    fontWeight: '700',
    fontSize: 9,
    letterSpacing: 2,
  },
  metricDiv: {
    width: 1,
    height: 48,
    marginHorizontal: 10,
  },
  cardRedLine: {
    position: 'absolute',
    // 14 (padding) + 58 (FT) + 21 (div+margins) + 58 (SEC) + 21 (div+margins) = 172, +6 buffer
    left: 178,
    top: 0,
    bottom: 0,
    width: 1.5,
  },
  tideBlock: {
    flex: 1,
    alignItems: 'center',
  },
  tideText: {
    fontFamily: 'Courier',
    fontSize: 9,
    letterSpacing: 1,
    marginTop: 3,
    textAlign: 'center',
  },
  secRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderTopWidth: 1,
  },
  secText: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 0.5,
    flex: 1,
  },
});

// ── PIN storage ───────────────────────────────────────────────────────────────

const PIN_STORAGE_KEY = '@budat/logbook_pin';

// Module-level flag: PIN unlocked for the current app session
let _sessionUnlocked = false;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLogTimestamp(isoStr: string): { day: string; date: string; time: string } {
  const d = new Date(isoStr);
  const hi = new Date(d.getTime() - 10 * 3600000);
  const days   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const hr = hi.getUTCHours();
  const mn = hi.getUTCMinutes();
  const h12 = hr % 12 || 12;
  return {
    day:  days[hi.getUTCDay()],
    date: `${months[hi.getUTCMonth()]} ${hi.getUTCDate()}`,
    time: `${h12}:${String(mn).padStart(2,'0')} ${hr >= 12 ? 'PM' : 'AM'}`,
  };
}

function arrowPoints(cx: number, cy: number, len: number, wid: number, travelDeg: number): string {
  const r = len / 2;
  const headW = wid * 0.5;
  const headH = len * 0.38;
  const shaftW = wid * 0.18;
  const pts: [number, number][] = [
    [0, -r], [headW, -r + headH], [shaftW, -r + headH],
    [shaftW, r], [-shaftW, r], [-shaftW, -r + headH], [-headW, -r + headH],
  ];
  const rad = (travelDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pts.map(([px, py]) => `${cx + px*cos - py*sin},${cy + px*sin + py*cos}`).join(' ');
}

async function copyToDocuments(uri: string, ext: string): Promise<string> {
  const dest = `${FileSystem.documentDirectory}swell_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

// ── Inline swell direction arrow (fits in one ruled line) ─────────────────────

function InlineArrow({ directionDeg }: { directionDeg: number }) {
  const colors = useNbColors();
  const sz = 14;
  const travelDeg = (directionDeg + 180) % 360;
  return (
    <Svg width={sz} height={sz} style={{ marginRight: 6, marginTop: 1 }}>
      <Polygon points={arrowPoints(sz/2, sz/2, sz, sz * 0.5, travelDeg)} fill={colors.ink} />
    </Svg>
  );
}

// ── Moon phase icon ───────────────────────────────────────────────────────────

function MoonIcon({ phase, size, color }: { phase?: string | null; size: number; color: string }) {
  if (!phase) return null;

  // Parse illumination from "NEW", "FULL", or "78%" (percent string)
  let illum: number;
  if (phase === 'FULL') {
    illum = 1;
  } else if (phase === 'NEW') {
    illum = 0;
  } else {
    // Strip any non-numeric suffix and parse
    const pct = parseInt(phase.replace(/[^0-9]/g, ''), 10);
    illum = isNaN(pct) ? 0.5 : pct / 100;
  }

  const r = Math.max(1, Math.floor(size / 2) - 1);
  const cx = size / 2;
  const cy = size / 2;

  if (illum <= 0.02) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={1} fill="none" opacity={0.5} />
      </Svg>
    );
  }
  if (illum >= 0.98) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} fill={color} opacity={0.9} />
      </Svg>
    );
  }

  // Crescent / gibbous: right half lit, terminator ellipse
  const isGibbous = illum > 0.5;
  const termRx = Math.max(0.1, r * Math.abs(1 - 2 * illum));
  const topX = cx.toFixed(2);
  const topY = (cy - r).toFixed(2);
  const botY = (cy + r).toFixed(2);
  const sweepTerm = isGibbous ? 1 : 0;
  const d = `M ${topX} ${topY} A ${r} ${r} 0 0 1 ${topX} ${botY} A ${termRx.toFixed(2)} ${r} 0 0 ${sweepTerm} ${topX} ${topY} Z`;

  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={0.5} fill="none" opacity={0.3} />
      <Path d={d} fill={color} opacity={0.85} />
    </Svg>
  );
}

// ── Related buoy row ──────────────────────────────────────────────────────────

function RelatedBuoyRows({ rec }: { rec: SwellRecord }) {
  const colors = useNbColors();
  const { readings, loading } = useRelatedBuoyReadings(rec);

  if (loading) {
    return (
      <View style={rb.row}>
        <Text style={[rb.label, { color: colors.inkFaint }]}>CORRELATING…</Text>
      </View>
    );
  }
  if (!readings.length) return null;

  return (
    <>
      {readings.map(r => {
        const hrs = Math.abs(r.offsetHours);
        const hLabel = hrs < 1
          ? `${Math.round(hrs * 60)}m`
          : `${hrs.toFixed(1)}h`;
        const when = r.offsetHours < 0 ? `${hLabel} BEFORE` : `${hLabel} AFTER`;
        // Hawaii time for actual reading
        const hiDate = new Date(r.actualTime.getTime() - 10 * 3600_000);
        const hh = hiDate.getUTCHours(), mm = hiDate.getUTCMinutes();
        const isPm = hh >= 12;
        const h12 = hh % 12 || 12;
        const timeStr = `${h12}:${String(mm).padStart(2,'0')}${isPm ? 'p' : 'a'}`;
        const dirLabel = r.dirDeg != null ? getCardinalDirection(r.dirDeg) : '—';

        return (
          <View key={r.stationId} style={[rb.row, { borderTopColor: colors.ruled }]}>
            <Text style={[rb.station, { color: colors.inkFaint }]}>{r.stationName}</Text>
            <Text style={[rb.when, { color: colors.inkFaint }]}>{when}</Text>
            <Text style={[rb.val, { color: colors.inkMid }]}>{r.heightFt.toFixed(1)}ft</Text>
            <Text style={[rb.val, { color: colors.inkMid }]}>{r.period.toFixed(0)}s</Text>
            <Text style={[rb.val, { color: colors.inkMid }]}>{dirLabel}</Text>
            <Text style={[rb.time, { color: colors.inkFaint }]}>{timeStr}</Text>
          </View>
        );
      })}
    </>
  );
}

const rb = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderTopWidth: 1,
    gap: 8,
  },
  station: {
    fontFamily: 'Courier',
    fontSize: 8,
    letterSpacing: 1,
    fontWeight: '700',
    flex: 1,
  },
  when: {
    fontFamily: 'Courier',
    fontSize: 8,
    letterSpacing: 0.5,
  },
  val: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  time: {
    fontFamily: 'Courier',
    fontSize: 8,
    letterSpacing: 0.5,
  },
  label: {
    fontFamily: 'Courier',
    fontSize: 8,
    letterSpacing: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
});

// ── Big direction arrow (metric-row size) ────────────────────────────────────

function BigArrow({ directionDeg }: { directionDeg: number }) {
  const colors = useNbColors();
  const sz = 34;
  const travelDeg = (directionDeg + 180) % 360;
  return (
    <Svg width={sz} height={sz}>
      <Polygon points={arrowPoints(sz/2, sz/2, sz, sz * 0.5, travelDeg)} fill={colors.ink} />
    </Svg>
  );
}

// ── Tide mini-graph ───────────────────────────────────────────────────────────

function TideGraph({ heightFt, label, accentColor, dimColor }: {
  heightFt: number | null;
  label?: string | null;
  accentColor: string;
  dimColor: string;
}) {
  const W = 56, H = 24;
  const midY = H / 2;
  const amp  = H * 0.36;

  // Sine wave path (one full cycle)
  let wavePath = '';
  for (let i = 0; i <= 64; i++) {
    const x = (i / 64) * W;
    const y = midY - Math.sin((i / 64) * 2 * Math.PI) * amp;
    wavePath += i === 0 ? `M ${x.toFixed(1)},${y.toFixed(1)}` : ` L ${x.toFixed(1)},${y.toFixed(1)}`;
  }

  // Dot position from tideLabel
  const lc = (label ?? '').toUpperCase();
  let phase = 0.5; // default mid-cycle
  if (lc.includes('HIGH'))                               phase = 0.25;
  else if (lc.includes('LOW'))                           phase = 0.75;
  else if (lc.includes('FALL') || lc.includes('EBBING')) phase = 0.45;
  else if (lc.includes('RIS')  || lc.includes('FLOOD'))  phase = 0.05;
  else if (lc.includes('P')) /* old "3:30p" format — PM, likely falling afternoon */ phase = 0.45;
  else if (lc.includes('A')) /* old "7:02a" format — AM, likely rising morning */    phase = 0.05;

  const dotX = phase * W;
  const dotY = midY - Math.sin(phase * 2 * Math.PI) * amp;

  if (heightFt == null) {
    return (
      <Svg width={W} height={H}>
        <Path d={wavePath} stroke={dimColor} strokeWidth={1.2} fill="none" opacity={0.3} />
      </Svg>
    );
  }

  return (
    <Svg width={W} height={H}>
      <Path d={wavePath} stroke={accentColor} strokeWidth={1.5} fill="none" opacity={0.7} />
      <Circle cx={dotX} cy={dotY} r={2.5} fill={accentColor} opacity={1} />
    </Svg>
  );
}

// ── Ruled line row ────────────────────────────────────────────────────────────

function RuledRow({ children, style }: { children?: React.ReactNode; style?: object }) {
  const colors = useNbColors();
  const nb = colors.isNight ? nbNight : nbDay;
  return <View style={[nb.row, style]}>{children}</View>;
}

// ── NumPad ────────────────────────────────────────────────────────────────────

function NumPad({ value, onChange, disabled }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const colors = useNbColors();
  const nb = colors.isNight ? nbNight : nbDay;
  const rows = [['1','2','3'],['4','5','6'],['7','8','9'],['','0','⌫']];
  return (
    <View>
      {rows.map((row, ri) => (
        <View key={ri} style={nb.numRow}>
          {row.map((key, ki) => (
            <TouchableOpacity
              key={ki}
              style={[nb.numKey, !key && { borderColor: 'transparent' }]}
              onPress={() => {
                if (!key || disabled) return;
                if (key === '⌫') onChange(value.slice(0, -1));
                else if (value.length < 4) onChange(value + key);
              }}
              activeOpacity={key ? 0.6 : 1}
              disabled={!key || disabled || (key !== '⌫' && value.length >= 4)}
            >
              {key ? <Text style={nb.numLabel}>{key}</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── PIN dots indicator ────────────────────────────────────────────────────────

function PinDots({ count, error }: { count: number; error: boolean }) {
  const colors = useNbColors();
  const nb = colors.isNight ? nbNight : nbDay;
  return (
    <View style={nb.pinDots}>
      {[0,1,2,3].map(i => (
        <View
          key={i}
          style={[
            nb.pinDot,
            i < count && { backgroundColor: error ? colors.marginC : colors.ink },
            error && { borderColor: colors.marginC },
          ]}
        />
      ))}
    </View>
  );
}

// ── PIN setup modal ───────────────────────────────────────────────────────────

function PinSetupModal({
  visible,
  currentPin,
  onDone,
  onClose,
}: {
  visible: boolean;
  currentPin: string | null;
  onDone: (newPin: string | null) => void;
  onClose: () => void;
}) {
  const colors = useNbColors();
  const nb = colors.isNight ? nbNight : nbDay;

  type Step = 'menu' | 'enter_new' | 'confirm_new' | 'verify_remove';
  const [step, setStep] = useState<Step>('menu');
  const [entry, setEntry] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (visible) { setStep('menu'); setEntry(''); setNewPin(''); setError(false); }
  }, [visible]);

  const shake = () => {
    setError(true);
    setTimeout(() => { setError(false); setEntry(''); }, 800);
  };

  const handleEntry = (v: string) => {
    setEntry(v);
    if (v.length < 4) return;

    if (step === 'enter_new') {
      setNewPin(v);
      setEntry('');
      setStep('confirm_new');
    } else if (step === 'confirm_new') {
      if (v === newPin) {
        onDone(v);
      } else {
        shake();
        setTimeout(() => setStep('enter_new'), 900);
      }
    } else if (step === 'verify_remove') {
      if (v === currentPin) {
        onDone(null); // remove PIN
      } else {
        shake();
      }
    }
  };

  const title = {
    menu:         'PIN SETTINGS',
    enter_new:    'SET NEW PIN',
    confirm_new:  'CONFIRM PIN',
    verify_remove:'ENTER CURRENT PIN',
  }[step];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={nb.pinModalOverlay}>
        <View style={nb.pinModalBox}>
          <Text style={nb.pinModalTitle}>{title}</Text>

          {step === 'menu' ? (
            <View style={{ gap: 12, paddingHorizontal: 20, paddingBottom: 20 }}>
              {!currentPin ? (
                <TouchableOpacity style={nb.pinMenuBtn} onPress={() => { setEntry(''); setStep('enter_new'); }}>
                  <Text style={nb.pinMenuBtnText}>SET PIN LOCK</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity style={nb.pinMenuBtn} onPress={() => { setEntry(''); setStep('enter_new'); }}>
                    <Text style={nb.pinMenuBtnText}>CHANGE PIN</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[nb.pinMenuBtn, { borderColor: colors.marginC }]} onPress={() => { setEntry(''); setStep('verify_remove'); }}>
                    <Text style={[nb.pinMenuBtnText, { color: colors.marginC }]}>REMOVE PIN LOCK</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity style={[nb.pinMenuBtn, { borderColor: 'transparent' }]} onPress={onClose}>
                <Text style={[nb.pinMenuBtnText, { color: colors.inkFaint }]}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingBottom: 24 }}>
              {step === 'confirm_new' && (
                <Text style={nb.pinHint}>Re-enter to confirm</Text>
              )}
              <PinDots count={entry.length} error={error} />
              {error && <Text style={nb.pinError}>MISMATCH — TRY AGAIN</Text>}
              <NumPad value={entry} onChange={handleEntry} disabled={error} />
              <TouchableOpacity onPress={() => { setStep('menu'); setEntry(''); }} style={{ marginTop: 16 }}>
                <Text style={[nb.pinMenuBtnText, { color: colors.inkFaint }]}>← BACK</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── PIN gate ──────────────────────────────────────────────────────────────────
// Wraps children behind a PIN entry screen if a PIN is set.
// Once unlocked, stays unlocked for the app session.

function PinGate({ children }: { children: React.ReactNode }) {
  const colors = useNbColors();
  const nb = colors.isNight ? nbNight : nbDay;

  // undefined = still loading from storage
  const [pin, setPin] = useState<string | null | undefined>(undefined);
  const [unlocked, setUnlocked] = useState(_sessionUnlocked);
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PIN_STORAGE_KEY)
      .then(v => setPin(v))
      .catch(() => setPin(null));
  }, []);

  const handleEntry = (v: string) => {
    setEntry(v);
    if (v.length < 4) return;
    if (v === pin) {
      _sessionUnlocked = true;
      setUnlocked(true);
    } else {
      setError(true);
      setTimeout(() => { setEntry(''); setError(false); }, 800);
    }
  };

  // Still loading PIN from storage
  if (pin === undefined) {
    return (
      <View style={[nb.page, nb.pinScreen]}>
        <ActivityIndicator color={colors.inkMid} />
      </View>
    );
  }

  // No PIN set, or already unlocked this session
  if (!pin || unlocked) return <>{children}</>;

  // PIN entry screen
  return (
    <View style={[nb.page, nb.pinScreen]}>
      <Text style={nb.screenTitle}>LOGBOOK</Text>
      <Text style={nb.pinPrompt}>ENTER PIN TO UNLOCK</Text>
      <PinDots count={entry.length} error={error} />
      {error && <Text style={nb.pinError}>INCORRECT PIN</Text>}
      <NumPad value={entry} onChange={handleEntry} disabled={error} />
    </View>
  );
}

// ── Audio controls ────────────────────────────────────────────────────────────

function AudioControls(_props: { audioUri?: string; onRecorded: (uri: string) => void }) {
  // Audio disabled — expo-av crashes on iOS 26 in TurboModule layer
  return null;
}

// ── Swipeable row (left-swipe reveals delete) ─────────────────────────────────

const DELETE_W = 80;

function SwipeableRow({ onDelete, children }: { onDelete: () => void; children: React.ReactNode }) {
  const colors = useNbColors();

  const renderDelete = () => (
    <TouchableOpacity
      onPress={onDelete}
      style={{
        width: DELETE_W,
        backgroundColor: colors.deleteBtnColor,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text style={{ fontFamily: 'Courier', fontWeight: '700', fontSize: 10, color: '#fff', letterSpacing: 2 }}>
        DELETE
      </Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable renderRightActions={renderDelete} overshootRight={false}>
      {children}
    </Swipeable>
  );
}

// ── Logbook content ───────────────────────────────────────────────────────────

function LogbookContent({ height }: { height?: number }) {
  const colors = useNbColors();
  const nb = colors.isNight ? nbNight : nbDay;

  const { records, deleteRecord, updateRecord, clearAll } = useSwellLogContext();
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // PIN management
  const [storedPin, setStoredPin]         = useState<string | null>(null);
  const [pinSettingsVisible, setPinSettingsVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PIN_STORAGE_KEY)
      .then(v => setStoredPin(v))
      .catch(() => {});
  }, []);

  const handlePinSaved = useCallback(async (newPin: string | null) => {
    if (newPin) {
      await AsyncStorage.setItem(PIN_STORAGE_KEY, newPin).catch(() => {});
      setStoredPin(newPin);
      _sessionUnlocked = true; // setting a new PIN implies you're already unlocked
    } else {
      await AsyncStorage.removeItem(PIN_STORAGE_KEY).catch(() => {});
      setStoredPin(null);
      _sessionUnlocked = true;
    }
    setPinSettingsVisible(false);
  }, []);

  const sorted = useMemo(() => {
    const copy = [...records];
    switch (sortKey) {
      case 'date':      return copy.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      case 'size':      return copy.sort((a, b) => b.heightFt - a.heightFt);
      case 'direction': return copy.sort((a, b) => a.directionDeg - b.directionDeg);
      case 'speed':     return copy.sort((a, b) => b.speedMph - a.speedMph);
    }
  }, [records, sortKey]);

  const pickPhoto = useCallback(async (id: string) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (res.canceled || !res.assets?.[0]) return;
    const uri = res.assets[0].uri;
    const dest = await copyToDocuments(uri, uri.split('.').pop() ?? 'jpg').catch(() => uri);
    updateRecord(id, { photoUri: dest });
  }, [updateRecord]);

  const takePhoto = useCallback(async (id: string) => {
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (res.canceled || !res.assets?.[0]) return;
    const uri = res.assets[0].uri;
    const dest = await copyToDocuments(uri, uri.split('.').pop() ?? 'jpg').catch(() => uri);
    updateRecord(id, { photoUri: dest });
  }, [updateRecord]);

  const SORT_TABS: { key: SortKey; label: string }[] = [
    { key: 'date',      label: 'DATE'  },
    { key: 'size',      label: 'SIZE'  },
    { key: 'direction', label: 'DIR'   },
    { key: 'speed',     label: 'SPEED' },
  ];

  const W = Dimensions.get('window').width;

  return (
    <View style={[nb.page, height ? { height, width: W } : { flex: 1 }]}>
      {/* Cover label row */}
      {height != null && (
        <View style={nb.coverRow}>
          <View style={nb.coverLabel}>
            <Text style={nb.coverTitle}>LOGBOOK</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {/* PIN lock settings button */}
            <TouchableOpacity onPress={() => setPinSettingsVisible(true)}>
              <Text style={[nb.clearBtn, { color: storedPin ? colors.marginC : colors.inkFaint }]}>
                {storedPin ? 'LOCKED' : 'LOCK'}
              </Text>
            </TouchableOpacity>
            {records.length > 0 && (
              <TouchableOpacity
                onPress={() => Alert.alert('Clear All', `Delete all ${records.length} entries?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete All', style: 'destructive', onPress: clearAll },
                ])}
              >
                <Text style={nb.clearBtn}>CLEAR ALL</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Sort tabs on a ruled line */}
      <RuledRow>
        {SORT_TABS.map(tab => (
          <TouchableOpacity key={tab.key} onPress={() => setSortKey(tab.key)} style={nb.sortTab}>
            <Text style={[nb.sortLabel, sortKey === tab.key && nb.sortActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
        {/* Lock button in non-cover mode (full screen / embedded without cover) */}
        {height == null && (
          <TouchableOpacity onPress={() => setPinSettingsVisible(true)} style={[nb.sortTab, { marginLeft: 'auto' }]}>
            <Text style={[nb.sortLabel, { color: storedPin ? colors.marginC : colors.inkFaint }]}>
              {storedPin ? 'LOCK' : 'LOCK'}
            </Text>
          </TouchableOpacity>
        )}
      </RuledRow>

      {records.length === 0 ? (
        <View style={nb.empty}>
          <Text style={nb.emptyText}>No entries logged.</Text>
          <Text style={nb.emptyHint}>Double-tap a buoy on the map to log a session.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          {sorted.map(rec => {
            const expanded = expandedId === rec.id;
            const ts = formatLogTimestamp(rec.timestamp);

            return (
              <SwipeableRow
                key={rec.id}
                onDelete={() => Alert.alert('Delete Entry', 'Remove this entry from the log?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => { deleteRecord(rec.id); setExpandedId(null); } },
                ])}
              >
                <TouchableOpacity
                  onPress={() => setExpandedId(expanded ? null : rec.id)}
                  activeOpacity={0.8}
                >
                  <View style={{ borderBottomWidth: 1, borderBottomColor: colors.ruled, paddingLeft: MARGIN_X + 9, paddingRight: 12, paddingTop: 9, paddingBottom: 9, backgroundColor: colors.paper }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 3 }}>
                      <Text style={nb.entryDay}>{ts.date}</Text>
                      <Text style={[nb.entryDate, { fontSize: 13, marginRight: 8 }]}>{ts.day}</Text>
                      <Text style={[nb.entryTime, { fontSize: 13, marginRight: 8 }]}>
                        {ts.time.replace(' AM','a').replace(' PM','p')}
                      </Text>
                      <Text style={[nb.spotLine, { fontSize: 15 }]} numberOfLines={1}>
                        {rec.spot || '—'}
                      </Text>
                    </View>
                    <Text style={[nb.metaLine, { fontSize: 12 }]} numberOfLines={1}>
                      {rec.heightFt.toFixed(1)}ft  {rec.period.toFixed(0)}s  {rec.directionLabel}
                      {rec.windKt != null ? `  ${Math.round(rec.windKt)}kt ${rec.windDirLabel ?? ''}` : ''}
                      {rec.tideHeightFt != null ? `  ${rec.tideHeightFt.toFixed(1)}ft` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Expanded: photo + audio */}
                {expanded && (
                  <View style={[nb.expanded, { backgroundColor: colors.expandedBg, borderColor: colors.ruled }]}>
                    {rec.photoUri
                      ? <Image source={{ uri: rec.photoUri }} style={nb.photo} resizeMode="cover" />
                      : null}
                    <View style={nb.mediaRow}>
                      <TouchableOpacity onPress={() => takePhoto(rec.id)}>
                        <Text style={nb.mediaBtn}>{rec.photoUri ? '↺ RETAKE' : '⊙ CAMERA'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => pickPhoto(rec.id)}>
                        <Text style={nb.mediaBtn}>{rec.photoUri ? '↺ REPLACE' : '⊕ LIBRARY'}</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={nb.sectionLabel}>AUDIO NOTE</Text>
                    <AudioControls
                      audioUri={rec.audioUri}
                      onRecorded={uri => updateRecord(rec.id, { audioUri: uri })}
                    />
                  </View>
                )}
              </SwipeableRow>
            );
          })}
        </ScrollView>
      )}

      {/* PIN settings modal */}
      <PinSetupModal
        visible={pinSettingsVisible}
        currentPin={storedPin}
        onDone={handlePinSaved}
        onClose={() => setPinSettingsVisible(false)}
      />
    </View>
  );
}

// ── Theme provider wrapper ────────────────────────────────────────────────────

function NbThemeProvider({ children }: { children: React.ReactNode }) {
  const appTheme = useTheme();
  // Determine night mode by checking if the app theme matches the night accent color
  const isNight = appTheme.background === '#0a0000';
  const nbColors = isNight ? NIGHT_COLORS : DAY_COLORS;
  return (
    <NbColorsContext.Provider value={nbColors}>
      {children}
    </NbColorsContext.Provider>
  );
}

// ── Full screen (back button + safe area) ─────────────────────────────────────

export default function LogbookScreen() {
  const appTheme = useTheme();
  const isNight = appTheme.background === '#0a0000';
  const nbColors = isNight ? NIGHT_COLORS : DAY_COLORS;
  const nb = isNight ? nbNight : nbDay;

  const router = useRouter();
  return (
    <NbColorsContext.Provider value={nbColors}>
      <SafeAreaView style={{ flex: 1, backgroundColor: nbColors.paper }}>
        <View style={nb.screenHeader}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={nb.backBtn}>← BACK</Text>
          </TouchableOpacity>
          <Text style={nb.screenTitle}>LOGBOOK</Text>
          <View style={{ width: 70 }} />
        </View>
        <PinGate>
          <LogbookContent />
        </PinGate>
      </SafeAreaView>
    </NbColorsContext.Provider>
  );
}

// ── Embedded page (tab view, no chrome) ──────────────────────────────────────

export function LogbookPage({ height, theme }: { height: number; theme?: any }) {
  return (
    <NbThemeProvider>
      <PinGate>
        <LogbookContent height={height} />
      </PinGate>
    </NbThemeProvider>
  );
}
