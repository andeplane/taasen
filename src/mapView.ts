import L from 'leaflet';
import { bandMeta, colorFor, SEQ_STOPS, typeMeta } from './color';
import { boligtyper, computeDomains, domains as fullDomains, houses } from './data';
import { braText, buyerText, escapeHtml, estimatText, formatDate } from './format';
import { finnSoldUrl, googleMapsUrl, streetViewUrl } from './links';
import type { ColorMode, House } from './types';

const BASE_STYLE: L.CircleMarkerOptions = { radius: 5.2, color: 'rgba(255,255,255,.55)', weight: 1, fillOpacity: .95 };
const SEL_STYLE: L.CircleMarkerOptions = { radius: 8, color: '#ffffff', weight: 2.2, fillOpacity: .95 };
const HOVER_STYLE: L.CircleMarkerOptions = { radius: 11, color: '#ffffff', weight: 3, fillColor: '#ff3b6b' };

export interface MapView {
  map: L.Map;
  markerStyle(h: House): L.CircleMarkerOptions;
  refreshColors(): void;
  setVisibility(pred: (h: House) => boolean): void;
  highlight(h: House, on: boolean): void;
  renderLegend(): void;
}

interface MapViewOptions {
  getColorMode(): ColorMode;
  getSelectedId(): number | null;
  onMarkerClick(h: House): void;
}

const favButton = (h: House): string => {
  const label = h.fav ? 'Fjern fra favoritter' : 'Legg til som favoritt';
  return `<button type="button" class="favlink popup-fav" data-adr="${escapeHtml(h.adresse)}"
    aria-label="${label}" title="${label}">${h.fav ? '★' : '☆'}</button>`;
};

