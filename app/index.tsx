import React, { useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import Svg, { Polygon, Circle, Path } from 'react-native-svg';
import { NEARSHORE_STATIONS } from '../constants/buoys';
import { isOffline, getCardinalDirection } from '../constants/formatters';
import { HAWAII_STATIONS } from '../constants/hawaiiStations';
import { useBuoyData, BuoyReading } from '../hooks/useBuoyData';
import { useTideData } from '../hooks/useTideData';
import { useWindData } from '../hooks/useWindData';
import { useTheme } from '../hooks/useTheme';
import { useSelectedStation } from '../hooks/useSelectedStation';
import { useBuoyList } from '../hooks/useBuoyList';
import { useAlertSettings } from '../hooks/useAlertSettings';
import { useNewSwellAlert } from '../hooks/useNewSwellAlert';
import { useSwellLogContext } from '../contexts/SwellLogContext';
import HawaiiMap from '../components/HawaiiMap';
import TideChart from '../components/TideChart';
import DataScreen from '../components/DataScreen';
import { LogbookPage } from './logbook';
import { ForecastPage } from './forecast';
import MicWindScreen from '../components/MicWindScreen';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const TIDE_H = Math.floor(SCREEN_H * 0.38);
const WIND_INFO_H = 160;
const WIND_ARROW = 40;

function arrowPoints(cx: number, cy: number, size: number, travelDeg: number): string {
  const r = size * 0.42;
  const headW = size * 0.34;
  const headH = size * 0.40;
  const shaftW = size * 0.13;
  const pts: [number, number][] = [
    [0, -r],
    [headW / 2, -r + headH],
    [shaftW / 2, -r + headH],
    [shaftW / 2, r],
    [-shaftW / 2, r],
    [-shaftW / 2, -r + headH],
    [-headW / 2, -r + headH],
  ];
  const rad = (travelDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pts.map(([px, py]) => `${cx + px * cos - py * sin},${cy + px * sin + py * cos}`).join(' ');
}

// ── Sunrise / Sunset ─────────────────────────────────────────────────────────

/** Returns { riseMins, setMins } in minutes since midnight UTC for a given lat/lon/date.
 *  Uses NOAA solar algorithm (accurate to ~1 min). Returns null if no sunrise/set (polar). */
function sunriseSunsetUTC(lat: number, lon: number, date: Date): { riseMins: number; setMins: number } | null {
  const rad = Math.PI / 180;
  const JD = date.getTime() / 86400000 + 2440587.5;
  const n  = JD - 2451545.0;
  const L  = (280.46 + 0.9856474 * n) % 360;
  const g  = (357.528 + 0.9856003 * n) % 360;
  const lam = L + 1.915 * Math.sin(g * rad) + 0.020 * Math.sin(2 * g * rad);
  const eps = 23.439 - 0.0000004 * n;
  const sinDec = Math.sin(eps * rad) * Math.sin(lam * rad);
  const dec    = Math.asin(sinDec) / rad;
  const cosH   = (Math.cos(90.833 * rad) - sinDec * Math.sin(lat * rad))
               / (Math.cos(dec * rad) * Math.cos(lat * rad));
  if (cosH < -1 || cosH > 1) return null;          // midnight sun or polar night
  const H = Math.acos(cosH) / rad;
  const EqT = (L - lam) * 4;                       // approx equation of time (min)
  const noon = 720 - 4 * (lon) - EqT;              // solar noon in minutes UTC
  return {
    riseMins: noon - H * 4,
    setMins:  noon + H * 4,
  };
}

/** Format UTC-minutes-since-midnight to Hawaii (UTC-10) 12-hour time string */
function utcMinsToHawaii(utcMins: number): string {
  const hiMins = ((utcMins - 600) % 1440 + 1440) % 1440;
  const h24 = Math.floor(hiMins / 60);
  const mn  = Math.round(hiMins % 60);
  const isPm = h24 >= 12;
  const h12  = h24 % 12 || 12;
  return `${h12}:${String(mn).padStart(2,'0')}${isPm ? 'p' : 'a'}`;
}

// Hawaii approximate center lat/lon (Oahu)
const HI_LAT = 20.9;
const HI_LON = -157.7;

// ── Moon phase & rise ─────────────────────────────────────────────────────────

/** Returns phase 0–1 where 0=new, 0.5=full, using known new moon anchor. */
function moonPhase(date: Date): number {
  const knownNew = new Date('2000-01-06T18:14:00Z').getTime();
  const synodicMs = 29.53058867 * 24 * 3600 * 1000;
  return ((date.getTime() - knownNew) % synodicMs + synodicMs) % synodicMs / synodicMs;
}

/** Moon RA (deg) and Dec (deg) at a Julian Day — Meeus Ch. 47 simplified. */
function moonEquatorial(jde: number): { ra: number; dec: number } {
  const r = Math.PI / 180;
  const T = (jde - 2451545.0) / 36525;
  const L0 =  218.3164477 + 481267.88123421 * T;
  const M  =  134.9633964 + 477198.8675055  * T;
  const Ms =  357.5291092 +  35999.0502909  * T;
  const F  =   93.2720950 + 483202.0175233  * T;
  const D  =  297.8501921 + 445267.1114034  * T;
  const dL = (6288774 * Math.sin(M*r)
    + 1274027 * Math.sin((2*D - M)*r)
    +  658314 * Math.sin(2*D*r)
    +  213618 * Math.sin(2*M*r)
    -  185116 * Math.sin(Ms*r)
    -  114332 * Math.sin(2*F*r)) / 1e6;
  const dB = (5128122 * Math.sin(F*r)
    +  280602 * Math.sin((M+F)*r)
    +  277693 * Math.sin((M-F)*r)
    +  173237 * Math.sin((2*D-F)*r)) / 1e6;
  const lam  = (L0 + dL) * r;
  const beta = dB * r;
  const eps  = (23.4392911 - 0.013004167 * T) * r;
  const ra  = Math.atan2(Math.sin(lam)*Math.cos(eps) - Math.tan(beta)*Math.sin(eps), Math.cos(lam)) / r;
  const dec = Math.asin(Math.sin(beta)*Math.cos(eps) + Math.cos(beta)*Math.sin(eps)*Math.sin(lam)) / r;
  return { ra: (ra + 360) % 360, dec };
}

/** Moon altitude (deg) at a JDE for a lat/lon observer. */
function moonAltitude(jde: number, lat: number, lon: number): number {
  const r = Math.PI / 180;
  const { ra, dec } = moonEquatorial(jde);
  const T = (jde - 2451545.0) / 36525;
  const gst = ((280.46061837 + 360.98564736629 * (jde - 2451545.0) + 0.000387933 * T * T) % 360 + 360) % 360;
  const lst = (gst + lon + 360) % 360;
  const ha  = lst - ra;
  return Math.asin(
    Math.sin(lat*r)*Math.sin(dec*r) + Math.cos(lat*r)*Math.cos(dec*r)*Math.cos(ha*r)
  ) / r;
}

/** Returns moonrise time in UTC minutes-since-midnight, or null if no rise today. */
function moonriseUTC(lat: number, lon: number, date: Date): number | null {
  const JD0 = Math.floor(date.getTime() / 86400000) * 86400000;
  const jd0 = JD0 / 86400000 + 2440587.5;
  const STEP = 0.5 / 24; // 30-min steps
  const HORIZON = -0.833;
  let prev = moonAltitude(jd0, lat, lon);
  for (let h = STEP; h <= 1; h += STEP) {
    const cur = moonAltitude(jd0 + h, lat, lon);
    if (prev < HORIZON && cur >= HORIZON) {
      const frac = (HORIZON - prev) / (cur - prev);
      return (h - STEP + frac * STEP) * 24 * 60; // UTC minutes
    }
    prev = cur;
  }
  return null;
}


/**
 * SVG moon disc: dark circle with an illuminated portion drawn via a path.
 * Phase 0=new (dark), 0.25=first quarter (right half lit), 0.5=full (all lit),
 * 0.75=last quarter (left half lit).
 */
function MoonDisc({ phase, size, color, dimColor }: { phase: number; size: number; color: string; dimColor: string }) {
  const r = size / 2;
  const cx = r;
  const cy = r;

  // Illumination fraction → terminator x-offset
  // angle of illumination: 0=new, π=full
  const angle = phase * 2 * Math.PI; // 0→2π
  // For waxing (0–0.5) right side lit, waning (0.5–1) left side lit
  const waxing = phase <= 0.5;
  const illum = waxing ? phase * 2 : (1 - phase) * 2; // 0→1 over each half

  // terminator is an ellipse with x-radius = r * |cos(illumination angle)|
  // when illum=0: terminator at center (half circle), illum=1: terminator at edge (full/new)
  const termR = r * Math.abs(1 - illum * 2); // 0 at quarter, r at new/full
  const termConcave = illum < 0.5; // crescent vs gibbous shape

  // Build the illuminated region path (always sweeps the lit half)
  // Top of circle: (cx, cy-r), bottom: (cx, cy+r)
  // Right semicircle arc: large-arc=0 sweep=1 (clockwise)
  // Left semicircle arc: large-arc=0 sweep=0 (counter-clockwise)

  let path: string;
  if (phase < 0.02 || phase > 0.98) {
    // New moon — no illumination
    path = '';
  } else if (phase > 0.48 && phase < 0.52) {
    // Full moon — full circle
    path = `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`;
  } else {
    // Terminator ellipse x-radius
    const ex = r * Math.abs(Math.cos(angle));
    // Determine sweep direction for terminator arc (ellipse, vertical axis = r)
    // Waxing: lit side is right, terminator curves left for crescent, right for gibbous
    const termSweep = waxing ? (illum < 0.5 ? 0 : 1) : (illum < 0.5 ? 1 : 0);
    const litSweep  = waxing ? 1 : 0; // lit half arc direction

    path = [
      `M ${cx} ${cy - r}`,
      // Outer lit-half arc (semicircle on the lit side)
      `A ${r} ${r} 0 0 ${litSweep} ${cx} ${cy + r}`,
      // Terminator arc (ellipse) back to top
      `A ${ex} ${r} 0 0 ${termSweep} ${cx} ${cy - r}`,
      'Z',
    ].join(' ');
  }

  return (
    <Svg width={size} height={size}>
      {/* Dark disc */}
      <Circle cx={cx} cy={cy} r={r - 0.5} fill={dimColor} />
      {/* Illuminated portion */}
      {path ? <Path d={path} fill={color} /> : null}
      {/* Outer ring */}
      <Circle cx={cx} cy={cy} r={r - 0.5} fill="none" stroke={color} strokeWidth={0.8} strokeOpacity={0.4} />
    </Svg>
  );
}

// ── Sun icon ──────────────────────────────────────────────────────────────────

/** Half-sun on horizon with the shared arrow style pointing up (rise) or down (set) */
function SunHorizonIcon({ size, color, rising }: { size: number; color: string; rising: boolean }) {
  const cx    = size / 2;
  const hy    = size * 0.70;  // horizon y
  const r     = size * 0.26;  // sun radius
  const aSize = size * 0.28;  // arrow size
  const aCY   = size * 0.22;  // arrow center y — above sun, not touching

  const halfSun = `M ${cx - r},${hy} A ${r},${r} 0 0 1 ${cx + r},${hy}`;
  // 0° = points up, 180° = points down
  const arrowPts = arrowPoints(cx, aCY, aSize, rising ? 0 : 180);

  return (
    <Svg width={size} height={size}>
      <Path d={`M 2,${hy} L ${size - 2},${hy}`} stroke={color} strokeWidth={1.2} strokeOpacity={0.5} />
      <Path d={halfSun} stroke={color} strokeWidth={1.5} fill="none" />
      <Polygon points={arrowPts} fill={color} />
    </Svg>
  );
}

interface WindTideBarProps {
  windData: ReturnType<typeof useWindData>['data'];
  tideStation: string;
  nowTideHeight: number | null;
  nowTideLabel: string;
  onStationPress: () => void;
  theme: ReturnType<typeof useTheme>;
  dayOffset?: number;
}

function WindTideBar({ windData, tideStation, nowTideHeight, nowTideLabel, onStationPress, theme, dayOffset = 0 }: WindTideBarProps) {
  const dir = windData?.dir ?? null;
  const speed = windData?.speed ?? null;
  const travelDeg = dir !== null ? (dir + 180) % 360 : null;
  const kts = speed !== null ? `${Math.round(speed)}kt` : '--';

  const moonDate = new Date(Date.now() + dayOffset * 24 * 3600_000);
  const phase = moonPhase(moonDate);
  const moonRiseMins = moonriseUTC(HI_LAT, HI_LON, moonDate);
  const moonRiseLabel = moonRiseMins != null ? utcMinsToHawaii(moonRiseMins) : '--';

  const sun = sunriseSunsetUTC(HI_LAT, HI_LON, new Date());
  const riseLabel = sun ? utcMinsToHawaii(sun.riseMins) : '--';
  const setLabel  = sun ? utcMinsToHawaii(sun.setMins)  : '--';

  return (
    <View style={[windTideStyles.container, { backgroundColor: theme.background }]}>
      {/* Station name centered above */}
      <TouchableOpacity onPress={onStationPress} activeOpacity={0.6}>
        <Text style={[windTideStyles.title, { color: theme.accent }]}>{tideStation} ›</Text>
      </TouchableOpacity>
      {/* RISE | WIND | MOON | TIDE | SET */}
      <View style={windTideStyles.row}>
        <View style={windTideStyles.col}>
          <Text style={[windTideStyles.label, { color: '#2d6099' }]}>RISE</Text>
          <SunHorizonIcon size={WIND_ARROW} color={theme.accent} rising={true} />
          <Text style={[windTideStyles.time, { color: '#2d6099' }]}>{riseLabel}</Text>
        </View>
        <View style={windTideStyles.col}>
          <Text style={[windTideStyles.label, { color: '#2d6099' }]}>WIND</Text>
          <Svg width={WIND_ARROW} height={WIND_ARROW}>
            {travelDeg !== null ? (
              <Polygon points={arrowPoints(WIND_ARROW / 2, WIND_ARROW / 2, WIND_ARROW, travelDeg)} fill={theme.accent} />
            ) : (
              <Circle cx={WIND_ARROW / 2} cy={WIND_ARROW / 2} r={6} fill={theme.muted} />
            )}
          </Svg>
          <Text style={[windTideStyles.time, { color: '#2d6099' }]}>{kts}</Text>
        </View>
        <View style={windTideStyles.col}>
          <Text style={[windTideStyles.label, { color: '#2d6099' }]}>MOON</Text>
          <MoonDisc phase={phase} size={WIND_ARROW} color={theme.accent} dimColor={theme.accentDim} />
          <Text style={[windTideStyles.time, { color: '#2d6099' }]}>{moonRiseLabel}</Text>
        </View>
        <View style={windTideStyles.col}>
          <Text style={[windTideStyles.label, { color: '#2d6099' }]}>TIDE</Text>
          <View style={{ height: WIND_ARROW, alignItems: 'center', justifyContent: 'center' }}>
            {nowTideHeight !== null
              ? <Text style={[windTideStyles.bigVal, { color: theme.accent }]} numberOfLines={1}>{nowTideHeight.toFixed(1)}ft</Text>
              : <Text style={[windTideStyles.bigVal, { color: theme.muted }]}>--</Text>
            }
          </View>
          {nowTideLabel ? <Text style={[windTideStyles.time, { color: '#2d6099' }]}>{nowTideLabel}</Text> : null}
        </View>
        <View style={windTideStyles.col}>
          <Text style={[windTideStyles.label, { color: '#2d6099' }]}>SET</Text>
          <SunHorizonIcon size={WIND_ARROW} color={theme.accent} rising={false} />
          <Text style={[windTideStyles.time, { color: '#2d6099' }]}>{setLabel}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Station picker modal ───────────────────────────────────────────────────────

interface StationPickerProps {
  visible: boolean;
  current: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  theme: ReturnType<typeof useTheme>;
}

function StationPicker({ visible, current, onSelect, onClose, theme }: StationPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={pickerStyles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[pickerStyles.sheet, { backgroundColor: theme.background }]}>
        <View style={[pickerStyles.handle, { backgroundColor: theme.accentDim }]} />
        <Text style={[pickerStyles.heading, { color: theme.accent }]}>SELECT STATION</Text>
        <View style={[pickerStyles.divider, { backgroundColor: theme.accentDim }]} />
        {HAWAII_STATIONS.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[pickerStyles.row, s.id === current && { backgroundColor: theme.accentDim + '44' }]}
            onPress={() => { onSelect(s.id); onClose(); }}
            activeOpacity={0.7}
          >
            <View>
              <Text style={[pickerStyles.stationName, { color: s.id === current ? theme.accent : theme.textPrimary }]}>
                {s.name}
              </Text>
              <Text style={[pickerStyles.stationIsland, { color: theme.muted }]}>{s.island}</Text>
            </View>
            {s.id === current && (
              <Text style={[pickerStyles.check, { color: theme.accent }]}>✓</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 14 },
  heading: { fontFamily: 'Courier', fontWeight: '900', fontSize: 13, letterSpacing: 3, marginBottom: 10 },
  divider: { height: 1, opacity: 0.4, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4 },
  stationName: { fontFamily: 'Courier', fontWeight: '700', fontSize: 15, letterSpacing: 2 },
  stationIsland: { fontFamily: 'Courier', fontSize: 10, letterSpacing: 1, marginTop: 2 },
  check: { fontFamily: 'Courier', fontSize: 16 },
});

const windTideStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    paddingTop: 10,
    paddingBottom: 8,
  },
  line: {
    height: 1,
    alignSelf: 'stretch',
    marginHorizontal: 50,
    opacity: 0.55,
    marginBottom: 20,
  },
  title: {
    fontFamily: 'Courier',
    fontWeight: 'bold',
    fontSize: 13,
    letterSpacing: 3,
    marginBottom: 4,
  },
  label: {
    fontFamily: 'Courier',
    fontWeight: 'bold',
    fontSize: 12,
    letterSpacing: 2,
    opacity: 1,
  },
  bigVal: {
    fontFamily: 'Courier',
    fontWeight: 'bold',
    fontSize: 17,
    letterSpacing: 1,
    marginTop: 2,
  },
  time: {
    fontFamily: 'Courier',
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: 1,
    marginTop: 2,
  },
  tideInfo: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 18,
  },
  col: {
    alignItems: 'center',
  },
});

