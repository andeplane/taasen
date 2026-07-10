import 'leaflet/dist/leaflet.css';
import './style.css';
import { bandMeta, typeMeta } from './color';
import { boligtyper, houses, streetCount, streets, summaryStats } from './data';
import { initFavorites, toggleFavorite } from './favorites';
import { escapeHtml, formatDate } from './format';
import { initMap } from './mapView';
import { installPopoverDismiss, popSelect } from './popSelect';
import { initTable } from './table';
import type { ColorMode, House, Salgsband } from './types';

const $ = (id: string) => document.getElementById(id)!;
const input = (id: string) => $(id) as HTMLInputElement;

// ---- state ----
let colorBy: ColorMode = 'type';
let selectedId: number | null = null;

initFavorites();

// ---- header ----
$('streetCount').textContent = String(streetCount);
$('total').textContent = String(houses.length);
$('stats').innerHTML = summaryStats().map(s =>
  `<div class="stat">${s.wide ? `<span class="mix">${escapeHtml(s.value)}</span>` : `<b>${escapeHtml(s.value)}</b>`}<span>${s.label}</span></div>`).join('');

// ---- map & table ----
const mapView = initMap({
  getColorMode: () => colorBy,
  getSelectedId: () => selectedId,
  onMarkerClick: h => selectRow(h, false),
});
mapView.renderLegend();

const table = initTable(id => houses[id], {
  onSelect: h => selectRow(h, true),
  onToggleFav: h => doToggleFav(h.adresse),
  onHover: (h, on) => mapView.highlight(h, on),
  onSortChange: () => apply(),
});

function selectRow(h: House, pan: boolean): void {
  const prev = selectedId != null ? houses[selectedId] : null;
  selectedId = h.id;
  if (prev) prev.marker!.setStyle(mapView.markerStyle(prev));
  h.marker!.setStyle(mapView.markerStyle(h));
  h.marker!.bringToFront();
  document.querySelectorAll('#tbody tr.sel').forEach(t => t.classList.remove('sel'));
  const tr = document.querySelector(`#tbody tr[data-id="${h.id}"]`);
  if (tr) { tr.classList.add('sel'); tr.scrollIntoView({ block: 'nearest' }); }
  if (pan) {
    // marker clicks open the popup natively; only table selection opens it explicitly
    mapView.map.setView([h.lat, h.lon], Math.max(mapView.map.getZoom(), 16), { animate: true });
    setTimeout(() => h.marker!.openPopup(), 260);
  }
}

// ---- favorites ----
function doToggleFav(adresse: string): void {
  toggleFavorite(adresse);
  apply();
}
document.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.favlink');
  if (!btn) return;
  e.preventDefault();
  const h = toggleFavorite(btn.dataset.adr!);
  if (!h) return;
  const label = h.fav ? 'Fjern fra favoritter' : 'Legg til som favoritt';
  btn.textContent = h.fav ? '★' : '☆';
  btn.setAttribute('aria-label', label);
  btn.title = label;
  apply();
});

// ---- filter popovers ----
const msStreet = popSelect('msStreet', 'Gate', streets, () => apply());
const msType = popSelect('msType', 'Boligtype', boligtyper, () => apply(), v => typeMeta(v).color);
const msBand = popSelect('msBand', 'Salgsutsikt', ['Lav', 'Middels', 'Høyere'], () => apply(),
  v => bandMeta(v as Salgsband).dot);
installPopoverDismiss();

// ---- color mode menu ----
const COLOR_MODES: { key: ColorMode; label: string }[] = [
  { key: 'type', label: 'etter boligtype' },
  { key: 'band', label: 'etter salgsutsikt' },
  { key: 'eiertid', label: 'etter år siden tinglysing' },
  { key: 'p5', label: 'etter salgssannsynlighet 5 år' },
];
const colorMenu = $('colorMenu');
function renderColorMenu(): void {
  colorMenu.innerHTML = COLOR_MODES.map(m =>
    `<button class="mode${m.key === colorBy ? ' active' : ''}" data-k="${m.key}">
      <span class="tick">${m.key === colorBy ? '✓' : ''}</span><span>${m.label}</span></button>`).join('');
  colorMenu.querySelectorAll<HTMLElement>('.mode').forEach(b => b.onclick = () => {
    colorBy = b.dataset.k as ColorMode;
    $('colorLabel').textContent = COLOR_MODES.find(m => m.key === colorBy)!.label;
    renderColorMenu();
    colorMenu.classList.remove('open');
    mapView.refreshColors();
    mapView.renderLegend();
  });
}
renderColorMenu();
$('colorBtn').onclick = () => {
  document.querySelectorAll('.pop.open').forEach(p => { if (p !== colorMenu) p.classList.remove('open'); });
  colorMenu.classList.toggle('open');
};

