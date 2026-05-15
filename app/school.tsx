/**
 * SCHOOL — Wind as seabirds in the sky. Ocean creatures by swell size.
 * Tiny → manini. Small → bigeye / manini. Medium → trevally / uku / dolphin.
 * Large → GT / blacktip. Huge → tiger shark / humpback.
 */
import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Dimensions,
  Image as RNImage,
} from 'react-native';
import Svg, {
  Path, Defs, LinearGradient, Stop, Rect,
  Image as SvgImage, Text as SvgText,
} from 'react-native-svg';
import { useWaveForecast, WaveForecastPoint } from '../hooks/useWaveForecast';
import { useWindForecast, WindForecastPoint } from '../hooks/useWindForecast';
import { FORECAST_COORDS } from './forecast';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Asset URIs resolved once at module load ───────────────────────────────────

const BIRD_SRC = {
  tern:       RNImage.resolveAssetSource(require('../assets/creatures/small-white-tern-in-flight-colored-pencil.png')).uri,
  tropicbird: RNImage.resolveAssetSource(require('../assets/creatures/medium-red-tailed-tropicbird-in-flight-colored-pencil.png')).uri,
  albatross:  RNImage.resolveAssetSource(require('../assets/creatures/large-laysan-albatross-in-flight-colored-pencil.png')).uri,
};

const CREATURE_SRC = {
  manini:   RNImage.resolveAssetSource(require('../assets/creatures/manini-fish-colored-pencil.png')).uri,
  bigeye:   RNImage.resolveAssetSource(require('../assets/creatures/bigeye-emperor-colored-pencil.png')).uri,
  uku:      RNImage.resolveAssetSource(require('../assets/creatures/uku-colored-pencil.png')).uri,
  trevally: RNImage.resolveAssetSource(require('../assets/creatures/bluefin-trevally-colored-pencil.png')).uri,
  gt:       RNImage.resolveAssetSource(require('../assets/creatures/giant-trevally-colored-pencil.png')).uri,
  dolphin:  RNImage.resolveAssetSource(require('../assets/creatures/bottlenose-dolphin-colored-pencil.png')).uri,
  blacktip: RNImage.resolveAssetSource(require('../assets/creatures/blacktip-reef-shark-colored-pencil.png')).uri,
  tiger:    RNImage.resolveAssetSource(require('../assets/creatures/tiger-shark-colored-pencil.png')).uri,
  humpback: RNImage.resolveAssetSource(require('../assets/creatures/humpback-whale-colored-pencil.png')).uri,
  blue:     RNImage.resolveAssetSource(require('../assets/creatures/blue-whale-colored-pencil.png')).uri,
};

type Kind = keyof typeof CREATURE_SRC;
type BirdKind = 'tern' | 'tropicbird' | 'albatross';



function hiDateKey(utc: Date): string {
  return new Date(utc.getTime() - 10*3600_000).toISOString().slice(0,10);
}
function dayLabel(dk: string): string {
  const today = hiDateKey(new Date());
  if (dk === today) return 'TODAY';
  const d = new Date(dk+'T12:00:00Z');
  return ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getUTCDay()];
}

// ── Creature data ─────────────────────────────────────────────────────────────

interface Creature {
  kind: Kind;
  x: number; y: number;   // center
  w: number; h: number;   // bounding box
  travelDeg: number;
  opacity: number;
}

interface Bird {
  kind: BirdKind;
  x: number; y: number;
  w: number; h: number;
  deg: number;          // travel-to direction (0=N 90=E 180=S 270=W)
  opacity: number;
}

// ── Chart ─────────────────────────────────────────────────────────────────────

const PAD_L = 6; const PAD_R = 6; const PAD_T = 22; const PAD_B = 8;
const MIN_WAVE_MAX = 7;
const SKY_FRAC = 0.42;