interface BuoyGridProps {
  nearshoreData: Record<string, BuoyReading | null>;
  theme: ReturnType<typeof useTheme>;
  onBuoyPress: (id: string) => void;
}

function BuoyGrid({ nearshoreData, theme, onBuoyPress }: BuoyGridProps) {
  const [mapH, setMapH] = useState(300);
  return (
    <View
      style={{ flex: 1 }}
      onLayout={e => setMapH(e.nativeEvent.layout.height)}
    >
      <HawaiiMap
        width={SCREEN_W}
        height={mapH}
        nearshoreStations={NEARSHORE_STATIONS}
        nearshoreData={nearshoreData}
        theme={theme}
        onBuoyPress={onBuoyPress}
      />
    </View>
  );
}

const SCREEN_LABELS = ['MAP', 'DATA', 'FORECAST', 'LOG', 'MIC'] as const;
const REAL_PAGES = SCREEN_LABELS.length; // 5

// Hawaii winter = Nov–Apr (north swells dominate)
function isHawaiiWinter(): boolean {
  const hiMonth = new Date(Date.now() - 10 * 3600000).getUTCMonth() + 1; // 1–12
  return hiMonth >= 11 || hiMonth <= 4;
}

// Map wind/tide station → the most relevant nearshore buoy for snapshots
const STATION_BUOY_MAP: Record<string, string> = {
  kahului:    '51208', // Pauwela
  hilo:       '51206', // Hilo
  nawiliwili: '51213', // Hanalei
  kawaihae:   '51206', // Hilo (closest Big Island buoy)
};

