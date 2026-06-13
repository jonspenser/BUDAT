import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { WindMeterModule } = NativeModules;

export type SweepGuidance =
  | 'keepSweeping'
  | 'rotateLeft'
  | 'rotateRight'
  | 'hold'
  | 'locked'
  | 'noLock';

export type LobeClassification = 'clean' | 'flat' | 'bimodal' | 'insufficientData';

export type EstimatorStatus =
  | 'unavailable'
  | 'priorDominated'
  | 'personalized'
  | 'lowConfidence'
  | 'rejectedByQualityGate';

export interface SweepUpdate {
  guidance: SweepGuidance;
  isLocked: boolean;
  coverage: number;
  lobeClassification: LobeClassification;
  currentHeadingDegrees?: number;
  peakHeadingDegrees?: number;
  lockedHeadingDegrees?: number;
}

export interface EstimateUpdate {
  speedMS?: number;
  lower95MS?: number;
  upper95MS?: number;
  confidence: number;
  status: EstimatorStatus;
}

export interface HeadingUpdate {
  headingDegrees: number;
}

// WindMeterModule is undefined in Expo Go (no native code) — guard so the
// import doesn't crash; methods reject with a clear message instead.
const emitter =
  Platform.OS === 'ios' && WindMeterModule ? new NativeEventEmitter(WindMeterModule) : null;

const NO_MODULE = 'Wind meter requires a development build (not available in Expo Go)';

export const WindMeter = {
  startMeasuring(): Promise<void> {
    if (!WindMeterModule) return Promise.reject(new Error(NO_MODULE));
    return WindMeterModule.startMeasuring();
  },

  stopMeasuring(): Promise<void> {
    if (!WindMeterModule) return Promise.resolve();
    return WindMeterModule.stopMeasuring();
  },

  submitCorrection(
    speedMS: number,
    unit: 'ms' | 'knots' | 'mph',
    readingType: 'sustained' | 'gust' | 'average',
    directionDegrees?: number | null
  ): Promise<void> {
    if (!WindMeterModule) return Promise.reject(new Error(NO_MODULE));
    return WindMeterModule.submitCorrection(speedMS, unit, readingType, directionDegrees ?? null);
  },

  onSweepUpdate(handler: (update: SweepUpdate) => void) {
    return emitter?.addListener('onSweepUpdate', handler);
  },

  onEstimateUpdate(handler: (update: EstimateUpdate) => void) {
    return emitter?.addListener('onEstimateUpdate', handler);
  },

  onHeadingUpdate(handler: (update: HeadingUpdate) => void) {
    return emitter?.addListener('onHeadingUpdate', handler);
  },

  onError(handler: (err: { message: string }) => void) {
    return emitter?.addListener('onError', handler);
  },
};

export function msToKnots(ms: number) { return ms * 1.94384; }
export function msToMph(ms: number) { return ms * 2.23694; }
export function knotsToMs(knots: number) { return knots / 1.94384; }
export function mphToMs(mph: number) { return mph / 2.23694; }
