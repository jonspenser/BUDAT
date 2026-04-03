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
}

export const OFFSHORE_STATIONS: OffshoreStation[] = [
  { id: '51001', name: 'NW BUOY',   corner: 'NW', lat: 24.321, lon: -162.058 },
  { id: '51000', name: 'NE BUOY',   corner: 'NE', lat: 23.538, lon: -153.913 },
  { id: '51002', name: 'SW BUOY',   corner: 'SW', lat: 17.094, lon: -157.808 },
  { id: '51004', name: 'SE BUOY',   corner: 'SE', lat: 17.525, lon: -152.382 },
];

export const NEARSHORE_STATIONS: NearshoreStation[] = [
  { id: '51213', name: 'HANALEI',   lat: 22.228, lon: -159.575 },
  { id: '51201', name: 'WAIMEA BAY', lat: 21.673, lon: -158.116 },
  { id: '51208', name: 'PAUWELA',   lat: 20.898, lon: -156.425 },
  { id: '51205', name: 'BARBERS PT', lat: 21.300, lon: -158.100 },
  { id: '51206', name: 'HILO',      lat: 19.897, lon: -154.970 },
  { id: '51212', name: 'LANAI',     lat: 20.500, lon: -157.100 },
];

export const TIDE_STATION_ID = '1615630';
export const TIDE_STATION_NAME = 'KAHULUI';

// Map bounds for Hawaii island projection
export const MAP_BOUNDS = {
  lonMin: -160.5,
  lonMax: -154.6,
  latMin: 18.8,
  latMax: 23.0,
};
