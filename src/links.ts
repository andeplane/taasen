import type { House } from './types';

export const googleMapsUrl = (h: House): string =>
  `https://www.google.com/maps/search/?api=1&query=${h.lat},${h.lon}`;

export const streetViewUrl = (h: House): string =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${h.lat},${h.lon}`;

/** Finn.no "solgt eiendom" map centered on the house. */
export const finnSoldUrl = (h: House): string =>
  `https://www.finn.no/map/realestate/sold?lat=${h.lat.toFixed(5)}&lon=${h.lon.toFixed(5)}&results=true&zoom=16`;

export const googleSearchUrl = (query: string): string =>
  `https://www.google.com/search?q=${encodeURIComponent(query).replace(/%20/g, '+')}`;
