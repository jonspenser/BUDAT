import { useMemo } from 'react';
import { encodeMessage } from '../constants/encoding';
import { SignalGrid } from '../constants/types';

export function useSignalEncoder(message: string): SignalGrid {
  return useMemo(() => {
    if (!message.trim()) {
      return { cols: 1, rows: 1, bits: new Uint8Array([0]) };
    }
    return encodeMessage(message);
  }, [message]);
}
