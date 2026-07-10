import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLUMNS, initTable, type TableCallbacks, type TableView } from './table';
import { makeHouse } from './test/factory';
import type { House } from './types';

const HOUSES: House[] = [
  makeHouse({ id: 0, adresse: 'Aveien 1', boligtype: 'Enebolig', byggeaar: 1950, p5: 0.2, bra_min_m2: 100, registrert_kjoper: 'Åse' }),
  makeHouse({ id: 1, adresse: 'Bveien 2', boligtype: 'Tomannsbolig', byggeaar: null, p5: 0.9, bra_min_m2: null, registrert_kjoper: 'Bjørn', fav: true, salgsband: 'Høyere' }),
  makeHouse({ id: 2, adresse: 'Cveien 3', boligtype: 'Ukjent/annet', byggeaar: 1980, p5: 0.5, bra_min_m2: 0, registrert_kjoper: null, salgsband: 'Middels' }),
];

interface Mounted {
  view: TableView;
  cb: {
    onSelect: ReturnType<typeof vi.fn<TableCallbacks['onSelect']>>;
    onToggleFav: ReturnType<typeof vi.fn<TableCallbacks['onToggleFav']>>;
    onHover: ReturnType<typeof vi.fn<TableCallbacks['onHover']>>;
    onSortChange: ReturnType<typeof vi.fn<TableCallbacks['onSortChange']>>;
  };
}

function mount(): Mounted {
  document.body.innerHTML = `
    <table><thead><tr id="thead"></tr></thead><tbody id="tbody"></tbody></table>
    <div id="noresults" style="display:none"></div>`;
  const cb = {
    onSelect: vi.fn<TableCallbacks['onSelect']>(),
    onToggleFav: vi.fn<TableCallbacks['onToggleFav']>(),
    onHover: vi.fn<TableCallbacks['onHover']>(),
    onSortChange: vi.fn<TableCallbacks['onSortChange']>(),
  };
  const view = initTable(id => HOUSES[id], cb);
  return { view, cb };
}

const headers = () => [...document.querySelectorAll<HTMLElement>('#thead th')];
const rows = () => [...document.querySelectorAll<HTMLElement>('#tbody tr')];

