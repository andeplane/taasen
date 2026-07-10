import { beforeEach, describe, expect, it } from 'vitest';
import { houses } from './data';
import { initFavorites, toggleFavorite } from './favorites';

beforeEach(() => {
  localStorage.clear();
  houses.forEach(h => { h.fav = false; });
});

describe('initFavorites', () => {
  it('marks stored addresses as favorites', () => {
    const h = houses[3];
    localStorage.setItem('tasen_favs', JSON.stringify([h.adresse]));
    initFavorites();
    expect(h.fav).toBe(true);
    expect(houses.filter(x => x.fav).length).toBe(1);
  });
  it('handles missing storage', () => {
    initFavorites();
    expect(houses.some(h => h.fav)).toBe(false);
  });
});

describe('toggleFavorite', () => {
  it('adds and persists a favorite', () => {
    const h = houses[5];
    const result = toggleFavorite(h.adresse);
    expect(result).toBe(h);
    expect(h.fav).toBe(true);
    expect(JSON.parse(localStorage.getItem('tasen_favs')!)).toEqual([h.adresse]);
  });
  it('removes on second toggle', () => {
    const h = houses[5];
    toggleFavorite(h.adresse);
    toggleFavorite(h.adresse);
    expect(h.fav).toBe(false);
    expect(JSON.parse(localStorage.getItem('tasen_favs')!)).toEqual([]);
  });
  it('returns null for unknown addresses', () => {
    expect(toggleFavorite('Finnes Ikke 99')).toBeNull();
  });
});
