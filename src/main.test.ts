import { beforeAll, describe, expect, it, vi } from 'vitest';
import indexHtml from '../index.html?raw';
import type { House } from './types';

const bodyHtml = indexHtml.split(/<body>/)[1].split(/<script type="module"/)[0];
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const $ = (id: string) => document.getElementById(id)!;
const input = (id: string) => $(id) as HTMLInputElement;
const shown = () => Number($('shown').textContent);
const chips = () => [...document.querySelectorAll<HTMLElement>('#chips .chip')];
const chipLabels = () => chips().map(c => c.textContent!.replace('×', '').trim());

function mountDom(): void {
  document.body.innerHTML = bodyHtml;
  const mapEl = $('map');
  Object.defineProperty(mapEl, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(mapEl, 'clientHeight', { value: 600, configurable: true });
  Object.defineProperty($('main'), 'getBoundingClientRect', {
    value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, toJSON: () => ({}) }),
    configurable: true,
  });
}

let houses: House[];

beforeAll(async () => {
  localStorage.clear();
  mountDom();
  await import('./main');
  ({ houses } = await import('./data'));
});

const matchQ = (h: House, q: string): boolean =>
  h.adresse.toLowerCase().includes(q)
  || (h.registrert_kjoper ?? '').toLowerCase().includes(q)
  || h.gnrbnr.includes(q);

describe('startup', () => {
  it('renders header stats and the total count', () => {
    expect($('total').textContent).toBe(String(houses.length));
    expect(shown()).toBe(houses.length);
    expect($('stats').querySelectorAll('.stat').length).toBe(5);
    expect(Number($('streetCount').textContent)).toBeGreaterThan(10);
    expect($('tbody').querySelectorAll('tr').length).toBe(houses.length);
  });
});

describe('search', () => {
  const search = (q: string) => { input('q').value = q; input('q').dispatchEvent(new Event('input')); };

  it('matches addresses', () => {
    search('tåsenveien');
    expect(shown()).toBe(houses.filter(h => matchQ(h, 'tåsenveien')).length);
    expect(chipLabels()).toEqual(['Søk: "tåsenveien"']);
  });
  it('matches registered buyers', () => {
    const buyer = houses.find(h => h.registrert_kjoper)!.registrert_kjoper!.toLowerCase();
    search(buyer);
    expect(shown()).toBe(houses.filter(h => matchQ(h, buyer)).length);
    expect(shown()).toBeGreaterThan(0);
  });
  it('matches matrikkel numbers', () => {
    search('53/2');
    expect(shown()).toBe(houses.filter(h => matchQ(h, '53/2')).length);
  });
  it('shows the empty state when nothing matches', () => {
    search('zzzz-not-a-street');
    expect(shown()).toBe(0);
    expect($('noresults').style.display).toBe('block');
  });
  it('clears via the chip', () => {
    search('tåsenveien');
    chips()[0].querySelector('button')!.click();
    expect(shown()).toBe(houses.length);
    expect(chips().length).toBe(0);
  });
});

describe('category popovers', () => {
  it('filters by boligtype and clears via chip', () => {
    const firstOpt = document.querySelector<HTMLElement>('#msType label.opt')!;
    const type = firstOpt.dataset.v!;
    firstOpt.click(); // uncheck one type
    expect(shown()).toBe(houses.filter(h => h.boligtype !== type).length);
    expect(chipLabels().some(l => l.startsWith('Boligtype:'))).toBe(true);
    expect($('filterCount').textContent).toBe('1');
    chips()[0].querySelector('button')!.click();
    expect(shown()).toBe(houses.length);
  });
  it('filters by gate and salgsutsikt, clearing each via its chip', () => {
    document.querySelector<HTMLElement>('#msStreet label.opt')!.click();
    document.querySelector<HTMLElement>('#msBand label.opt[data-v="Lav"]')!.click();
    expect(chipLabels().some(l => l.startsWith('Gate:'))).toBe(true);
    expect(chipLabels().some(l => l.startsWith('Salgsutsikt:'))).toBe(true);
    while (chips().length) chips()[0].querySelector('button')!.click();
    expect(shown()).toBe(houses.length);
  });
});

