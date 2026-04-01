import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transmission } from '../constants/types';

const STORAGE_KEY = 'etpp_transmissions';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

interface UseTransmissionLogReturn {
  transmissions: Transmission[];
  loading: boolean;
  addTransmission: (t: Omit<Transmission, 'id'>) => Promise<void>;
  clearLog: () => Promise<void>;
}

export function useTransmissionLog(): UseTransmissionLogReturn {
  const [transmissions, setTransmissions] = useState<Transmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(raw => {
        if (raw) setTransmissions(JSON.parse(raw) as Transmission[]);
      })
      .finally(() => setLoading(false));
  }, []);

  const addTransmission = useCallback(async (t: Omit<Transmission, 'id'>) => {
    const entry: Transmission = { ...t, id: generateId() };
    const updated = [entry, ...transmissions];
    setTransmissions(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, [transmissions]);

  const clearLog = useCallback(async () => {
    setTransmissions([]);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return { transmissions, loading, addTransmission, clearLog };
}
