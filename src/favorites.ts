import { houses, housesByAdresse } from './data';

const FAV_KEY = 'tasen_favs';

/** Load persisted favorites and mark the matching houses. */
export function initFavorites(): void {
  const stored = new Set<string>(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]'));
  houses.forEach(h => { h.fav = stored.has(h.adresse); });
}

/** Flip favorite state for an address and persist. Returns the house, or null if unknown. */
export function toggleFavorite(adresse: string) {
  const h = housesByAdresse.get(adresse);
  if (!h) return null;
  h.fav = !h.fav;
  localStorage.setItem(FAV_KEY, JSON.stringify(houses.filter(x => x.fav).map(x => x.adresse)));
  return h;
}
