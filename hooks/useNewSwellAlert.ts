import { BuoyReading } from './useBuoyData';
import { AlertSettings } from './useAlertSettings';

// Notifications disabled — expo-notifications incompatible with iOS 26 at build time
export function useNewSwellAlert(
  _nearshoreHistory: Record<string, BuoyReading[]>,
  _stationNames: Record<string, string>,
  _settings: AlertSettings,
) {}