describe('range filters and chips', () => {
  const set = (id: string, v: string) => { input(id).value = v; input(id).dispatchEvent(new Event('input')); };

  it('filters BRA with min only', () => {
    set('fBraMin', '200');
    expect(shown()).toBe(houses.filter(h => h.bra_min_m2 != null && h.bra_min_m2 >= 200).length);
    expect(chipLabels()).toEqual(['BRA: 200–']);
  });
  it('filters tomt with max only', () => {
    set('fBraMin', '');
    set('fPlotMax', '500');
    expect(shown()).toBe(houses.filter(h => h.tomt_m2 != null && h.tomt_m2 <= 500).length);
    expect(chipLabels()).toEqual(['Tomt: –500']);
  });
  it('filters byggeår with both bounds', () => {
    set('fPlotMax', '');
    set('fYearMin', '1950');
    set('fYearMax', '1960');
    expect(shown()).toBe(houses.filter(h => h.byggeaar != null && h.byggeaar >= 1950 && h.byggeaar <= 1960).length);
    expect(chipLabels()).toEqual(['Byggeår: 1950–1960']);
  });
  it('filters tinglyst dates and formats the chip', () => {
    set('fYearMin', ''); set('fYearMax', '');
    set('fTinglystFrom', '2020-01-01');
    expect(shown()).toBe(houses.filter(h => h.tinglysingsdato != null && h.tinglysingsdato >= '2020-01-01').length);
    set('fTinglystTo', '2022-12-31');
    expect(shown()).toBe(houses.filter(h =>
      h.tinglysingsdato != null && h.tinglysingsdato >= '2020-01-01' && h.tinglysingsdato <= '2022-12-31').length);
    expect(chipLabels()).toEqual(['Tinglyst: 01.01.2020–31.12.2022']);
    set('fTinglystFrom', '');
    expect(shown()).toBe(houses.filter(h => h.tinglysingsdato != null && h.tinglysingsdato <= '2022-12-31').length);
    set('fTinglystTo', '');
  });
  it('filters eiertid and enheter', () => {
    set('fOwnMin', '10'); set('fOwnMax', '20');
    expect(shown()).toBe(houses.filter(h => h.eiertid_aar != null && h.eiertid_aar >= 10 && h.eiertid_aar <= 20).length);
    set('fUnitMin', '2');
    expect(shown()).toBe(houses.filter(h =>
      h.eiertid_aar != null && h.eiertid_aar >= 10 && h.eiertid_aar <= 20 && h.enheter >= 2).length);
    expect(chipLabels()).toEqual(['Eiertid: 10–20', 'Enheter: 2–']);
    $('reset').click();
  });
  it('filters estimat by range overlap', () => {
    set('fEstMin', '15');
    expect(shown()).toBe(houses.filter(h => h.estimat_min_mnok != null && h.estimat_maks_mnok! >= 15).length);
    set('fEstMax', '20');
    expect(shown()).toBe(houses.filter(h =>
      h.estimat_min_mnok != null && h.estimat_maks_mnok! >= 15 && h.estimat_min_mnok <= 20).length);
    set('fEstMin', '');
    expect(shown()).toBe(houses.filter(h => h.estimat_min_mnok != null && h.estimat_min_mnok <= 20).length);
    expect(chipLabels()).toEqual(['Estimat: –20']);
    set('fEstMax', '');
  });
  it('filters by minimum salgsutsikt with the slider', () => {
    set('fP5Min', '30');
    expect($('p5Val').textContent).toBe('30 %');
    expect(shown()).toBe(houses.filter(h => h.p5 * 100 >= 30).length);
    expect(chipLabels()).toEqual(['Min. salgsutsikt: 30 %']);
    chips()[0].querySelector('button')!.click();
    expect(shown()).toBe(houses.length);
  });
  it('clears every range chip via its × button', { timeout: 30000 }, () => {
    set('fBraMin', '50'); set('fPlotMin', '100'); set('fYearMin', '1900');
    set('fOwnMin', '1'); set('fEstMin', '5'); set('fUnitMin', '1');
    set('fTinglystFrom', '2000-01-01');
    expect(chips().length).toBe(7);
    while (chips().length) chips()[0].querySelector('button')!.click();
    expect(shown()).toBe(houses.length);
    expect($('filterCount').style.display).toBe('none');
  });
});

