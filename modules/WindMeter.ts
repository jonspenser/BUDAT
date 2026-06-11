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

const emitter = Platform.OS === 'ios' ? new NativeEventEmitter(WindMeterModule) : null;

export const WindMeter = {
  startMeasuring(): Promise<void> {
    return WindMeterModule.startMeasuring();
  },

  stopMeasuring(): Promise<void> {
    return WindMeterModule.stopMeasuring();
  },

  submitCorrection(
    speedMS: number,
    unit: 'ms' | 'knots' | 'mph',
    readingType: 'sustained' | 'gust' | 'average',
    directionDegrees?: number | null
  ): Promise<void> {
    return WindMeterModule.submitCorrection(speedMS, unit, readingType, directionDegrees ?? null);
  },

  onSweepUpdate(handler: (update: SweepUpdate) => void) {
    return emitter?.addListener('onSweepUpdate', handler);
  },

  onEstimateUpdate(handler: (update: EstimateUpdate) => void) {
    return emitter?.addListener('onEstimateUpdate', handler);
  },

  onError(handler: (err: { message: string }) => void) {
    return emitter?.addListener('onError', handler);
  },
};

export function msToKnots(ms: number) { return ms * 1.94384; }
export function msToMph(ms: number) { return ms * 2.23694; }
export function knotsToMs(knots: number) { return knots / 1.94384; }
export function mphToMs(mph: number) { return mph / 2.23694; }
