export type Season = 'summer' | 'winter';

export interface BuoyStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  corner?: 'NW' | 'NE' | 'SW' | 'SE';
  season: Season[];
}

export const BUOY_STATIONS: BuoyStation[] = [
  // Offshore corner buoys
  { id: '51001', name: 'NW', lat: 23.4,  lon: -162.2, corner: 'NW', season: ['winter'] },
  { id: '51101', name: 'NE', lat: 24.3,  lon: -157.8, corner: 'NE', season: ['winter'] },
  { id: '51002', name: 'SW', lat: 17.1,  lon: -157.7, corner: 'SW', season: ['summer'] },
  { id: '51004', name: 'SE', lat: 17.5,  lon: -152.4, corner: 'SE', season: ['summer'] },
  // Nearshore buoys
  { id: '51208', name: 'HANALEI',    lat: 22.25, lon: -159.57, season: ['winter'] },
  { id: '51201', name: 'WAIMEA BAY', lat: 21.67, lon: -158.12, season: ['winter'] },
  { id: '51206', name: 'PAUWELA',    lat: 21.01, lon: -156.43, season: ['winter'] },
  { id: '51205', name: 'LANAI',      lat: 20.74, lon: -157.02, season: ['summer'] },
  { id: '51202', name: 'BARBERS PT', lat: 21.26, lon: -158.15, season: ['summer'] },
  { id: '51204', name: 'HILO',       lat: 19.79, lon: -154.97, season: ['winter'] },
];

export const TIDE_STATION_ID = '1615680';
export const TIDE_STATION_NAME = 'KAHULUI';

// Map bounds
export const MAP_BOUNDS = {
  lonMin: -163.5,
  lonMax: -152.0,
  latMin: 17.0,
  latMax: 25.5,
};