function getSnapshotBuoyId(stationId: string): string {
  if (stationId === 'honolulu') {
    return isHawaiiWinter() ? '51201' : '51205'; // Waimea Bay (winter) / Barbers Pt (summer)
  }
  return STATION_BUOY_MAP[stationId] ?? '51208';
}

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  const handleBuoyPress = useCallback((id: string) => {
    router.push(`/buoy/${id}`);
  }, [router]);

  // ── Wave data ──
  const nwBuoy    = useBuoyData('51101');
  const neBuoy    = useBuoyData('51000');
  const hanalei   = useBuoyData('51213');
  const waimeaBay = useBuoyData('51201');
  const pauwela   = useBuoyData('51208');
  const barberspt = useBuoyData('51205');
  const hilo      = useBuoyData('51206');
  const lanai     = useBuoyData('51212');
  const swBuoy    = useBuoyData('51002');
  const seBuoy    = useBuoyData('51004');

  const nearshoreData: Record<string, BuoyReading | null> = {
    '51101': nwBuoy.data,
    '51000': neBuoy.data,
    '51213': hanalei.data,
    '51201': waimeaBay.data,
    '51208': pauwela.data,
    '51205': barberspt.data,
    '51206': hilo.data,
    '51212': lanai.data,
    '51002': swBuoy.data,
    '51004': seBuoy.data,
  };

  const nearshoreHistory: Record<string, BuoyReading[]> = {
    '51101': nwBuoy.history,
    '51000': neBuoy.history,
    '51213': hanalei.history,
    '51201': waimeaBay.history,
    '51208': pauwela.history,
    '51205': barberspt.history,
    '51206': hilo.history,
    '51212': lanai.history,
    '51002': swBuoy.history,
    '51004': seBuoy.history,
  };

  const { activeStations } = useBuoyList();

  // ── Alerts ──
  const { settings: alertSettings } = useAlertSettings();
  const stationNames = useMemo(() => {
    const m: Record<string, string> = {};
    NEARSHORE_STATIONS.forEach(s => { m[s.id] = s.name; });
    return m;
  }, []);
  useNewSwellAlert(nearshoreHistory, stationNames, alertSettings);

  // ── Double-tap snapshot ──
  const { logSwell } = useSwellLogContext();
  const lastTapRef = useRef<number>(0);
  const pagerRef = useRef<ScrollView>(null);
  const pagerInitialized = useRef(false);
  const [snapshotMsg, setSnapshotMsg] = useState('');

  // ── Station selection ──
  const { station: selectedStation, selectStation } = useSelectedStation();
  const [stationPickerVisible, setStationPickerVisible] = useState(false);

  // ── Tide data ──
  const [tideOffset, setTideOffset] = useState(0);
  const { predictions, loading: tidesLoading, refetch: refetchTides } = useTideData(selectedStation.tideStationId, tideOffset);

  const { nowTideHeight, nowTideLabel } = useMemo(() => {
    if (predictions.length < 2) return { nowTideHeight: null as number | null, nowTideLabel: '' };
    const todayDate = predictions[0].time.split(' ')[0];
    const toHours = (t: string) => {
      const [d, tm] = t.split(' ');
      if (!tm) return 0;
      const [h, m] = tm.split(':').map(Number);
      return h + m / 60 + (d !== todayDate ? 24 : 0);
    };
    const allHours = predictions.map(p => toHours(p.time));
    const allHeights = predictions.map(p => p.height);
    const nowD = new Date(Date.now() - 10 * 60 * 60 * 1000);
    const nowHour = nowD.getUTCHours() + nowD.getUTCMinutes() / 60;
    const hr24 = nowD.getUTCHours();
    const min = nowD.getUTCMinutes();
    const isPm = hr24 >= 12;
    const hr12 = hr24 % 12 || 12;
    const nowLabel = `${hr12}:${String(min).padStart(2, '0')}${isPm ? 'p' : 'a'}`;
    let nowHt: number | null = null;
    for (let i = 0; i < allHours.length - 1; i++) {
      if (nowHour >= allHours[i] && nowHour <= allHours[i + 1]) {
        const t = (nowHour - allHours[i]) / (allHours[i + 1] - allHours[i]);
        const cosT = (1 - Math.cos(t * Math.PI)) / 2;
        nowHt = allHeights[i] + (allHeights[i + 1] - allHeights[i]) * cosT;
        break;
      }
    }
    return { nowTideHeight: nowHt, nowTideLabel: nowLabel };
  }, [predictions]);

  // ── Wind data ──
  const { data: windData, refetch: refetchWind } = useWindData(selectedStation.windStationId);

  // ── Double-tap snapshot handler (needs selectedStation, windData, nowTideHeight) ──
  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 350) {
      lastTapRef.current = 0;
      const buoyId = getSnapshotBuoyId(selectedStation.id);
      const buoyStation = NEARSHORE_STATIONS.find(s => s.id === buoyId);
      const r = nearshoreData[buoyId];
      if (r && buoyStation && !isOffline(r.timestamp)) {
        logSwell(r, buoyId, buoyStation.name, {
          windKt:      windData?.speed ?? null,
          windGustKt:  windData?.gust  ?? null,
          windDirDeg:  windData?.dir   ?? null,
          windDirLabel: windData?.dir != null
            ? getCardinalDirection(windData.dir) ?? null
            : null,
          tideHeightFt: nowTideHeight != null
            ? Math.round(nowTideHeight * 3.28084 * 10) / 10
            : null,
          tideLabel: nowTideLabel || null,
        });
        setSnapshotMsg(`SNAPSHOT  ${buoyStation.name}`);
      } else {
        setSnapshotMsg('NO DATA TO SAVE');
      }
      setTimeout(() => setSnapshotMsg(''), 2500);
    } else {
      lastTapRef.current = now;
    }
  }, [selectedStation, nearshoreData, logSwell, windData, nowTideHeight, nowTideLabel]);

  // ── Tide swipe ──
  const tideSwipeX = useRef<number | null>(null);
  const handleTideSwipeStart = useCallback((e: any) => {
    tideSwipeX.current = e.nativeEvent.pageX;
  }, []);
  const handleTideSwipeEnd = useCallback((e: any) => {
    if (tideSwipeX.current === null) return;
    const dx = e.nativeEvent.pageX - tideSwipeX.current;
    tideSwipeX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) setTideOffset(o => Math.min(o + 1, 6));   // swipe left → next day
    else         setTideOffset(o => Math.max(o - 1, 0));   // swipe right → prev day
  }, []);

  // ── Pager state ──
  const [activeScreen, setActiveScreen] = useState(0);
  const [pagerHeight, setPagerHeight] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Virtual layout: [ghost-MIC, MAP, DATA, FORECAST, LOG, MIC, ghost-MAP]
    // virtual index 0 and REAL_PAGES both correspond to real page REAL_PAGES-1 (MIC)
    const virtualIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    const realIndex = ((virtualIndex - 1) % REAL_PAGES + REAL_PAGES) % REAL_PAGES;
    setActiveScreen(realIndex);
  }, []);

  const handleMomentumScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const virtualIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (virtualIndex === 0) {
      // Swiped right past MAP → jump to real MIC (virtual index REAL_PAGES)
      pagerRef.current?.scrollTo({ x: SCREEN_W * REAL_PAGES, animated: false });
    } else if (virtualIndex === REAL_PAGES + 1) {
      // Swiped left past MIC → jump to real MAP (virtual index 1)
      pagerRef.current?.scrollTo({ x: SCREEN_W, animated: false });
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([
      nwBuoy.refetch(),
      neBuoy.refetch(),
      hanalei.refetch(),
      waimeaBay.refetch(),
      pauwela.refetch(),
      barberspt.refetch(),
      hilo.refetch(),
      lanai.refetch(),
      swBuoy.refetch(),
      seBuoy.refetch(),
      refetchTides(),
      refetchWind(),
    ]);
    setIsRefreshing(false);
  }, [nwBuoy, neBuoy, hanalei, waimeaBay, pauwela, barberspt, hilo, lanai, swBuoy, seBuoy, refetchTides, refetchWind]);

  // On first layout, scroll past the ghost-MIC page so we start on MAP
  useEffect(() => {
    if (pagerHeight > 0 && !pagerInitialized.current) {
      pagerInitialized.current = true;
      setTimeout(() => {
        pagerRef.current?.scrollTo({ x: SCREEN_W, animated: false });
      }, 50);
    }
  }, [pagerHeight]);

  // MAP page renders twice (real + ghost), so extract to avoid duplicating JSX
  const renderMapTidePage = (isGhost = false) => (
    <ScrollView
      key={isGhost ? 'ghost-map' : 'real-map'}
      style={{ width: SCREEN_W, height: pagerHeight }}
      contentContainerStyle={{ flex: 1 }}
      refreshControl={
        isGhost ? undefined : (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        )
      }
    >
      <BuoyGrid nearshoreData={nearshoreData} theme={theme} onBuoyPress={handleBuoyPress} />
      <View style={{ height: TIDE_H, backgroundColor: theme.background, marginTop: -2 }}>
        <View style={{ height: WIND_INFO_H, justifyContent: 'center', alignItems: 'center', paddingBottom: 30, paddingTop: 80 }}>
          <WindTideBar
            windData={windData}
            tideStation={selectedStation.name}
            nowTideHeight={nowTideHeight}
            nowTideLabel={nowTideLabel}
            onStationPress={() => setStationPickerVisible(true)}
            theme={theme}
            dayOffset={tideOffset}
          />
        </View>
        {tidesLoading && predictions.length === 0 ? (
          <View style={styles.tideLoading}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <View
            onTouchStart={handleTideSwipeStart}
            onTouchEnd={handleTideSwipeEnd}
          >
            <TideChart
              predictions={predictions}
              width={SCREEN_W}
              height={TIDE_H - WIND_INFO_H}
              theme={theme}
              dayOffset={tideOffset}
            />
          </View>
        )}
      </View>
      {!isGhost && (
        <View style={styles.swipeHint}>
          <Text style={[styles.swipeText, { color: theme.muted }]}>SWIPE → DATA · LOG · MIC</Text>
        </View>
      )}
    </ScrollView>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} onTouchEnd={handleDoubleTap}>
      {/* ── Shared header ── */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: theme.accent }]}>BUDAT</Text>
          <Text style={[styles.headerSubtitle, { color: theme.muted }]}>
            NOAA Real-Time Wave Data · {SCREEN_LABELS[activeScreen]}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <TouchableOpacity onPress={() => router.push('/alerts')} activeOpacity={0.7}>
            <Text style={[styles.navBtn, { color: alertSettings.enabled ? theme.accent : theme.muted }]}>ALERTS</Text>
          </TouchableOpacity>
        <View style={styles.dots}>
          {SCREEN_LABELS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: theme.accentDim },
                i === activeScreen && [styles.dotActive, { backgroundColor: theme.accent }],
              ]}
            />
          ))}
        </View>
        </View>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.accent }]} />

      {/* ── Horizontal pager (looping via ghost pages) ── */}
      {/* Virtual layout: [ghost-MIC | MAP | DATA | FORECAST | LOG | MIC | ghost-MAP] */}
      <ScrollView
        ref={pagerRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={{ flex: 1 }}
        onLayout={e => setPagerHeight(e.nativeEvent.layout.height)}
      >
        {pagerHeight > 0 && (
          <>
            {/* Ghost of last page — seen when swiping right on MAP */}
            <MicWindScreen key="ghost-mic" height={pagerHeight} theme={theme} />

            {/* Page 0 (MAP) */}
            {renderMapTidePage()}

            {/* Page 1: Wave Data */}
            <DataScreen
              stations={activeStations}
              nearshoreData={nearshoreData}
              nearshoreHistory={nearshoreHistory}
              height={pagerHeight}
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              theme={theme}
              onBuoyPress={handleBuoyPress}
              onEditPress={() => router.push('/buoys')}
            />

            {/* Page 2: Forecast */}
            <ForecastPage height={pagerHeight} theme={theme} stationId={selectedStation.id} />

            {/* Page 3: Log Book */}
            <LogbookPage height={pagerHeight} theme={theme} />

            {/* Page 4: Mic Wind */}
            <MicWindScreen key="real-mic" height={pagerHeight} theme={theme} />

            {/* Ghost of first page — seen when swiping left on MIC */}
            {renderMapTidePage(true)}
          </>
        )}
      </ScrollView>

      <StationPicker
        visible={stationPickerVisible}
        current={selectedStation.id}
        onSelect={id => {
          const s = HAWAII_STATIONS.find(st => st.id === id);
          if (s) selectStation(s);
        }}
        onClose={() => setStationPickerVisible(false)}
        theme={theme}
      />

      {/* Double-tap snapshot feedback */}
      {snapshotMsg !== '' && (
        <View style={styles.snapshotOverlay} pointerEvents="none">
          <Text style={[styles.snapshotText, { color: theme.accent, borderColor: theme.accent }]}>
            {snapshotMsg}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: 'Courier',
    fontWeight: '900',
    letterSpacing: 4,
    lineHeight: 36,
  },
  headerSubtitle: {
    fontSize: 10,
    fontFamily: 'Courier',
    letterSpacing: 1,
    marginTop: 1,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotActive: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  divider: {
    height: 1,
    opacity: 0.55,
  },
  swipeHint: {
    alignItems: 'center',
    paddingVertical: 7,
  },
  swipeText: {
    fontSize: 10,
    fontFamily: 'Courier',
    letterSpacing: 2,
  },
  tideLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtn: {
    fontFamily: 'Courier',
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: '700',
  },
  snapshotOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotText: {
    fontFamily: 'Courier',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 2,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
});
