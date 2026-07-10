import { describe, expect, it } from 'vitest';
import { boligtyper, computeDomains, domains, houses, housesByAdresse, streetCount, streets, summaryStats } from './data';

describe('houses', () => {
  it('parses every feature from houses.geojson', () => {
    expect(houses.length).toBeGreaterThan(1000);
  });
  it('assigns sequential ids and coordinates', () => {
    houses.forEach((h, i) => {
      expect(h.id).toBe(i);
      expect(h.lat).toBeGreaterThan(59);
      expect(h.lon).toBeGreaterThan(10);
    });
  });
  it('starts with no favorites', () => {
    expect(houses.every(h => !h.fav)).toBe(true);
  });
  it('indexes houses by address', () => {
    const h = houses[0];
    expect(housesByAdresse.get(h.adresse)).toBe(h);
  });
});

describe('derived lists', () => {
  it('collects unique streets in Norwegian collation order', () => {
    expect(streets.length).toBe(streetCount);
    expect([...streets].sort((a, b) => a.localeCompare(b, 'nb'))).toEqual(streets);
    expect(new Set(streets).size).toBe(streets.length);
  });
  it('collects unique boligtyper', () => {
    expect(boligtyper.length).toBeGreaterThan(2);
    expect(new Set(boligtyper).size).toBe(boligtyper.length);
  });
});

describe('domains', () => {
  it('caps eiertid at the 95th percentile', () => {
    const vals = houses.map(h => h.eiertid_aar).filter((v): v is number => v != null);
    const max = Math.max(...vals);
    expect(domains.eiertidMax).toBeGreaterThan(0);
    expect(domains.eiertidMax).toBeLessThanOrEqual(max);
  });
  it('derives the p5 range from the data', () => {
    expect(domains.p5Min).toBeGreaterThanOrEqual(0);
    expect(domains.p5Max).toBeLessThanOrEqual(1);
    expect(domains.p5Max).toBeGreaterThan(domains.p5Min);
  });
  it('falls back to safe defaults for empty input', () => {
    expect(computeDomains([])).toEqual({ eiertidMax: 1, p5Min: 0, p5Max: 1 });
  });
});

describe('summaryStats', () => {
  it('produces the five header stats', () => {
    const stats = summaryStats();
    expect(stats.map(s => s.label)).toEqual(
      ['Adresser', 'Eiendommer', 'Snitt tomt', 'Snitt byggeår', 'Mest vanlig']);
    expect(stats[0].value).toBe(houses.length.toLocaleString('nb-NO'));
    expect(stats[2].value).toMatch(/ m²$/);
    expect(Number(stats[3].value)).toBeGreaterThan(1900);
    expect(stats[4].wide).toBe(true);
    expect(stats[4].value.split(' · ').length).toBe(3);
  });
});
