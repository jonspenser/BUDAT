export interface OffshoreStation {
  id: string;
  name: string;
  corner: 'NW' | 'NE' | 'SW' | 'SE';
  lat: number;
  lon: number;
}

export interface NearshoreStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  labelBelow?: boolean;
  labelOffsetX?: number;
  labelOffsetY?: number;
  arrowOffsetX?: number;
  dotOffsetY?: number;
  degOffsetY?: number;
  labelSide?: 'left' | 'right';
  labelSpacing?: number;
  timeTop?: boolean;
}

export const OFFSHORE_STATIONS: OffshoreStation[] = [
  { id: '51001', name: 'NW BUOY',   corner: 'NW', lat: 24.475, lon: -162.030 },
  { id: '51000', name: 'NE BUOY',   corner: 'NE', lat: 23.538, lon: -153.913 },
  { id: '51002', name: 'SW BUOY',   corner: 'SW', lat: 17.094, lon: -157.808 },
  { id: '51004', name: 'SE BUOY',   corner: 'SE', lat: 17.525, lon: -152.382 },
];

export const NEARSHORE_STATIONS: NearshoreStation[] = [
  { id: '51001', name: 'NW BUOY',    lat: 24.475, lon: -162.030, timeTop: true, labelOffsetX: 4, labelSpacing: 12, degOffsetY: 4 },
  { id: '51000', name: 'NE BUOY',    lat: 23.773, lon: -153.859, timeTop: true },
  { id: '51208', name: 'HANALEI',    lat: 22.285, lon: -159.574, timeTop: true, labelOffsetX: -28, arrowOffsetX: -10, labelSpacing: 14 },
  { id: '51201', name: 'WAIMEA BAY', lat: 21.671, lon: -158.118, timeTop: true, labelOffsetX: 6, labelSpacing: 14 },
  { id: '51205', name: 'PAUWELA',    lat: 21.018, lon: -156.421, timeTop: true, labelOffsetX: 14, labelSpacing: 14 },
  { id: '51212', name: 'BARBERS PT', lat: 21.323, lon: -158.149, labelBelow: true, arrowOffsetX: -5, dotOffsetY: 3, degOffsetY: -3, labelSide: 'left', labelOffsetX: -6, labelOffsetY: 7, labelSpacing: 14 },
  { id: '51206', name: 'HILO',       lat: 19.779, lon: -154.970, timeTop: true, labelSide: 'right', labelOffsetX: 4, labelSpacing: 14 },
  { id: '51213', name: 'LANAI',      lat: 20.750, lon: -157.002, labelBelow: true, labelOffsetX: 10, labelOffsetY: 14, labelSpacing: 14 },
  { id: '51002', name: 'SW BUOY',    lat: 17.079, lon: -157.510, labelBelow: true },
  { id: '51004', name: 'SE BUOY',    lat: 17.480, lon: -152.227, labelBelow: true },
];

// Recovered from bytecode string table — station ID 1615395 confirmed
export const TIDE_STATION_ID = '1615395';
export const TIDE_STATION_NAME = 'KAHULUI';

// Map bounds calibrated from reference image dot positions (1500x2100px)
export const MAP_BOUNDS = {
  lonMin: -164.24,
  lonMax: -151.01,
  latMin: 10.84,
  latMax: 29.94,
};
