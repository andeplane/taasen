import rawGeojson from '../houses.geojson?raw';
import type { ColorDomains } from './color';
import { typeMeta } from './color';
import { nb } from './format';
import type { House, HousesGeoJSON } from './types';

const geojson = JSON.parse(rawGeojson) as HousesGeoJSON;

export const houses: House[] = geojson.features.map((f, i) => ({
  ...f.properties,
  id: i,
  lat: f.geometry.coordinates[1],
  lon: f.geometry.coordinates[0],
  fav: false,
}));

export const housesByAdresse = new Map(houses.map(h => [h.adresse, h]));

const uniq = (get: (h: House) => string) => [...new Set(houses.map(get))].sort();
export const streets = uniq(h => h.gate);
export const boligtyper = uniq(h => h.boligtype);

const quantile = (vals: number[], q: number): number => {
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.round((s.length - 1) * q)];
};

// eiertid capped at p95 so a handful of 1950s deeds don't flatten the recent end of the scale
export function computeDomains(hs: House[]): ColorDomains {
  const eiertidVals = hs.map(h => h.eiertid_aar).filter((v): v is number => v != null);
  const p5Vals = hs.map(h => h.p5).filter((v): v is number => v != null);
  return {
    eiertidMax: eiertidVals.length ? quantile(eiertidVals, 0.95) : 1,
    p5Min: p5Vals.length ? Math.min(...p5Vals) : 0,
    p5Max: p5Vals.length ? Math.max(...p5Vals) : 1,
  };
}
export const domains: ColorDomains = computeDomains(houses);

export interface Stat { value: string; label: string; wide?: boolean; }
export function summaryStats(): Stat[] {
  const nProps = new Set(houses.map(h => h.gnrbnr)).size;
  const withPlot = houses.filter(h => h.tomt_m2);
  const avgPlot = Math.round(withPlot.reduce((s, h) => s + (h.tomt_m2 ?? 0), 0) / withPlot.length);
  const withYear = houses.filter(h => h.byggeaar);
  const avgYear = Math.round(withYear.reduce((s, h) => s + (h.byggeaar ?? 0), 0) / withYear.length);
  const mix: Record<string, number> = {};
  houses.forEach(h => { mix[h.boligtype] = (mix[h.boligtype] ?? 0) + 1; });
  const topMix = Object.entries(mix).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([k, v]) => `${v} ${typeMeta(k).short}`).join(' · ');
  return [
    { value: nb(houses.length), label: 'Adresser' },
    { value: nb(nProps), label: 'Eiendommer' },
    { value: `${nb(avgPlot)} m²`, label: 'Snitt tomt' },
    { value: String(avgYear), label: 'Snitt byggeår' },
    { value: topMix, label: 'Mest vanlig', wide: true },
  ];
}

export const streetCount = new Set(houses.map(h => h.gate)).size;