describe('initTable', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders a header per column with default sort on utsikt desc', () => {
    const { view } = mount();
    expect(headers().length).toBe(COLUMNS.length);
    expect(view.sortKey).toBe('utsikt');
    expect(view.sortDir).toBe('desc');
    const sorted = headers().find(th => th.classList.contains('sorted'))!;
    expect(sorted.dataset.k).toBe('utsikt');
    expect(sorted.querySelector('.arrow')!.textContent).toBe('↓');
  });

  it('sorts numerically respecting direction', () => {
    const { view } = mount();
    expect(view.sort(HOUSES).map(h => h.id)).toEqual([1, 2, 0]); // p5 desc
    view.sortDir = 'asc';
    expect(view.sort(HOUSES).map(h => h.id)).toEqual([0, 2, 1]);
  });

  it('sorts strings with the Norwegian collator', () => {
    const { view } = mount();
    view.sortKey = 'kjoper';
    view.sortDir = 'asc';
    // Bjørn < Åse in nb; null buyer sorts last
    expect(view.sort(HOUSES).map(h => h.id)).toEqual([1, 0, 2]);
  });

  it('keeps unknown values last in both directions', () => {
    const { view } = mount();
    view.sortKey = 'byggeaar';
    view.sortDir = 'asc';
    expect(view.sort(HOUSES).map(h => h.id)).toEqual([0, 2, 1]);
    view.sortDir = 'desc';
    expect(view.sort(HOUSES).map(h => h.id)).toEqual([2, 0, 1]);
  });

  it('has a working sort accessor for every column', () => {
    const { view } = mount();
    for (const c of COLUMNS) {
      view.sortKey = c.key;
      view.sortDir = 'asc';
      expect(() => view.sort(HOUSES)).not.toThrow();
    }
  });

  it('treats two unknowns as equal', () => {
    const { view } = mount();
    view.sortKey = 'byggeaar';
    const two = [HOUSES[1], makeHouse({ id: 9, byggeaar: null })];
    expect(view.sort(two).map(h => h.id)).toEqual([1, 9]);
  });

  it('toggles direction when clicking the active column', () => {
    const { view, cb } = mount();
    headers().find(th => th.dataset.k === 'utsikt')!.click();
    expect(view.sortDir).toBe('asc');
    expect(cb.onSortChange).toHaveBeenCalledTimes(1);
    headers().find(th => th.dataset.k === 'utsikt')!.click();
    expect(view.sortDir).toBe('desc');
  });

  it('starts string columns asc and numeric columns desc', () => {
    const { view } = mount();
    headers().find(th => th.dataset.k === 'adresse')!.click();
    expect(view.sortKey).toBe('adresse');
    expect(view.sortDir).toBe('asc');
    headers().find(th => th.dataset.k === 'tomt')!.click();
    expect(view.sortKey).toBe('tomt');
    expect(view.sortDir).toBe('desc');
  });

  it('renders rows with formatted cells and selection', () => {
    const { view } = mount();
    view.render(HOUSES, 1);
    expect(rows().length).toBe(3);
    const sel = document.querySelector<HTMLElement>('#tbody tr.sel')!;
    expect(sel.dataset.id).toBe('1');
    expect(sel.querySelector('.favstar')!.classList.contains('on')).toBe(true);
    expect(sel.querySelector('.favstar')!.textContent).toBe('★');
    const first = rows()[0];
    expect(first.querySelector('.favstar')!.textContent).toBe('☆');
    expect(document.getElementById('noresults')!.style.display).toBe('none');
  });

  it('renders a dash for missing tomt', () => {
    const { view } = mount();
    view.render([makeHouse({ id: 0, tomt_m2: null })], null);
    expect(rows()[0].querySelector('td:nth-child(7)')!.textContent).toBe('–');
  });

  it('shows the empty state for no rows', () => {
    const { view } = mount();
    view.render([], null);
    expect(rows().length).toBe(0);
    expect(document.getElementById('noresults')!.style.display).toBe('block');
  });

  it('selects on row click and toggles favorite on star click', () => {
    const { view, cb } = mount();
    view.render(HOUSES, null);
    rows()[1].querySelector<HTMLElement>('td.adr')!.click();
    expect(cb.onSelect).toHaveBeenCalledWith(HOUSES[1]);
    rows()[0].querySelector<HTMLElement>('.fav-cell')!.click();
    expect(cb.onToggleFav).toHaveBeenCalledWith(HOUSES[0]);
    expect(cb.onSelect).toHaveBeenCalledTimes(1);
  });

  it('ignores clicks outside any row', () => {
    const { view, cb } = mount();
    view.render(HOUSES, null);
    document.getElementById('tbody')!.click();
    expect(cb.onSelect).not.toHaveBeenCalled();
  });

  it('reports hover transitions between rows and on leave', () => {
    const { view, cb } = mount();
    view.render(HOUSES, null);
    const over = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    over(rows()[0]);
    expect(cb.onHover).toHaveBeenLastCalledWith(HOUSES[0], true);
    over(rows()[0]); // same row: no extra calls
    expect(cb.onHover).toHaveBeenCalledTimes(1);
    over(rows()[2]);
    expect(cb.onHover.mock.calls.slice(1)).toEqual([[HOUSES[0], false], [HOUSES[2], true]]);
    document.getElementById('tbody')!.dispatchEvent(new MouseEvent('mouseleave'));
    expect(cb.onHover).toHaveBeenLastCalledWith(HOUSES[2], false);
    // leaving again without a hovered row is a no-op
    document.getElementById('tbody')!.dispatchEvent(new MouseEvent('mouseleave'));
    expect(cb.onHover).toHaveBeenCalledTimes(4);
  });

  it('ignores mouseover outside any row', () => {
    const { view, cb } = mount();
    view.render(HOUSES, null);
    document.getElementById('tbody')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(cb.onHover).not.toHaveBeenCalled();
  });
});