export function popupHtml(h: House): string {
  const b = bandMeta(h.salgsband);
  const t = typeMeta(h.boligtype);
  const kv = (k: string, v: string | number) =>
    `<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  return `<div class="pp">
    <div class="type"><i style="background:${t.color};box-shadow:0 0 8px ${t.color}"></i>${escapeHtml(h.boligtype)}</div>
    <div class="adr"><span>${escapeHtml(h.adresse)}</span>${favButton(h)}</div>
    <div class="band"><span class="bandpill" style="color:${b.color};background:${b.bg}">Salgsutsikt ${escapeHtml(h.salgsband)} · ${(h.p5 * 100).toFixed(1)}%</span></div>
    ${kv('Verdiestimat', estimatText(h))}
    ${kv('Bruksareal', escapeHtml(h.bra_klasse ?? braText(h.bra_min_m2)))}
    ${kv('Byggeår', h.byggeaar ?? '–')}
    ${kv('Tomt', `${h.tomt_m2 ?? '–'} m²`)}
    ${kv('Matrikkel', escapeHtml(h.gnrbnr))}
    ${kv('Enheter', h.enheter)}
    ${kv('Tinglyst', formatDate(h.tinglysingsdato))}
    ${kv('Eiertid', `${h.eiertid_aar ?? '–'} år`)}
    ${kv('Registrert kjøper', escapeHtml(buyerText(h)))}
    <div class="links"><a class="g" href="${googleMapsUrl(h)}" target="_blank" rel="noopener">Google Maps ↗</a><a class="s" href="${streetViewUrl(h)}" target="_blank" rel="noopener">Street View</a><a class="s f" href="${finnSoldUrl(h)}" target="_blank" rel="noopener">Finn solgte eiendommer ↗</a></div>
  </div>`;
}

export function initMap(opts: MapViewOptions): MapView {
  // color scale domain, scoped to the currently visible (filtered) houses only
  let domains = fullDomains;
  const map = L.map('map', { preferCanvas: false }).setView([59.9536, 10.7565], 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    { maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(map);

  const markerStyle = (h: House): L.CircleMarkerOptions => ({
    ...(h.id === opts.getSelectedId() ? SEL_STYLE : BASE_STYLE),
    fillColor: colorFor(h, opts.getColorMode(), domains),
  });

  houses.forEach(h => {
    // autoPan off: the popup is repositioned into view instead of scrolling the map
    const m = L.circleMarker([h.lat, h.lon], markerStyle(h))
      .bindPopup(() => popupHtml(h), { autoPan: false });
    m.on('click', () => opts.onMarkerClick(h));
    m.addTo(map);
    h.marker = m;
  });
  map.fitBounds(L.latLngBounds(houses.map(h => [h.lat, h.lon])), { padding: [20, 20] });

  // Keep popups fully inside the map container by translating them, never by panning the map.
  map.on('popupopen', e => {
    const el = e.popup.getElement();
    const mapEl = map.getContainer();
    if (!el) return;
    const pad = 8;
    const fit = () => {
      const mr = mapEl.getBoundingClientRect();
      // the CSS max-height is viewport-relative; the real constraint is the map pane
      const content = el.querySelector<HTMLElement>('.leaflet-popup-content');
      if (content) content.style.maxHeight = `${mapEl.clientHeight - 70}px`;
      const pr = el.getBoundingClientRect();
      let dx = 0, dy = 0;
      if (pr.left < mr.left + pad) dx = mr.left + pad - pr.left;
      else if (pr.right > mr.right - pad) dx = mr.right - pad - pr.right;
      if (pr.top < mr.top + pad) dy = mr.top + pad - pr.top;
      else if (pr.bottom > mr.bottom - pad) dy = mr.bottom - pad - pr.bottom;
      if (dx || dy) el.style.transform += ` translate(${dx}px, ${dy}px)`;
    };
    fit();
    // late passes: Leaflet may re-position the popup (double open, content/layout settling)
    requestAnimationFrame(fit);
    setTimeout(fit, 80);
    setTimeout(fit, 300);
    // if the popup opened mid-pan (row click), measure again once the map settles
    map.once('moveend', fit);
  });

  const refreshColors = () =>
    houses.forEach(h => h.marker!.setStyle({ fillColor: colorFor(h, opts.getColorMode(), domains) }));

  const setVisibility = (pred: (h: House) => boolean) => {
    const visible = houses.filter(pred);
    domains = visible.length ? computeDomains(visible) : fullDomains;
    houses.forEach(h => {
      const ok = pred(h);
      h.marker!.setStyle({
        opacity: ok ? 1 : 0, fillOpacity: ok ? .95 : 0,
        fillColor: colorFor(h, opts.getColorMode(), domains),
      });
      const path = (h.marker as unknown as { _path?: HTMLElement })._path;
      if (path) path.style.pointerEvents = ok ? '' : 'none';
    });
  };

  const highlight = (h: House, on: boolean) => {
    if (on) {
      h.marker!.setStyle({ ...HOVER_STYLE });
      h.marker!.bringToFront();
    } else {
      h.marker!.setStyle(markerStyle(h));
    }
  };

  const renderLegend = () => {
    const el = document.getElementById('legend')!;
    const mode = opts.getColorMode();
    if (mode === 'eiertid' || mode === 'p5') {
      const title = mode === 'eiertid' ? 'År siden tinglysing' : 'Salgssannsynlighet 5 år';
      const lo = mode === 'eiertid' ? '0 år' : `${Math.round(domains.p5Min * 100)} %`;
      const hi = mode === 'eiertid' ? `${Math.round(domains.eiertidMax)}+ år` : `${Math.round(domains.p5Max * 100)} %`;
      el.innerHTML = `<div class="title">${title}</div>
        <div class="grad" style="background:linear-gradient(90deg,${SEQ_STOPS.join(',')})"></div>
        <div class="ends"><span>${lo}</span><span>${hi}</span></div>`;
      return;
    }
    const entries: [string, string][] = mode === 'band'
      ? (['Lav', 'Middels', 'Høyere'] as const).map(k => [k, bandMeta(k).dot])
      : boligtyper.map(k => [k, typeMeta(k).color]);
    el.innerHTML = `<div class="title">${mode === 'band' ? 'Salgsutsikt 5 år' : 'Boligtype'}</div>`
      + entries.map(([k, c]) => `<div class="row"><i style="background:${c}"></i>${escapeHtml(k)}</div>`).join('');
  };

  return { map, markerStyle, refreshColors, setVisibility, highlight, renderLegend };
}