// ---- filtering ----
const FILTER_IDS = ['q', 'fBraMin', 'fBraMax', 'fPlotMin', 'fPlotMax', 'fYearMin', 'fYearMax',
  'fTinglystFrom', 'fTinglystTo', 'fOwnMin', 'fOwnMax', 'fEstMin', 'fEstMax',
  'fUnitMin', 'fUnitMax', 'fP5Min', 'fFav'];
const num = (id: string): number | null => {
  const v = input(id).value.trim();
  return v === '' ? null : +v;
};
// Range check: no bounds → pass; bounds set but value unknown → fail (filter means "known value in range").
const inRange = (v: number | null, min: number | null, max: number | null): boolean =>
  (min == null && max == null) ? true
    : v != null && (min == null || v >= min) && (max == null || v <= max);

function apply(): void {
  const q = input('q').value.toLowerCase().trim();
  const braMin = num('fBraMin'), braMax = num('fBraMax'), plotMin = num('fPlotMin'), plotMax = num('fPlotMax');
  const yrMin = num('fYearMin'), yrMax = num('fYearMax'), ownMin = num('fOwnMin'), ownMax = num('fOwnMax');
  const estMin = num('fEstMin'), estMax = num('fEstMax'), unitMin = num('fUnitMin'), unitMax = num('fUnitMax');
  const p5Min = +input('fP5Min').value || 0;
  const tFrom = input('fTinglystFrom').value || null, tTo = input('fTinglystTo').value || null;
  const favOnly = input('fFav').checked;
  $('p5Val').textContent = `${p5Min} %`;

  const matches = (h: House): boolean =>
    (!favOnly || h.fav)
    && msStreet.pass(h.gate) && msType.pass(h.boligtype) && msBand.pass(h.salgsband)
    && inRange(h.bra_min_m2, braMin, braMax)
    && inRange(h.tomt_m2, plotMin, plotMax)
    && inRange(h.byggeaar, yrMin, yrMax)
    && inRange(h.eiertid_aar, ownMin, ownMax)
    && inRange(h.enheter, unitMin, unitMax)
    && (!p5Min || h.p5 * 100 >= p5Min)
    // estimate is itself a range; match if it overlaps the requested range
    && ((estMin == null && estMax == null) || (h.estimat_min_mnok != null
      && (estMin == null || h.estimat_maks_mnok! >= estMin) && (estMax == null || h.estimat_min_mnok <= estMax)))
    // ISO dates compare correctly as strings
    && ((!tFrom && !tTo) || (h.tinglysingsdato != null
      && (!tFrom || h.tinglysingsdato >= tFrom) && (!tTo || h.tinglysingsdato <= tTo)))
    && (!q || h.adresse.toLowerCase().includes(q)
      || (h.registrert_kjoper ?? '').toLowerCase().includes(q) || h.gnrbnr.includes(q));

  const list = table.sort(houses.filter(matches));
  mapView.setVisibility(matches);
  mapView.renderLegend();
  table.render(list, selectedId);
  $('shown').textContent = String(list.length);

  // chips
  const chips: [string, () => void][] = [];
  if (q) chips.push([`Søk: "${q}"`, () => { input('q').value = ''; }]);
  if (!msStreet.isAll()) chips.push([`Gate: ${msStreet.count()} valgt`, () => msStreet.reset()]);
  if (!msType.isAll()) chips.push([`Boligtype: ${msType.count()} valgt`, () => msType.reset()]);
  if (!msBand.isAll()) chips.push([`Salgsutsikt: ${msBand.count()} valgt`, () => msBand.reset()]);
  const rangeChip = (label: string, lo: number | string | null, hi: number | string | null,
    ids: string[], fmt: (v: string | number) => string = String) => {
    if (lo == null && hi == null) return;
    chips.push([`${label}: ${lo != null ? fmt(lo) : ''}–${hi != null ? fmt(hi) : ''}`,
      () => ids.forEach(id => { input(id).value = ''; })]);
  };
  rangeChip('BRA', braMin, braMax, ['fBraMin', 'fBraMax']);
  rangeChip('Tomt', plotMin, plotMax, ['fPlotMin', 'fPlotMax']);
  rangeChip('Byggeår', yrMin, yrMax, ['fYearMin', 'fYearMax']);
  rangeChip('Tinglyst', tFrom, tTo, ['fTinglystFrom', 'fTinglystTo'], v => formatDate(String(v)));
  rangeChip('Eiertid', ownMin, ownMax, ['fOwnMin', 'fOwnMax']);
  rangeChip('Estimat', estMin, estMax, ['fEstMin', 'fEstMax']);
  rangeChip('Enheter', unitMin, unitMax, ['fUnitMin', 'fUnitMax']);
  if (p5Min) chips.push([`Min. salgsutsikt: ${p5Min} %`, () => { input('fP5Min').value = '0'; }]);
  if (favOnly) chips.push(['Kun favoritter ★', () => { input('fFav').checked = false; updateFavBtn(); }]);

  const chipEl = $('chips');
  chipEl.classList.toggle('show', chips.length > 0);
  chipEl.innerHTML = chips.length
    ? '<span class="lbl">Aktive filtre</span>' + chips.map((c, i) =>
      `<span class="chip">${escapeHtml(c[0])}<button data-i="${i}">×</button></span>`).join('')
    : '';
  chipEl.querySelectorAll<HTMLElement>('button').forEach(b => b.onclick = () => {
    chips[+b.dataset.i!][1]();
    apply();
  });
  const fc = $('filterCount');
  fc.style.display = chips.length ? '' : 'none';
  fc.textContent = String(chips.length);
}