function SchoolChart({
  waveForecast, windForecast, width, height, theme,
}: {
  waveForecast: WaveForecastPoint[]; windForecast: WindForecastPoint[];
  width: number; height: number; theme: any;
}) {
  const chartW = Math.max(width - PAD_L - PAD_R, 1);
  const chartH = height - PAD_T - PAD_B;
  const skyH   = chartH * SKY_FRAC;
  const oceanH = chartH * (1 - SKY_FRAC);

  const result = useMemo(() => {
    if (waveForecast.length < 2) return null;

    const toFt = (m: number) => m * 3.28084;
    const t0 = waveForecast[0].time.getTime();
    const t1 = waveForecast[waveForecast.length-1].time.getTime();
    const tRange = t1 - t0;

    const waveMax = Math.max(MIN_WAVE_MAX, Math.ceil(Math.max(...waveForecast.map(p => toFt(p.heightM)))));
    const xS = (ms: number) => ((ms - t0) / tRange) * chartW;
    const waveYS = (ft: number) => skyH + oceanH * (1 - ft / waveMax);

    // Dense surface: interpolate forecast baseline every 3px, add sinusoidal wave shape
    const SURF_STEP = 3;
    const WAVE_LAMBDA = 90;   // visual wavelength in px
    const MAX_AMP = 5;        // max crest amplitude in px

    const surfacePts: { x: number; y: number }[] = [];
    for (let px = 0; px <= chartW; px += SURF_STEP) {
      const ms = t0 + (px / chartW) * tRange;
      let ft = toFt(waveForecast[0].heightM);
      for (let j = 0; j < waveForecast.length - 1; j++) {
        const ta = waveForecast[j].time.getTime(), tb = waveForecast[j+1].time.getTime();
        if (ms >= ta && ms <= tb) {
          const tt = (ms - ta) / (tb - ta);
          ft = toFt(waveForecast[j].heightM + (waveForecast[j+1].heightM - waveForecast[j].heightM) * tt);
          break;
        }
      }
      const baseY = waveYS(ft);
      const amp = (ft / waveMax) * MAX_AMP;
      // Stokes-like shape: sharper crests, flatter troughs
      const theta = (px / WAVE_LAMBDA) * 2 * Math.PI;
      const osc = -(Math.sin(theta) + 0.15 * Math.sin(2 * theta)) * amp;
      surfacePts.push({ x: px, y: baseY + osc });
    }

    let waveLine = `M ${surfacePts[0].x.toFixed(1)},${surfacePts[0].y.toFixed(1)}`;
    for (let i = 1; i < surfacePts.length; i++) {
      waveLine += ` L ${surfacePts[i].x.toFixed(1)},${surfacePts[i].y.toFixed(1)}`;
    }
    const last = surfacePts[surfacePts.length - 1];
    const oceanFill = waveLine
      + ` L ${last.x.toFixed(1)},${chartH.toFixed(1)}`
      + ` L 0,${chartH.toFixed(1)} Z`;

    type DayBound = { x: number; label: string; isToday: boolean };
    const dayBounds: DayBound[] = [];
    let prevKey = hiDateKey(waveForecast[0].time);
    dayBounds.push({ x: 0, label: dayLabel(prevKey), isToday: prevKey === hiDateKey(new Date()) });
    for (let i = 1; i < waveForecast.length; i++) {
      const k = hiDateKey(waveForecast[i].time);
      if (k !== prevKey) {
        dayBounds.push({ x: xS(waveForecast[i].time.getTime()), label: dayLabel(k), isToday: k === hiDateKey(new Date()) });
        prevKey = k;
      }
    }

    const rand = (seed: number) => { const v = Math.sin(seed*9301+49297)*233280; return v-Math.floor(v); };

    // Seabirds (wind) in sky zone — PNG images facing RIGHT by default
    const birds: Bird[] = [];
    if (windForecast.length >= 2) {
      const wt0 = windForecast[0].time.getTime(), wt1 = windForecast[windForecast.length-1].time.getTime();
      const STEP = 34;
      for (let col = 0; col*STEP <= chartW; col++) {
        const cx = col*STEP;
        const ms = t0 + (cx/chartW)*tRange;
        if (ms < wt0 || ms > wt1) continue;
        let speedKt = 0, dirDeg = 0;
        for (let j = 0; j < windForecast.length-1; j++) {
          const ta = windForecast[j].time.getTime(), tb = windForecast[j+1].time.getTime();
          if (ms >= ta && ms <= tb) {
            const tt = (ms-ta)/(tb-ta);
            speedKt = windForecast[j].speedKt + (windForecast[j+1].speedKt-windForecast[j].speedKt)*tt;
            dirDeg  = windForecast[j].directionDeg + (windForecast[j+1].directionDeg-windForecast[j].directionDeg)*tt;
            break;
          }
        }
        const travelDeg = (dirDeg + 180) % 360;
        // Pool expands with wind strength; pick species randomly within pool
        const birdRand = rand(col * 31 + 5);
        let kind: BirdKind;
        let w: number, h: number;
        // w = body length, h = wingspan (perpendicular to travel)
        if (speedKt < 10) {
          // Light: tern only
          kind = 'tern'; w = 40; h = 56;
        } else if (speedKt < 20) {
          // Medium: tern or tropicbird
          kind = birdRand < 0.5 ? 'tern' : 'tropicbird';
          w = kind === 'tern' ? 40 : 52; h = kind === 'tern' ? 56 : 80;
        } else {
          // Strong: all three
          if (birdRand < 0.33)      { kind = 'tern';       w = 40; h = 56; }
          else if (birdRand < 0.66) { kind = 'tropicbird'; w = 52; h = 80; }
          else                      { kind = 'albatross';  w = 64; h = 110; }
        }
        const count = Math.max(1, Math.min(4, Math.ceil(speedKt / 5)));
        for (let f = 0; f < count; f++) {
          const yFrac = (f + rand(col*7+f+1)) / count;
          birds.push({
            kind, w, h,
            x: cx, y: skyH*0.06 + yFrac*skyH*0.82,
            deg: travelDeg,
            opacity: 1,
          });
        }
      }
    }

    // Sea creatures in ocean zone
    const creatures: Creature[] = [];
    const STEP = 34;
    for (let col = 0; col*STEP <= chartW; col++) {
      const cx = col*STEP;
      const ms = t0 + (cx/chartW)*tRange;
      let heightM = 0, dirDeg = 0;
      for (let j = 0; j < waveForecast.length-1; j++) {
        const ta = waveForecast[j].time.getTime(), tb = waveForecast[j+1].time.getTime();
        if (ms >= ta && ms <= tb) {
          const tt = (ms-ta)/(tb-ta);
          heightM = waveForecast[j].heightM + (waveForecast[j+1].heightM-waveForecast[j].heightM)*tt;
          dirDeg  = waveForecast[j].directionDeg + (waveForecast[j+1].directionDeg-waveForecast[j].directionDeg)*tt;
          break;
        }
      }

      const ft = toFt(heightM);
      const surfaceY = waveYS(ft);
      const depth = chartH - surfaceY;
      if (depth < 14) continue;

      const r1 = rand(col*17+3), r2 = rand(col*17+7);
      // WW3 Tdir is oceanographic "going to" direction — no flip needed
      const travelDeg = dirDeg;

      let kind: Kind;
      let w: number, h: number;
      let count: number;

      if (ft < 3) {
        // 1-3ft — small reef fish (manini, bigeye)
        kind = r1 < 0.55 ? 'manini' : 'bigeye';
        w = 16+r2*10; h = w*0.52; count = 2+Math.floor(r2*2);
      } else if (ft < 6) {
        // 3-6ft — medium fish and dolphins
        kind = r1 < 0.4 ? 'dolphin' : r1 < 0.7 ? 'trevally' : 'uku';
        w = 52+r2*20; h = w*0.46; count = 1+Math.floor(r2*1);
      } else if (ft < 10) {
        // 6-10ft — whales and sharks
        kind = r1 < 0.4 ? 'humpback' : r1 < 0.65 ? 'tiger' : r1 < 0.82 ? 'gt' : 'blacktip';
        w = 140+r2*50; h = w*0.38; count = 1;
      } else {
        // 10ft+ — blue whale territory
        kind = r1 < 0.5 ? 'blue' : 'humpback';
        w = 200+r2*60; h = w*0.30; count = 1;
      }

      for (let f = 0; f < count; f++) {
        const yFrac = (f + 0.5 + rand(col*13+f+99)*0.5) / count;
        const cy = surfaceY + 8 + yFrac*(depth-16);
        if (cy > chartH-8) continue;
        creatures.push({
          kind, x: cx, y: cy, w, h, travelDeg,
          opacity: 0.72 + (ft/waveMax)*0.25,
        });
      }
    }

    const now = Date.now();
    const nowX = (now >= t0 && now <= t1) ? xS(now) : null;

    return { waveLine, oceanFill, dayBounds, birds, creatures, nowX };
  }, [waveForecast, windForecast, chartW, chartH, skyH, oceanH]);

  if (!result) return null;
  const { waveLine, oceanFill, dayBounds, birds, creatures, nowX } = result;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="scSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor="#3a8fc7" stopOpacity="1" />
          <Stop offset="1"   stopColor="#7ec8e8" stopOpacity="1" />
        </LinearGradient>
        <LinearGradient id="scOcean" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0"   stopColor="#0c4a8a" stopOpacity="0.88" />
          <Stop offset="0.5" stopColor="#062658" stopOpacity="0.95" />
          <Stop offset="1"   stopColor="#020c20" stopOpacity="1" />
        </LinearGradient>
      </Defs>

      <Rect x={PAD_L} y={PAD_T} width={chartW} height={chartH} fill="url(#scSky)" />

      {dayBounds.slice(1).map((b, i) => (
        <Path key={i} d={`M ${PAD_L+b.x} ${PAD_T} L ${PAD_L+b.x} ${PAD_T+chartH}`}
          stroke={theme.accentDim} strokeWidth={0.4} strokeDasharray="2,7" opacity={0.3} />
      ))}

      {/* Seabirds — PNG drawings facing right by default.
           Mirror for leftward travel, rotate for other directions. */}
      {birds.map((b, i) => {
        const cx = PAD_L + b.x;
        const cy = PAD_T + b.y;
        const goingLeft = b.deg > 180;
        const angle = goingLeft ? b.deg - 270 : b.deg - 90;
        const transform = goingLeft
          ? `translate(${cx},${cy}) rotate(${angle.toFixed(1)}) scale(-1,1) translate(${-cx},${-cy})`
          : `rotate(${angle.toFixed(1)},${cx},${cy})`;
        return (
          <SvgImage
            key={i}
            x={cx - b.w / 2}
            y={cy - b.h / 2}
            width={b.w}
            height={b.h}
            href={BIRD_SRC[b.kind]}
            opacity={b.opacity}
            transform={transform}
          />
        );
      })}

      {/* Ocean */}
      <Path d={oceanFill} fill="url(#scOcean)"
        transform={`translate(${PAD_L},${PAD_T})`} />

      {/* Sea creatures — PNG images face RIGHT by default (belly down).
           For leftward travel: mirror horizontally (avoids upside-down 180° rotation).
           For rightward travel: rotate from right-facing baseline. */}
      {creatures.map((c, i) => {
        const cx = PAD_L + c.x;
        const cy = PAD_T + c.y;
        const goingLeft = c.travelDeg > 180;
        const angle = goingLeft ? c.travelDeg - 270 : c.travelDeg - 90;
        // Mirror + rotate around center, or just rotate around center
        const transform = goingLeft
          ? `translate(${cx},${cy}) rotate(${angle.toFixed(1)}) scale(-1,1) translate(${-cx},${-cy})`
          : `rotate(${angle.toFixed(1)},${cx},${cy})`;
        return (
          <SvgImage
            key={i}
            x={cx - c.w/2}
            y={cy - c.h/2}
            width={c.w}
            height={c.h}
            href={CREATURE_SRC[c.kind]}
            opacity={c.opacity}
            transform={transform}
          />
        );
      })}

      {/* Wave surface */}
      <Path d={waveLine} stroke={theme.accent} strokeWidth={1.6} fill="none"
        transform={`translate(${PAD_L},${PAD_T})`} />

      {dayBounds.map((b, i) => (
        <SvgText key={i} x={PAD_L+b.x+(i===0?2:4)} y={PAD_T-6}
          fontSize={9} fontFamily="Courier" fontWeight="700"
          fill={b.isToday ? theme.accent : theme.muted} textAnchor="start">
          {b.label}
        </SvgText>
      ))}

      {nowX !== null && (
        <Path d={`M ${PAD_L+nowX} ${PAD_T} L ${PAD_L+nowX} ${PAD_T+chartH}`}
          stroke={theme.accent} strokeWidth={0.8} opacity={0.6} />
      )}
    </Svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SchoolPage({ height, theme, stationId }: { height?: number; theme: any; stationId: string }) {
  const coords = FORECAST_COORDS[stationId] ?? FORECAST_COORDS.kahului;
  const { forecast: waveFc, loading: waveLoading, error: waveErr } = useWaveForecast(coords.lat, coords.lon);
  const { forecast: windFc, loading: windLoading, error: windErr } = useWindForecast(coords.lat, coords.lon);

  const loading = waveLoading && waveFc.length === 0;
  const chartW  = SCREEN_W - 20;
  const CHART_H = Math.round((height ?? 520) * 0.80);

  return (
    <View style={[s.page, height ? { height, width: SCREEN_W } : { flex: 1 }]}>
      <View style={s.header}>
        <View style={s.headerRow}>
          <Text style={[s.title, { color: theme.accent }]}>SCHOOL</Text>
          <Text style={[s.sub, { color: theme.muted }]}>{coords.label}  · SEABIRDS + OCEAN</Text>
        </View>
        <View style={[s.divider, { backgroundColor: theme.accent }]} />
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={theme.accent} /></View>
      ) : waveErr ? (
        <View style={s.center}><Text style={[s.err, { color: theme.muted }]}>{waveErr}</Text></View>
      ) : (
        <View style={[s.chartBox, { borderColor: theme.accentDim, marginHorizontal: 10, marginTop: 10 }]}>
          <SchoolChart
            waveForecast={waveFc}
            windForecast={windErr ? [] : windFc}
            width={chartW}
            height={CHART_H}
            theme={theme}
          />
        </View>
      )}

      <View style={s.legend}>
        <Text style={[s.legendTxt, { color: theme.muted }]}>
          BIRDS = WIND  ·  1-3ft: REEF FISH  ·  3-6ft: FISH / DOLPHIN  ·  6-10ft: WHALE / SHARK
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page:      { backgroundColor: 'transparent' },
  header:    { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title:     { fontFamily: 'Courier', fontWeight: '900', fontSize: 18, letterSpacing: 4 },
  sub:       { fontFamily: 'Courier', fontSize: 10, letterSpacing: 1 },
  divider:   { height: 1, opacity: 0.55, marginTop: 8 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  err:       { fontFamily: 'Courier', fontSize: 11 },
  chartBox:  { borderWidth: 1, borderRadius: 4, overflow: 'hidden' },
  legend:    { paddingHorizontal: 14, paddingTop: 10 },
  legendTxt: { fontFamily: 'Courier', fontSize: 8, letterSpacing: 1, lineHeight: 14, opacity: 0.7 },
});