describe('favorites', () => {
  it('toggles from the table star and filters via the toolbar button', () => {
    const firstRow = document.querySelector<HTMLElement>('#tbody tr')!;
    const favHouse = houses[Number(firstRow.dataset.id)];
    firstRow.querySelector<HTMLElement>('.fav-cell')!.click();
    expect(favHouse.fav).toBe(true);
    $('favBtn').click();
    expect(input('fFav').checked).toBe(true);
    expect($('favBtn').classList.contains('on')).toBe(true);
    expect(shown()).toBe(1);
    expect(chipLabels()).toEqual(['Kun favoritter ★']);
    chips()[0].querySelector('button')!.click();
    expect(input('fFav').checked).toBe(false);
    expect($('favBtn').classList.contains('on')).toBe(false);
    expect(shown()).toBe(houses.length);
    $('favBtn').click(); $('favBtn').click(); // on and off again via the button
    expect(shown()).toBe(houses.length);
  });

  it('toggles from a popup favlink and updates its label', () => {
    const h = houses[7];
    const btn = document.createElement('button');
    btn.className = 'favlink';
    btn.dataset.adr = h.adresse;
    document.body.appendChild(btn);
    btn.click();
    expect(h.fav).toBe(true);
    expect(btn.textContent).toBe('★');
    expect(btn.title).toBe('Fjern fra favoritter');
    btn.click();
    expect(h.fav).toBe(false);
    expect(btn.textContent).toBe('☆');
    btn.remove();
  });

  it('ignores favlinks with unknown addresses', () => {
    const btn = document.createElement('button');
    btn.className = 'favlink';
    btn.dataset.adr = 'Finnes Ikke 99';
    document.body.appendChild(btn);
    btn.click();
    expect(btn.textContent).toBe('');
    btn.remove();
  });
});

describe('selection', () => {
  it('selects a row, styles its marker and opens the popup after the pan', async () => {
    const secondRow = document.querySelectorAll<HTMLElement>('#tbody tr')[1];
    const h = houses[Number(secondRow.dataset.id)];
    secondRow.querySelector<HTMLElement>('td.adr')!.click();
    expect(document.querySelector<HTMLElement>('#tbody tr.sel')?.dataset.id).toBe(String(h.id));
    expect(h.marker!.options.radius).toBe(8);
    await sleep(400);
    expect(document.querySelector('.leaflet-popup')).not.toBeNull();
  });

  it('moves the selection and restores the previous marker', () => {
    const rowsEls = document.querySelectorAll<HTMLElement>('#tbody tr');
    const prev = houses[Number(rowsEls[1].dataset.id)];
    const next = houses[Number(rowsEls[2].dataset.id)];
    rowsEls[2].querySelector<HTMLElement>('td.adr')!.click();
    expect(prev.marker!.options.radius).toBe(5.2);
    expect(next.marker!.options.radius).toBe(8);
  });

  it('selects without panning on marker click, even when the row is filtered out', () => {
    const h = houses[0];
    input('q').value = 'zzzz-no-match';
    input('q').dispatchEvent(new Event('input'));
    expect(document.querySelector(`#tbody tr[data-id="${h.id}"]`)).toBeNull();
    h.marker!.fire('click');
    expect(h.marker!.options.radius).toBe(8);
    input('q').value = '';
    input('q').dispatchEvent(new Event('input'));
  });
});

