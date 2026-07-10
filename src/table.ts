import { bandMeta, typeMeta } from './color';
import { braText, buyerText, escapeHtml, estimatText, formatDate } from './format';
import type { House, SortDir } from './types';

type SortValue = string | number | null;
interface Column {
  key: string;
  label: string;
  cls: '' | 'r' | 'c';
  sort(h: House): SortValue;
  str?: boolean;
}

export const COLUMNS: Column[] = [
  { key: 'fav', label: '★', cls: 'c', sort: h => h.fav ? 1 : 0 },
  { key: 'adresse', label: 'Adresse', cls: '', sort: h => h.adresse, str: true },
  { key: 'type', label: 'Type', cls: '', sort: h => h.boligtype, str: true },
  { key: 'bra', label: 'BRA', cls: 'r', sort: h => h.bra_min_m2 },
  { key: 'byggeaar', label: 'Byggeår', cls: 'r', sort: h => h.byggeaar },
  { key: 'estimat', label: 'Estimat', cls: 'r', sort: h => h.estimat_min_mnok },
  { key: 'tomt', label: 'Tomt m²', cls: 'r', sort: h => h.tomt_m2 },
  { key: 'matrikkel', label: 'Matrikkel', cls: 'r', sort: h => h.gnrbnr, str: true },
  { key: 'tinglyst', label: 'Tinglyst', cls: 'r', sort: h => h.tinglysingsdato, str: true },
  { key: 'utsikt', label: 'Utsikt', cls: '', sort: h => h.p5 },
  { key: 'kjoper', label: 'Registrert kjøper', cls: '', sort: h => h.registrert_kjoper, str: true },
];

export interface TableCallbacks {
  onSelect(h: House): void;
  onToggleFav(h: House): void;
  onHover(h: House, on: boolean): void;
  onSortChange(): void;
}

export interface TableView {
  render(list: House[], selectedId: number | null): void;
  sortKey: string;
  sortDir: SortDir;
  sort(list: House[]): House[];
}

function rowHtml(h: House, selectedId: number | null): string {
  const t = typeMeta(h.boligtype);
  const b = bandMeta(h.salgsband);
  return `<tr data-id="${h.id}"${h.id === selectedId ? ' class="sel"' : ''}>
    <td class="c fav-cell"><span class="favstar${h.fav ? ' on' : ''}">${h.fav ? '★' : '☆'}</span></td>
    <td class="adr">${escapeHtml(h.adresse)}</td>
    <td><span class="typecell"><i style="background:${t.color}"></i>${escapeHtml(t.short)}</span></td>
    <td class="r num">${braText(h.bra_min_m2)}</td>
    <td class="r num">${h.byggeaar ?? '–'}</td>
    <td class="r est">${estimatText(h)}</td>
    <td class="r num">${h.tomt_m2 ?? '–'}</td>
    <td class="r mat">${escapeHtml(h.gnrbnr)}</td>
    <td class="r num">${formatDate(h.tinglysingsdato)}</td>
    <td><span class="bandpill" style="color:${b.color};background:${b.bg}">${escapeHtml(h.salgsband)} <span class="pct">${(h.p5 * 100).toFixed(0)}%</span></span></td>
    <td class="kj">${escapeHtml(buyerText(h))}</td>
  </tr>`;
}

export function initTable(getHouse: (id: number) => House, cb: TableCallbacks): TableView {
  const thead = document.getElementById('thead')!;
  const tbody = document.getElementById('tbody')!;
  const noresults = document.getElementById('noresults')!;

  const view: TableView = {
    sortKey: 'utsikt',
    sortDir: 'desc',
    sort(list) {
      const col = COLUMNS.find(c => c.key === view.sortKey)!;
      return [...list].sort((a, b) => {
        const x = col.sort(a), y = col.sort(b);
        if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1; // unknowns last
        const cmp = col.str ? String(x).localeCompare(String(y), 'nb') : (x as number) - (y as number);
        return view.sortDir === 'asc' ? cmp : -cmp;
      });
    },
    render(list, selectedId) {
      tbody.innerHTML = list.map(h => rowHtml(h, selectedId)).join('');
      noresults.style.display = list.length ? 'none' : 'block';
    },
  };

  function renderHead(): void {
    thead.innerHTML = COLUMNS.map(c =>
      `<th class="${c.cls}${c.key === view.sortKey ? ' sorted' : ''}" data-k="${c.key}">${c.label}<span class="arrow">${c.key === view.sortKey ? (view.sortDir === 'asc' ? '↑' : '↓') : ''}</span></th>`).join('');
    thead.querySelectorAll<HTMLElement>('th').forEach(th => th.onclick = () => {
      const k = th.dataset.k!;
      if (view.sortKey === k) view.sortDir = view.sortDir === 'asc' ? 'desc' : 'asc';
      else {
        view.sortKey = k;
        view.sortDir = COLUMNS.find(c => c.key === k)!.str ? 'asc' : 'desc';
      }
      renderHead();
      cb.onSortChange();
    });
  }
  renderHead();

  tbody.addEventListener('click', e => {
    const tr = (e.target as HTMLElement).closest('tr');
    if (!tr) return;
    const h = getHouse(+tr.dataset.id!);
    if ((e.target as HTMLElement).closest('.fav-cell')) { cb.onToggleFav(h); return; }
    cb.onSelect(h);
  });

  let hovered: House | null = null;
  tbody.addEventListener('mouseover', e => {
    const tr = (e.target as HTMLElement).closest('tr');
    if (!tr) return;
    const h = getHouse(+tr.dataset.id!);
    if (hovered === h) return;
    if (hovered) cb.onHover(hovered, false);
    hovered = h;
    cb.onHover(h, true);
  });
  tbody.addEventListener('mouseleave', () => {
    if (hovered) { cb.onHover(hovered, false); hovered = null; }
  });

  return view;
}
