import React, { createContext, useContext } from 'react';
import { useSwellLog } from '../hooks/useSwellLog';

type SwellLogValue = ReturnType<typeof useSwellLog>;

const SwellLogContext = createContext<SwellLogValue | null>(null);

export function SwellLogProvider({ children }: { children: React.ReactNode }) {
  const value = useSwellLog();
  return <SwellLogContext.Provider value={value}>{children}</SwellLogContext.Provider>;
}

export function useSwellLogContext(): SwellLogValue {
  const ctx = useContext(SwellLogContext);
  if (!ctx) throw new Error('useSwellLogContext must be used within SwellLogProvider');
  return ctx;
}
