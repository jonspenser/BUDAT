export interface Star {
  id: string;
  name: string;
  constellation: string;
  distanceLy: number;
  spectralClass: string;
  rightAscension: string;
  declination: string;
  apparentMag: number;
}

export interface Transmission {
  id: string;
  message: string;
  starId: string;
  starName: string;
  distanceLy: number;
  sentAt: string;
  arrivalAt: string;
  gridCols: number;
  gridRows: number;
  binaryPayload: string;
}

export interface SignalGrid {
  cols: number;
  rows: number;
  bits: Uint8Array;
}
