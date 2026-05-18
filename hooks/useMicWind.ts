// expo-av disabled — crashes on iOS 26 in TurboModule layer
// Stub returns idle state. Re-enable when Expo SDK ships iOS 26 fix.

export interface BeaufortInfo {
  number: number;
  label: string;
  description: string;
  knotsMin: number;
  knotsMax: number;
}

const BEAUFORT_CALM: BeaufortInfo = {
  number: 0, label: 'CALM', description: 'expo-av disabled on iOS 26',
  knotsMin: 0, knotsMax: 1,
};

export function headingToCardinal(_deg: number): string {
  return 'N';
}

export interface MicWindResult {
  heading: number;
  cardinal: string;
  knots: number;
  beaufortInfo: BeaufortInfo;
}

export interface MicWindState {
  isRecording: boolean;
  isComplete: boolean;
  result: MicWindResult | null;
  hasPermission: boolean | null;
  rawDb: number | null;
  smoothedDb: number | null;
  estimatedKnots: number | null;
  beaufortFractional: number;
  beaufortInfo: BeaufortInfo;
  windHeadingDeg: number | null;
  windCardinal: string | null;
  sweepDeg: number;
  passCount: number;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;
  error: string | null;
}

export function useMicWind(): MicWindState {
  return {
    isRecording: false,
    isComplete: false,
    result: null,
    hasPermission: null,
    rawDb: null,
    smoothedDb: null,
    estimatedKnots: null,
    beaufortFractional: 0,
    beaufortInfo: BEAUFORT_CALM,
    windHeadingDeg: null,
    windCardinal: null,
    sweepDeg: 0,
    passCount: 0,
    start: async () => {},
    stop: async () => {},
    reset: () => {},
    error: 'Mic disabled (iOS 26 compatibility issue)',
  };
}