FILTER_IDS.forEach(id => {
  const el = $(id);
  el.addEventListener('input', apply);
  el.addEventListener('change', apply);
});

// ---- favorites toolbar toggle ----
function updateFavBtn(): void {
  const on = input('fFav').checked;
  $('favBtn').classList.toggle('on', on);
  $('favStarIcon').style.color = on ? 'var(--gold)' : '#5a6672';
}
$('favBtn').onclick = () => {
  input('fFav').checked = !input('fFav').checked;
  updateFavBtn();
  apply();
};
$('fFav').addEventListener('change', updateFavBtn);

// ---- reset ----
function resetAll(): void {
  FILTER_IDS.forEach(id => {
    const el = input(id);
    if (el.type === 'checkbox') el.checked = false;
    else el.value = '';
  });
  input('fP5Min').value = '0';
  [msStreet, msType, msBand].forEach(ms => ms.reset());
  updateFavBtn();
  apply();
}
$('reset').onclick = resetAll;
$('drawerReset').onclick = resetAll;

// ---- drawer ----
$('drawerBtn').onclick = () => document.body.classList.add('drawer-open');
const closeDrawer = () => document.body.classList.remove('drawer-open');
$('drawerClose').onclick = closeDrawer;
$('drawerApply').onclick = closeDrawer;
$('overlay').onclick = closeDrawer;

// ---- resizable split between table and map ----
const SPLIT_KEY = 'tasen_split';
const tablewrap = $('tablewrap');
{
  const saved = localStorage.getItem(SPLIT_KEY);
  if (saved) tablewrap.style.flexBasis = saved;
}
$('splitter').addEventListener('pointerdown', e => {
  e.preventDefault();
  const splitter = e.currentTarget as HTMLElement;
  splitter.setPointerCapture(e.pointerId);
  splitter.classList.add('active');
  let raf = 0;
  const onMove = (ev: PointerEvent) => {
    const rect = $('main').getBoundingClientRect();
    const pct = Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100));
    tablewrap.style.flexBasis = `${pct}%`;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; mapView.map.invalidateSize(); });
  };
  const onUp = () => {
    splitter.classList.remove('active');
    splitter.removeEventListener('pointermove', onMove);
    splitter.removeEventListener('pointerup', onUp);
    localStorage.setItem(SPLIT_KEY, tablewrap.style.flexBasis);
    mapView.map.invalidateSize();
  };
  splitter.addEventListener('pointermove', onMove);
  splitter.addEventListener('pointerup', onUp);
});

apply();
