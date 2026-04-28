import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HawaiiStation, HAWAII_STATIONS, DEFAULT_STATION } from '../constants/hawaiiStations';

const STORAGE_KEY = '@budat/selected_station';

export function useSelectedStation() {
  const [station, setStation] = useState<HawaiiStation>(DEFAULT_STATION);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) {
        const found = HAWAII_STATIONS.find(s => s.id === val);
        if (found) setStation(found);
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const selectStation = useCallback((s: HawaiiStation) => {
    setStation(s);
    AsyncStorage.setItem(STORAGE_KEY, s.id).catch(() => {});
  }, []);

  return { station, selectStation, loaded };
}
