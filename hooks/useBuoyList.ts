import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NEARSHORE_STATIONS, NearshoreStation } from '../constants/buoys';

const STORAGE_KEY = '@budat/buoy_list';
const STATION_ID_MIGRATIONS: Record<string, string> = {
  '51101': '51001',
};

function migrateStationIds(ids: string[]): string[] {
  const next: string[] = [];
  ids.forEach(id => {
    const migrated = STATION_ID_MIGRATIONS[id] ?? id;
    if (!next.includes(migrated)) next.push(migrated);
  });
  return next;
}

export function useBuoyList() {
  const [activeIds, setActiveIds] = useState<string[]>(NEARSHORE_STATIONS.map(s => s.id));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val) {
        try {
          const ids: string[] = migrateStationIds(JSON.parse(val));
          // Filter to only valid station IDs
          const valid = ids.filter(id => NEARSHORE_STATIONS.some(s => s.id === id));
          if (valid.length > 0) {
            setActiveIds(valid);
            AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(valid)).catch(() => {});
          }
        } catch {}
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  const persist = useCallback((ids: string[]) => {
    setActiveIds(ids);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids)).catch(() => {});
  }, []);

  const addBuoy = useCallback((id: string) => {
    setActiveIds(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const removeBuoy = useCallback((id: string) => {
    setActiveIds(prev => {
      const next = prev.filter(x => x !== id);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const moveBuoy = useCallback((id: string, delta: -1 | 1) => {
    setActiveIds(prev => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const next = [...prev];
      const target = idx + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const activeStations: NearshoreStation[] = activeIds
    .map(id => NEARSHORE_STATIONS.find(s => s.id === id))
    .filter((s): s is NearshoreStation => s != null);

  const availableStations: NearshoreStation[] = NEARSHORE_STATIONS.filter(
    s => !activeIds.includes(s.id)
  );

  return { activeStations, availableStations, addBuoy, removeBuoy, moveBuoy, loaded };
}
