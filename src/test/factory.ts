import type { House } from '../types';

/** Fully populated house for tests; override fields per case. */
export function makeHouse(overrides: Partial<House> = {}): House {
  return {
    adresse: 'Testveien 1',
    gate: 'Testveien',
    husnr: '1',
    postnr: '0873',
    boligtype: 'Enebolig',
    tomt_m2: 500,
    gnrbnr: '53/1',
    tinglyst: true,
    enheter: 1,
    p5: 0.25,
    salgsband: 'Lav',
    tinglysingsdato: '2020-06-15',
    eiertid_aar: 5.5,
    bra_klasse: 'over 150 m²',
    bra_min_m2: 150,
    byggeaar: 1950,
    etasjer: 2,
    estimat_min_mnok: 10,
    estimat_maks_mnok: 12,
    registrert_kjoper: 'Kari Nordmann',
    kjoper_tvetydig: false,
    id: 0,
    lat: 59.95,
    lon: 10.75,
    fav: false,
    ...overrides,
  };
}
