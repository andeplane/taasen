import type { CircleMarker } from 'leaflet';

export type Salgsband = 'Lav' | 'Middels' | 'Høyere';

/** Properties of one address as produced by sync_dataset.py (houses.geojson). */
export interface HouseProperties {
  adresse: string;
  gate: string;
  husnr: string;
  postnr: string;
  boligtype: string;
  tomt_m2: number | null;
  gnrbnr: string;
  tinglyst: boolean;
  enheter: number;
  p5: number;
  salgsband: Salgsband;
  tinglysingsdato: string | null;
  eiertid_aar: number | null;
  bra_klasse: string | null;
  bra_min_m2: number | null;
  byggeaar: number | null;
  etasjer: number | null;
  estimat_min_mnok: number | null;
  estimat_maks_mnok: number | null;
  registrert_kjoper: string | null;
  kjoper_tvetydig: boolean;
}

/** One address enriched with position, identity and app state. */
export interface House extends HouseProperties {
  id: number;
  lat: number;
  lon: number;
  fav: boolean;
  marker?: CircleMarker;
}

export interface HousesGeoJSON {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: HouseProperties;
  }[];
}

export type ColorMode = 'type' | 'band' | 'eiertid' | 'p5';
export type SortDir = 'asc' | 'desc';