describe('table wiring', () => {
  it('re-applies on header sort and highlights hovered rows on the map', () => {
    const th = [...document.querySelectorAll<HTMLElement>('#thead th')]
      .find(t => t.dataset.k === 'byggeaar')!;
    th.click();
    const tr = document.querySelector<HTMLElement>('#tbody tr')!;
    const h = houses[Number(tr.dataset.id)];
    tr.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(h.marker!.options.fillColor).toBe('#ff3b6b');
    $('tbody').dispatchEvent(new MouseEvent('mouseleave'));
    expect(h.marker!.options.fillColor).not.toBe('#ff3b6b');
  });
});

describe('color modes', () => {
  it('switches modes from the menu and closes other popovers when opening', () => {
    document.querySelector<HTMLElement>('#msType .tbtn')!.click();
    expect(document.querySelector('#msType .pop')!.classList.contains('open')).toBe(true);
    $('colorBtn').click();
    expect(document.querySelector('#msType .pop')!.classList.contains('open')).toBe(false);
    expect($('colorMenu').classList.contains('open')).toBe(true);
    for (const key of ['band', 'eiertid', 'p5', 'type'] as const) {
      $('colorBtn').click();
      document.querySelector<HTMLElement>(`#colorMenu .mode[data-k="${key}"]`)!.click();
      expect($('colorMenu').classList.contains('open')).toBe(false);
    }
    expect($('colorLabel').textContent).toBe('etter boligtype');
    expect($('legend').textContent).toContain('Boligtype');
  });
});

describe('drawer', () => {
  it('opens and closes through every control', () => {
    $('drawerBtn').click();
    expect(document.body.classList.contains('drawer-open')).toBe(true);
    $('drawerClose').click();
    expect(document.body.classList.contains('drawer-open')).toBe(false);
    $('drawerBtn').click();
    $('drawerApply').click();
    expect(document.body.classList.contains('drawer-open')).toBe(false);
    $('drawerBtn').click();
    $('overlay').click();
    expect(document.body.classList.contains('drawer-open')).toBe(false);
  });
  it('resets everything from the drawer footer', () => {
    input('fBraMin').value = '100';
    input('fBraMin').dispatchEvent(new Event('input'));
    input('fFav').checked = true;
    input('fFav').dispatchEvent(new Event('change'));
    $('drawerReset').click();
    expect(input('fBraMin').value).toBe('');
    expect(input('fFav').checked).toBe(false);
    expect(input('fP5Min').value).toBe('0');
    expect(shown()).toBe(houses.length);
  });
});

describe('splitter', () => {
  const pev = (type: string, clientX: number) =>
    new PointerEvent(type, { bubbles: true, pointerId: 1, clientX });

  it('resizes the table pane, clamps to 20–80% and persists', () => {
    const sp = $('splitter');
    sp.dispatchEvent(pev('pointerdown', 470));
    expect(sp.classList.contains('active')).toBe(true);
    sp.dispatchEvent(pev('pointermove', 300));
    sp.dispatchEvent(pev('pointermove', 310)); // second move before rAF fires
    expect($('tablewrap').style.flexBasis).toBe('31%');
    sp.dispatchEvent(pev('pointermove', 50));
    expect($('tablewrap').style.flexBasis).toBe('20%');
    sp.dispatchEvent(pev('pointermove', 990));
    expect($('tablewrap').style.flexBasis).toBe('80%');
    sp.dispatchEvent(pev('pointerup', 990));
    expect(sp.classList.contains('active')).toBe(false);
    expect(localStorage.getItem('tasen_split')).toBe('80%');
    // listeners removed: further moves change nothing
    sp.dispatchEvent(pev('pointermove', 400));
    expect($('tablewrap').style.flexBasis).toBe('80%');
  });

  it('restores the saved split on a fresh load', async () => {
    vi.resetModules();
    localStorage.setItem('tasen_split', '40%');
    mountDom();
    await import('./main');
    expect($('tablewrap').style.flexBasis).toBe('40%');
  });
});
