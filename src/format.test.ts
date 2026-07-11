import { describe, expect, it } from 'vitest';
import { braText, buyerNames, buyerText, escapeHtml, estimatText, formatDate, nb } from './format';
import { makeHouse } from './test/factory';

describe('escapeHtml', () => {
  it('escapes all five special characters', () => {
    expect(escapeHtml(`<a href="x" data-y='z'>&</a>`))
      .toBe('&lt;a href=&quot;x&quot; data-y=&#39;z&#39;&gt;&amp;&lt;/a&gt;');
  });
  it('stringifies null and undefined to empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  it('stringifies numbers', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('formatDate', () => {
  it('formats ISO dates as Norwegian dd.mm.yyyy', () => {
    expect(formatDate('2023-08-02')).toBe('02.08.2023');
  });
  it('returns dash for null', () => {
    expect(formatDate(null)).toBe('–');
  });
});

describe('buyerText', () => {
  it('returns the registered buyer when present', () => {
    expect(buyerText(makeHouse({ registrert_kjoper: 'Ola' }))).toBe('Ola');
  });
  it('flags ambiguous sectioned properties', () => {
    expect(buyerText(makeHouse({ registrert_kjoper: null, kjoper_tvetydig: true })))
      .toBe('Tvetydig – seksjonert');
  });
  it('returns dash when unknown', () => {
    expect(buyerText(makeHouse({ registrert_kjoper: null, kjoper_tvetydig: false }))).toBe('–');
  });
});

describe('buyerNames', () => {
  it('splits multiple co-buyers on commas and trims them', () => {
    expect(buyerNames(makeHouse({ registrert_kjoper: 'Ola Nordmann, Kari Nordmann' })))
      .toEqual(['Ola Nordmann', 'Kari Nordmann']);
  });
  it('returns a single-element array for one buyer', () => {
    expect(buyerNames(makeHouse({ registrert_kjoper: 'Ola Nordmann' }))).toEqual(['Ola Nordmann']);
  });
  it('returns an empty array when unknown', () => {
    expect(buyerNames(makeHouse({ registrert_kjoper: null }))).toEqual([]);
  });
});

describe('braText', () => {
  it('returns dash for unknown', () => expect(braText(null)).toBe('–'));
  it('returns <30 for the zero class', () => expect(braText(0)).toBe('<30'));
  it('returns floor+ for known classes', () => expect(braText(150)).toBe('150+'));
});

describe('estimatText', () => {
  it('formats the estimate range', () => {
    expect(estimatText(makeHouse({ estimat_min_mnok: 10.5, estimat_maks_mnok: 12 }))).toBe('10.5–12M');
  });
  it('returns dash when missing', () => {
    expect(estimatText(makeHouse({ estimat_min_mnok: null, estimat_maks_mnok: null }))).toBe('–');
  });
});

describe('nb', () => {
  it('formats with Norwegian thousand separators', () => {
    expect(nb(1574)).toBe('1 574');
  });
});
