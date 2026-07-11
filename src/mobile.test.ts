// Mobile (narrow-viewport) behavior: card list, detail bottom sheet, view toggle.
// matchMedia is stubbed as matching before ./main is imported, so the app boots
// in its narrow-screen mode.
import { beforeAll, describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import type { House } from './types';

const bodyHtml = indexHtml.split(/<body>/)[1].split(/<script type="module"/)[0];

const $ = (id: string) => document.getElementById(id)!;
const input = (id: string) => $(id) as HTMLInputElement;
const cards = () => [...document.querySelectorAll<HTMLElement>('#cards .card')];

let houses: House[];

beforeAll(async () => {
  localStorage.clear();
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => { /* deprecated no-op */ },
    removeListener: () => { /* deprecated no-op */ },
    addEventListener: () => { /* no-op in jsdom */ },
    removeEventListener: () => { /* no-op in jsdom */ },
    dispatchEvent: () => false,
  });
  document.body.innerHTML = bodyHtml;
  const mapEl = $('map');
  Object.defineProperty(mapEl, 'clientWidth', { value: 390, configurable: true });
  Object.defineProperty(mapEl, 'clientHeight', { value: 600, configurable: true });
  Object.defineProperty($('main'), 'getBoundingClientRect', {
    value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 390, bottom: 600, width: 390, height: 600, toJSON: () => ({}) }),
    configurable: true,
  });
  await import('./main');
  ({ houses } = await import('./data'));
});

describe('card list', () => {
  it('renders one card per house with address, band pill and meta row', () => {
    expect(cards().length).toBe(houses.length);
    const first = cards()[0];
    const h = houses[Number(first.dataset.id)];
    expect(first.querySelector('.cadr')!.textContent).toBe(h.adresse);
    expect(first.querySelector('.bandpill')!.textContent).toContain(h.salgsband);
    expect(first.querySelector('.cmeta')!.textContent).toContain('BRA');
    expect(first.querySelector('.cmeta')!.textContent).toContain('Tinglyst');
  });

  it('shows the live count in the header', () => {
    expect($('mcount').textContent).toBe(`${houses.length} / ${houses.length}`);
  });

  it('filters cards with the search box', () => {
    input('q').value = 'tåsenveien';
    input('q').dispatchEvent(new Event('input'));
    const expected = houses.filter(h => h.adresse.toLowerCase().includes('tåsenveien')
      || (h.registrert_kjoper ?? '').toLowerCase().includes('tåsenveien')).length;
    expect(cards().length).toBe(expected);
    expect($('mcount').textContent).toBe(`${expected} / ${houses.length}`);
    input('q').value = '';
    input('q').dispatchEvent(new Event('input'));
    expect(cards().length).toBe(houses.length);
  });

  it('shows an empty state when nothing matches', () => {
    input('q').value = 'finnes-ikke-gate 99Z';
    input('q').dispatchEvent(new Event('input'));
    expect(cards().length).toBe(0);
    expect($('cards').textContent).toContain('Ingen adresser matcher');
    input('q').value = '';
    input('q').dispatchEvent(new Event('input'));
  });
});

describe('detail sheet', () => {
  it('opens with facts and action links when a card is tapped', () => {
    const card = cards()[3];
    const h = houses[Number(card.dataset.id)];
    card.click();
    expect(document.body.classList.contains('sheet-open')).toBe(true);
    expect(card.classList.contains('sel')).toBe(true);
    const body = $('sheetBody');
    expect(body.textContent).toContain(h.adresse);
    expect(body.textContent).toContain('Verdiestimat');
    expect(body.textContent).toContain('Eiertid');
    const links = [...body.querySelectorAll<HTMLAnchorElement>('.links a')];
    expect(links.map(a => a.textContent)).toEqual(['Google Maps ↗', 'Street View', 'Finn solgte eiendommer ↗']);
    links.forEach(a => expect(a.target).toBe('_blank'));
  });

  it('closes via the close button and the overlay', () => {
    $('sheetClose').click();
    expect(document.body.classList.contains('sheet-open')).toBe(false);
    cards()[0].click();
    expect(document.body.classList.contains('sheet-open')).toBe(true);
    $('sheetOverlay').click();
    expect(document.body.classList.contains('sheet-open')).toBe(false);
  });

  it('toggles favorite from the sheet favlink and updates the card star', () => {
    const card = cards()[0];
    const h = houses[Number(card.dataset.id)];
    card.click();
    const favlink = $('sheetBody').querySelector<HTMLElement>('.favlink')!;
    favlink.click();
    expect(h.fav).toBe(true);
    expect(favlink.textContent).toBe('★');
    expect(cards()[0].querySelector('.cstar')!.classList.contains('on')).toBe(true);
    favlink.click();
    expect(h.fav).toBe(false);
    expect(cards()[0].querySelector('.cstar')!.classList.contains('on')).toBe(false);
    $('sheetClose').click();
  });
});

describe('card favorites', () => {
  it('toggles from the card star without opening the sheet', () => {
    const card = cards()[1];
    const h = houses[Number(card.dataset.id)];
    card.querySelector<HTMLElement>('.cstar')!.click();
    expect(h.fav).toBe(true);
    expect(document.body.classList.contains('sheet-open')).toBe(false);
    expect($('favCount').textContent).toBe('1');
    expect($('favCount').style.display).not.toBe('none');
    cards()[1].querySelector<HTMLElement>('.cstar')!.click();
    expect(h.fav).toBe(false);
    expect($('favCount').style.display).toBe('none');
  });
});

describe('view toggle', () => {
  it('switches between list and map view', () => {
    expect(document.body.classList.contains('mview-map')).toBe(false);
    expect($('viewToggleLabel').textContent).toBe('Kart');
    $('viewToggle').click();
    expect(document.body.classList.contains('mview-map')).toBe(true);
    expect($('viewToggleLabel').textContent).toBe('Liste');
    $('viewToggle').click();
    expect(document.body.classList.contains('mview-map')).toBe(false);
    expect($('viewToggleLabel').textContent).toBe('Kart');
  });
});

describe('header', () => {
  it('starts expanded so the stat tiles are visible', () => {
    expect(document.body.classList.contains('header-collapsed')).toBe(false);
  });
});
