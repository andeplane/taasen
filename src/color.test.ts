import { describe, expect, it } from 'vitest';
import { BAND_META, bandMeta, colorFor, SEQ_STOPS, seqColor, TYPE_META, typeMeta, type ColorDomains } from './color';
import { makeHouse } from './test/factory';
import type { Salgsband } from './types';

const dom: ColorDomains = { eiertidMax: 40, p5Min: 0.1, p5Max: 0.5 };

describe('typeMeta', () => {
  it('returns metadata for known types', () => {
    expect(typeMeta('Enebolig')).toBe(TYPE_META.Enebolig);
  });
  it('falls back to a gray entry for unknown types', () => {
    expect(typeMeta('Slott')).toEqual({ short: 'Slott', color: '#6b7688' });
  });
});

describe('bandMeta', () => {
  it('returns metadata for known bands', () => {
    expect(bandMeta('Middels')).toBe(BAND_META.Middels);
  });
  it('falls back for unknown bands', () => {
    expect(bandMeta('Ekstrem' as Salgsband)).toEqual({
      color: '#c2ccd9', bg: 'rgba(255,255,255,.08)', dot: '#888',
    });
  });
});

describe('seqColor', () => {
  it('returns the first stop at 0', () => expect(seqColor(0)).toBe(SEQ_STOPS[0]));
  it('returns the last stop at 1', () => expect(seqColor(1)).toBe(SEQ_STOPS[SEQ_STOPS.length - 1]));
  it('clamps below 0 and above 1', () => {
    expect(seqColor(-5)).toBe(SEQ_STOPS[0]);
    expect(seqColor(7)).toBe(SEQ_STOPS[SEQ_STOPS.length - 1]);
  });
  it('interpolates between stops', () => {
    // halfway between stop 0 (#440154) and stop 1 (#482878)
    const t = 0.5 / (SEQ_STOPS.length - 1);
    expect(seqColor(t)).toBe('#461566');
  });
});

describe('colorFor', () => {
  it('colors by boligtype in type mode', () => {
    expect(colorFor(makeHouse({ boligtype: 'Enebolig' }), 'type', dom)).toBe(TYPE_META.Enebolig.color);
  });
  it('colors by band dot in band mode', () => {
    expect(colorFor(makeHouse({ salgsband: 'Høyere' }), 'band', dom)).toBe(BAND_META['Høyere'].dot);
  });
  it('colors by eiertid on the sequential scale', () => {
    expect(colorFor(makeHouse({ eiertid_aar: 40 }), 'eiertid', dom)).toBe(SEQ_STOPS[SEQ_STOPS.length - 1]);
    expect(colorFor(makeHouse({ eiertid_aar: 0 }), 'eiertid', dom)).toBe(SEQ_STOPS[0]);
  });
  it('uses neutral gray for unknown eiertid', () => {
    expect(colorFor(makeHouse({ eiertid_aar: null }), 'eiertid', dom)).toBe('#8b98a5');
  });
  it('colors by p5 normalized to the domain', () => {
    expect(colorFor(makeHouse({ p5: 0.5 }), 'p5', dom)).toBe(SEQ_STOPS[SEQ_STOPS.length - 1]);
    expect(colorFor(makeHouse({ p5: 0.1 }), 'p5', dom)).toBe(SEQ_STOPS[0]);
  });
  it('uses neutral gray for unknown p5', () => {
    const h = makeHouse({ p5: null as unknown as number });
    expect(colorFor(h, 'p5', dom)).toBe('#8b98a5');
  });
});
