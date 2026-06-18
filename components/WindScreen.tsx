import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NEARSHORE_STATIONS } from '../constants/buoys';
import { Theme } from '../constants/colors';
import { formatHawaiiTime, getCardinalDirection } from '../constants/formatters';
import { WindReading } from '../hooks/useWindData';
import {
  EstimateUpdate,
  HeadingUpdate,
  SweepUpdate,
  WindMeter,
  msToKnots,
} from '../modules/WindMeter';

const { width: SCREEN_W } = Dimensions.get('window');

function formatKnots(knots: number | null): string {
  if (knots === null) return '--';
  return `${knots.toFixed(1)}kts`;
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function formatDegrees(degrees: number | null | undefined): string {
  if (degrees == null) return '--';
  return `${Math.round(normalizeDegrees(degrees)).toString().padStart(3, '0')}°`;
}

const GUIDANCE_LABEL: Record<string, string> = {
  keepSweeping: 'SWEEP 360',
  rotateLeft: 'ROTATE LEFT',
  rotateRight: 'ROTATE RIGHT',
  hold: 'HOLD STEADY',
  locked: 'LOCKED',
  noLock: 'NO CLEAR DIRECTION',
};

function LiveCompass({
  heading,
  windHeading,
  theme,
}: {
  heading: number | null | undefined;
  windHeading: number | null | undefined;
  theme: Theme;
}) {
  const compassHeading = heading == null ? 0 : normalizeDegrees(heading);
  const windMarker = windHeading == null ? null : normalizeDegrees(windHeading);
  const marks = Array.from({ length: 8 }, (_, i) => i * 45);

  return (
    <View style={styles.compassWrap}>
      <View style={[styles.compass, { borderColor: theme.accentDim }]}>
        <View style={styles.phonePointer}>
          <View style={[styles.phonePointerLine, { backgroundColor: theme.accent }]} />
          <Text style={[styles.phonePointerText, { color: theme.accent }]}>PHONE AIM</Text>
        </View>
        <View
          style={[
            styles.compassRose,
            { transform: [{ rotate: `${-compassHeading}deg` }] },
          ]}
        >
          {marks.map((deg) => {
            const isCardinal = deg % 90 === 0;
            const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : `${deg}°`;
            return (
              <View
                key={deg}
                style={[
                  styles.compassMark,
                  { transform: [{ rotate: `${deg}deg` }] },
                ]}
              >
                <View
                  style={[
                    styles.compassTick,
                    {
                      backgroundColor: isCardinal ? theme.accent : theme.accentDim,
                      height: isCardinal ? 18 : 12,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.compassLabel,
                    {
                      color: isCardinal ? theme.textPrimary : theme.muted,
                      transform: [{ rotate: `${-deg + compassHeading}deg` }],
                    },
                  ]}
                >
                  {label}
                </Text>
              </View>
            );
          })}
          {windMarker != null && (
            <View
              style={[
                styles.windMarker,
                { transform: [{ rotate: `${windMarker}deg` }] },
              ]}
            >
              <View style={[styles.windMarkerDot, { backgroundColor: theme.accent }]} />
            </View>
          )}
        </View>
      </View>
      <View style={styles.compassReadout}>
        <Text style={[styles.compassReadoutLabel, { color: theme.muted }]}>CURRENT</Text>
        <Text style={[styles.compassReadoutValue, { color: theme.textPrimary }]}>
          {formatDegrees(heading)}
        </Text>
        <Text style={[styles.compassReadoutLabel, { color: theme.muted }]}>WIND LOCK</Text>
        <Text style={[styles.compassReadoutValue, { color: theme.accent }]}>
          {formatDegrees(windHeading)}
        </Text>
      </View>
    </View>
  );
}

interface WindScreenProps {
  windData: Record<string, WindReading | null>;
  height: number;
  refreshing: boolean;
  onRefresh: () => void;
  theme: Theme;
}

type MeasureState = 'idle' | 'sweeping' | 'locked' | 'calibrating';

export default function WindScreen({ windData, height, refreshing, onRefresh, theme }: WindScreenProps) {
  const [measureState, setMeasureState] = useState<MeasureState>('idle');
  const [trainingMode, setTrainingMode] = useState(false);
  const [sweep, setSweep] = useState<SweepUpdate | null>(null);
  const [estimate, setEstimate] = useState<EstimateUpdate | null>(null);
  const [liveHeading, setLiveHeading] = useState<HeadingUpdate | null>(null);
  const [correctionInput, setCorrectionInput] = useState('');
  const [directionInput, setDirectionInput] = useState('');
  const [correctionUnit, setCorrectionUnit] = useState<'knots' | 'mph'>('knots');

  const sweepSub = useRef<ReturnType<typeof WindMeter.onSweepUpdate>>(null);
  const estimateSub = useRef<ReturnType<typeof WindMeter.onEstimateUpdate>>(null);
  const headingSub = useRef<ReturnType<typeof WindMeter.onHeadingUpdate>>(null);
  const trainingModeRef = useRef(false);

  const stopListeners = useCallback(() => {
    sweepSub.current?.remove();
    estimateSub.current?.remove();
    headingSub.current?.remove();
  }, []);

  const startMeasurement = useCallback(async (enableTrainingMode: boolean) => {
    if (Platform.OS !== 'ios') {
      Alert.alert('iOS only', 'The microphone wind meter is only available on iPhone.');
      return;
    }
    trainingModeRef.current = enableTrainingMode;
    setTrainingMode(enableTrainingMode);
    setSweep(null);
    setEstimate(null);
    setLiveHeading(null);
    setMeasureState('sweeping');

    headingSub.current = WindMeter.onHeadingUpdate((update) => {
      setLiveHeading(update);
    });
    sweepSub.current = WindMeter.onSweepUpdate((update) => {
      setSweep(update);
      if (update.isLocked) {
        if (trainingModeRef.current) {
          setDirectionInput(
            update.lockedHeadingDegrees != null
              ? String(Math.round(update.lockedHeadingDegrees))
              : update.peakHeadingDegrees != null
                ? String(Math.round(update.peakHeadingDegrees))
                : ''
          );
          setMeasureState('locked');
        } else {
          setMeasureState('locked');
        }
      }
    });
    estimateSub.current = WindMeter.onEstimateUpdate((update) => {
      setEstimate(update);
      if (trainingModeRef.current && update.speedMS != null) {
        setCorrectionInput(msToKnots(update.speedMS).toFixed(1));
        setMeasureState('calibrating');
      }
    });

    try {
      await WindMeter.startMeasuring();
    } catch (e: any) {
      stopListeners();
      setMeasureState('idle');
      Alert.alert('Could not start', e?.message ?? 'Microphone error');
    }
  }, [stopListeners]);

  const handleMeasure = useCallback(() => {
    startMeasurement(false);
  }, [startMeasurement]);

  const handleTrainingMode = useCallback(() => {
    startMeasurement(true);
  }, [startMeasurement]);

  const handleStop = useCallback(async () => {
    stopListeners();
    await WindMeter.stopMeasuring();
    trainingModeRef.current = false;
    setTrainingMode(false);
    setMeasureState('idle');
  }, [stopListeners]);

  const handleCalibratePress = useCallback(() => {
    trainingModeRef.current = true;
    setTrainingMode(true);
    setCorrectionInput(
      estimate?.speedMS != null ? msToKnots(estimate.speedMS).toFixed(1) : ''
    );
    setDirectionInput(
      sweep?.lockedHeadingDegrees != null
        ? String(Math.round(sweep.lockedHeadingDegrees))
        : sweep?.peakHeadingDegrees != null
          ? String(Math.round(sweep.peakHeadingDegrees))
          : ''
    );
    setMeasureState('calibrating');
  }, [estimate?.speedMS, sweep?.lockedHeadingDegrees, sweep?.peakHeadingDegrees]);

  const handleSubmitCorrection = useCallback(async () => {
    const val = parseFloat(correctionInput);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Enter a valid reading');
      return;
    }
    const dir = directionInput.trim() ? parseFloat(directionInput) : null;
    if (dir !== null && (isNaN(dir) || dir < 0 || dir > 360)) {
      Alert.alert('Enter a valid direction', 'Use degrees from 0 to 360.');
      return;
    }
    const speedMS = correctionUnit === 'knots' ? val / 1.94384 : val / 2.23694;
    await WindMeter.submitCorrection(speedMS, correctionUnit, 'sustained', dir === 360 ? 0 : dir);
    trainingModeRef.current = false;
    setTrainingMode(false);
    setMeasureState('locked');
  }, [correctionInput, correctionUnit, directionInput]);

  useEffect(() => {
    return () => {
      stopListeners();
      WindMeter.stopMeasuring().catch(() => {});
    };
  }, [stopListeners]);

  const estimateKnots =
    estimate?.speedMS != null ? msToKnots(estimate.speedMS).toFixed(1) : null;
  const lower = estimate?.lower95MS != null ? msToKnots(estimate.lower95MS).toFixed(1) : null;
  const upper = estimate?.upper95MS != null ? msToKnots(estimate.upper95MS).toFixed(1) : null;
  const showEstimate =
    estimate?.status === 'priorDominated' || estimate?.status === 'personalized';
  const guessedDirection =
    sweep?.lockedHeadingDegrees ?? sweep?.peakHeadingDegrees ?? null;
  const currentHeading = liveHeading?.headingDegrees ?? sweep?.currentHeadingDegrees ?? null;

  return (
    <ScrollView
      style={{ width: SCREEN_W, height, backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={theme.accent}
          colors={[theme.accent]}
        />
      }
    >
      <Text style={[styles.screenTitle, { color: theme.accent }]}>WIND DATA</Text>
      <View style={[styles.titleDivider, { backgroundColor: theme.accent }]} />

      {/* Mic wind meter section */}
      <View style={[styles.meterSection, { borderColor: theme.accentDim }]}>
        <Text style={[styles.meterTitle, { color: theme.muted }]}>MIC WIND METER</Text>

        {measureState === 'idle' && (
          <View style={styles.actionColumn}>
            <Pressable
              style={[styles.btn, { borderColor: theme.accent }]}
              onPress={handleMeasure}
            >
              <Text style={[styles.btnText, { color: theme.accent }]}>TAKE MEASUREMENT</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { borderColor: theme.accentDim }]}
              onPress={handleTrainingMode}
            >
              <Text style={[styles.btnText, { color: theme.accentDim }]}>CALIBRATE</Text>
            </Pressable>
          </View>
        )}

        {(measureState === 'sweeping' || measureState === 'locked') && (
          <>
            {trainingMode && (
              <Text style={[styles.trainingModeNote, { color: theme.accent }]}>
                CALIBRATING — LOCK WIND, THEN ENTER ANEMOMETER READING
              </Text>
            )}
            {/* Sweep guidance */}
            <Text style={[styles.guidance, { color: sweep?.isLocked ? theme.accent : theme.textPrimary }]}>
              {GUIDANCE_LABEL[sweep?.guidance ?? 'keepSweeping'] ?? sweep?.guidance}
            </Text>
            {sweep && !sweep.isLocked && (
              <Text style={[styles.coverageTip, { color: theme.muted }]}>
                {Math.round(sweep.coverage * 100)}% covered
              </Text>
            )}

            <LiveCompass heading={currentHeading} windHeading={guessedDirection} theme={theme} />

            {/* Estimate */}
            {showEstimate && estimateKnots != null && (
              <View style={styles.estimateRow}>
                <Text style={[styles.estimateValue, { color: theme.textPrimary }]}>
                  {estimateKnots}
                  <Text style={[styles.estimateUnit, { color: theme.muted }]}> kts</Text>
                </Text>
                {lower != null && upper != null && (
                  <Text style={[styles.estimateBand, { color: theme.muted }]}>
                    {lower} – {upper}
                  </Text>
                )}
                {estimate?.status === 'priorDominated' && (
                  <Text style={[styles.estimateNote, { color: theme.muted }]}>
                    PRIOR — CALIBRATE TO IMPROVE
                  </Text>
                )}
              </View>
            )}
            {estimate?.status === 'lowConfidence' && (
              <Text style={[styles.estimateNote, { color: theme.muted }]}>LOW CONFIDENCE</Text>
            )}
            {estimate?.status === 'rejectedByQualityGate' && (
              <Text style={[styles.estimateNote, { color: theme.muted }]}>NOISY SIGNAL</Text>
            )}

            <View style={styles.actionRow}>
              {measureState === 'locked' && (
                <Pressable
                  style={[styles.btn, styles.btnSmall, { borderColor: theme.accentDim }]}
                  onPress={handleCalibratePress}
                >
                  <Text style={[styles.btnText, { color: theme.accentDim }]}>CALIBRATE</Text>
                </Pressable>
              )}
              <Pressable
                style={[styles.btn, styles.btnSmall, { borderColor: theme.accentDim }]}
                onPress={handleStop}
              >
                <Text style={[styles.btnText, { color: theme.accentDim }]}>STOP</Text>
              </Pressable>
            </View>
          </>
        )}

        {measureState === 'calibrating' && (
          <View style={styles.calibrateForm}>
            {trainingMode && (
              <Text style={[styles.trainingModeNote, { color: theme.accent }]}>
                CALIBRATION ACTIVE
              </Text>
            )}
            <Text style={[styles.calibrateLabel, { color: theme.muted }]}>
              APP GUESS
            </Text>
            <Text style={[styles.calibrateGuess, { color: theme.textPrimary }]}>
              {estimateKnots ?? '--'} KT · {guessedDirection != null ? `${Math.round(guessedDirection)}°` : '--°'}
            </Text>
            <Text style={[styles.calibrateLabel, { color: theme.muted }]}>
              ACTUAL WIND SPEED
            </Text>
            <View style={styles.calibrateInputRow}>
              <TextInput
                style={[styles.calibrateInput, { color: theme.textPrimary, borderColor: theme.accentDim }]}
                keyboardType="decimal-pad"
                value={correctionInput}
                onChangeText={setCorrectionInput}
                placeholder="0.0"
                placeholderTextColor={theme.muted}
              />
              <Pressable
                style={[styles.unitToggle, { borderColor: theme.accentDim }]}
                onPress={() => setCorrectionUnit(u => u === 'knots' ? 'mph' : 'knots')}
              >
                <Text style={[styles.unitToggleText, { color: theme.accent }]}>
                  {correctionUnit.toUpperCase()}
                </Text>
              </Pressable>
            </View>
            <Text style={[styles.calibrateLabel, { color: theme.muted }]}>
              ACTUAL WIND DIRECTION
            </Text>
            <View style={styles.calibrateInputRow}>
              <TextInput
                style={[styles.calibrateInput, { color: theme.textPrimary, borderColor: theme.accentDim }]}
                keyboardType="decimal-pad"
                value={directionInput}
                onChangeText={setDirectionInput}
                placeholder="0"
                placeholderTextColor={theme.muted}
              />
              <Text style={[styles.directionUnit, { color: theme.accent }]}>DEG</Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.btn, styles.btnSmall, { borderColor: theme.accent }]}
                onPress={handleSubmitCorrection}
              >
                <Text style={[styles.btnText, { color: theme.accent }]}>SUBMIT</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnSmall, { borderColor: theme.accentDim }]}
                onPress={() => {
                  trainingModeRef.current = false;
                  setTrainingMode(false);
                  setMeasureState('locked');
                }}
              >
                <Text style={[styles.btnText, { color: theme.accentDim }]}>CANCEL</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Buoy wind data */}
      {NEARSHORE_STATIONS.map((station) => {
        const r = windData[station.id];
        const wdir = r?.dir ?? null;
        const wspd = r?.speed ?? null;
        const wgst = r?.gust ?? null;
        const hasData = wspd !== null || wdir !== null;

        return (
          <View key={station.id}>
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={[styles.stationName, { color: theme.accent }]}>{station.name}</Text>
                <Text style={[styles.timestamp, { color: theme.muted }]}>
                  {r ? formatHawaiiTime(r.timestamp) + ' HST' : '--'}
                </Text>
              </View>
              {hasData ? (
                <View style={styles.dataRow}>
                  <View style={styles.dataCell}>
                    <Text style={[styles.dataLabel, { color: theme.muted }]}>FROM</Text>
                    <Text style={[styles.dataValue, { color: theme.textPrimary }]}>
                      {wdir !== null
                        ? `${getCardinalDirection(wdir) ?? '--'}  ${Math.round(wdir)}°`
                        : '--'}
                    </Text>
                  </View>
                  <View style={[styles.cellDivider, { backgroundColor: theme.accentDim }]} />
                  <View style={styles.dataCell}>
                    <Text style={[styles.dataLabel, { color: theme.muted }]}>SPEED</Text>
                    <Text style={[styles.dataValue, { color: theme.textPrimary }]}>{formatKnots(wspd)}</Text>
                  </View>
                  <View style={[styles.cellDivider, { backgroundColor: theme.accentDim }]} />
                  <View style={styles.dataCell}>
                    <Text style={[styles.dataLabel, { color: theme.muted }]}>GUST</Text>
                    <Text style={[styles.dataValue, { color: wgst !== null ? theme.accent : theme.textPrimary }]}>
                      {formatKnots(wgst)}
                    </Text>
                  </View>
                </View>
              ) : (
                <Text style={[styles.noData, { color: theme.accentDim }]}>NO WIND DATA</Text>
              )}
            </View>
            <View style={[styles.rowDivider, { backgroundColor: theme.accentDim }]} />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 20,
  },
  screenTitle: {
    fontSize: 18,
    fontFamily: 'Courier',
    fontWeight: '900',
    letterSpacing: 4,
    marginBottom: 8,
  },
  titleDivider: {
    height: 1,
    opacity: 0.55,
    marginBottom: 4,
  },
  meterSection: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
    marginTop: 8,
    gap: 10,
  },
  meterTitle: {
    fontSize: 9,
    fontFamily: 'Courier',
    letterSpacing: 2,
  },
  guidance: {
    fontSize: 20,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 2,
  },
  coverageTip: {
    fontSize: 10,
    fontFamily: 'Courier',
    letterSpacing: 1,
  },
  compassWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 4,
  },
  compass: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  compassRose: {
    width: 132,
    height: 132,
    borderRadius: 66,
    position: 'relative',
  },
  compassMark: {
    position: 'absolute',
    left: 64,
    top: 0,
    width: 4,
    height: 132,
    alignItems: 'center',
  },
  compassTick: {
    width: 2,
    borderRadius: 1,
  },
  compassLabel: {
    position: 'absolute',
    top: 21,
    width: 44,
    marginLeft: -20,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 1,
  },
  phonePointer: {
    position: 'absolute',
    top: 8,
    alignItems: 'center',
    zIndex: 2,
  },
  phonePointerLine: {
    width: 3,
    height: 32,
    borderRadius: 2,
  },
  phonePointerText: {
    marginTop: 2,
    fontSize: 7,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 1,
  },
  windMarker: {
    position: 'absolute',
    left: 63,
    top: 0,
    width: 6,
    height: 132,
    alignItems: 'center',
  },
  windMarkerDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginTop: 44,
  },
  compassReadout: {
    flex: 1,
    gap: 2,
  },
  compassReadoutLabel: {
    fontSize: 8,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  compassReadoutValue: {
    fontSize: 24,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  estimateRow: {
    gap: 2,
  },
  estimateValue: {
    fontSize: 36,
    fontFamily: 'Courier',
    fontWeight: '600',
    letterSpacing: 1,
  },
  estimateUnit: {
    fontSize: 18,
    fontFamily: 'Courier',
    fontWeight: '400',
  },
  estimateBand: {
    fontSize: 12,
    fontFamily: 'Courier',
    letterSpacing: 1,
  },
  estimateNote: {
    fontSize: 9,
    fontFamily: 'Courier',
    letterSpacing: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionColumn: {
    flexDirection: 'column',
    gap: 10,
  },
  btn: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  btnSmall: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  trainingBtn: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  btnText: {
    fontSize: 11,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 2,
  },
  trainingModeNote: {
    fontSize: 9,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 1.5,
    lineHeight: 14,
  },
  calibrateForm: {
    gap: 10,
  },
  calibrateLabel: {
    fontSize: 9,
    fontFamily: 'Courier',
    letterSpacing: 2,
  },
  calibrateGuess: {
    fontSize: 18,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 1,
  },
  calibrateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  calibrateInput: {
    fontSize: 24,
    fontFamily: 'Courier',
    fontWeight: '600',
    borderBottomWidth: 1,
    paddingVertical: 4,
    width: 100,
  },
  unitToggle: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  unitToggleText: {
    fontSize: 11,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 1,
  },
  directionUnit: {
    fontSize: 11,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 1,
  },
  row: {
    paddingVertical: 12,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  stationName: {
    fontSize: 13,
    fontFamily: 'Courier',
    fontWeight: '700',
    letterSpacing: 2,
  },
  timestamp: {
    fontSize: 10,
    fontFamily: 'Courier',
    letterSpacing: 1,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dataCell: {
    flex: 1,
  },
  cellDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 10,
  },
  dataLabel: {
    fontSize: 9,
    fontFamily: 'Courier',
    letterSpacing: 1,
    marginBottom: 3,
  },
  dataValue: {
    fontSize: 15,
    fontFamily: 'Courier',
    fontWeight: '600',
    letterSpacing: 1,
  },
  noData: {
    fontSize: 11,
    fontFamily: 'Courier',
    letterSpacing: 2,
  },
  rowDivider: {
    height: 1,
    opacity: 0.5,
  },
});
