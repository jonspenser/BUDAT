import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@budat/alert_settings';

export interface AlertSettings {
  enabled: boolean;           // master on/off
  minHeightFt: number;        // only alert if swell >= this
  stationIds: string[];       // which stations to watch (empty = all)
}

const DEFAULTS: AlertSettings = {
  enabled: false,
  minHeightFt: 4,
  stationIds: [],
};

export function useAlertSettings() {
  const [settings, setSettings] = useState<AlertSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) {
        try {
          const saved = JSON.parse(val) as Partial<AlertSettings>;
          setSettings({ ...DEFAULTS, ...saved });
        } catch {}
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const update = useCallback((patch: Partial<AlertSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { settings, loaded, update };
}
