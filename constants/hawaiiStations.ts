export interface HawaiiStation {
  id: string;
  name: string;
  island: string;
  windStationId: string;  // NDBC CMAN/buoy station
  tideStationId: string;  // NOAA CO-OPS gauge
}

export const HAWAII_STATIONS: HawaiiStation[] = [
  { id: 'kahului',    name: 'KAHULUI',    island: 'MAUI',    windStationId: 'KLIH1',  tideStationId: '1615395' },
  { id: 'honolulu',   name: 'HONOLULU',   island: 'OAHU',    windStationId: 'MOKH1',  tideStationId: '1612340' },
  { id: 'nawiliwili', name: 'NAWILIWILI', island: 'KAUAI',   windStationId: 'NWWH1',  tideStationId: '1619000' },
  { id: 'hilo',       name: 'HILO',       island: 'HAWAII',  windStationId: 'OOUH1',  tideStationId: '1617760' },
  { id: 'kawaihae',   name: 'KAWAIHAE',   island: 'HAWAII',  windStationId: 'KWHH1',  tideStationId: '1617433' },
];

export const DEFAULT_STATION = HAWAII_STATIONS[0];
