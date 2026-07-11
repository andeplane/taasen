import type L from 'leaflet';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { BAND_META, TYPE_META } from './color';
import { domains, houses } from './data';
import { initMap, popupHtml, type MapView } from './mapView';
import { makeHouse } from './test/factory';
import type { ColorMode, House } from './types';

let mv: MapView;
let colorMode: ColorMode = 'type';
let selectedId: number | null = null;
const onMarkerClick = vi.fn<(h: House) => void>();

function sizeElement(el: HTMLElement, width: number, height: number): void {
  Object.defineProperty(el, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
}

const rect = (x: number, y: number, w: number, h: number): DOMRect => ({
  x, y, width: w, height: h, top: y, left: x, right: x + w, bottom: y + h,
  toJSON: () => ({}),
});

beforeAll(() => {
  document.body.innerHTML = '<div id="main"><div id="map"></div><div id="legend"></div></div>';
  const mapEl = document.getElementById('map')!;
  sizeElement(mapEl, 800, 600);
  mv = initMap({
    getColorMode: () => colorMode,
    getSelectedId: () => selectedId,
    onMarkerClick,
  });
});

describe('initMap', () => {
  it('creates one marker per house', () => {
    expect(houses.every(h => h.marker != null)).toBe(true);
  });

  it('notifies on marker click', () => {
    houses[0].marker!.fire('click');
    expect(onMarkerClick).toHaveBeenCalledWith(houses[0]);
  });
});

describe('markerStyle', () => {
  it('uses the base style for unselected houses', () => {
    selectedId = null;
    const s = mv.markerStyle(houses[0]);
    expect(s.radius).toBe(5.2);
    expect(s.weight).toBe(1);
  });
  it('uses the selected style for the selected house', () => {
    selectedId = houses[0].id;
    const s = mv.markerStyle(houses[0]);
    expect(s.radius).toBe(8);
    expect(s.color).toBe('#ffffff');
    selectedId = null;
  });
});

describe('refreshColors', () => {
  it('recolors every marker for the active mode', () => {
    colorMode = 'band';
    mv.refreshColors();
    const h = houses[0];
    expect(h.marker!.options.fillColor).toBe(BAND_META[h.salgsband].dot);
    colorMode = 'type';
    mv.refreshColors();
    expect(h.marker!.options.fillColor).toBe(TYPE_META[h.boligtype]?.color ?? '#6b7688');
  });
});

describe('setVisibility', () => {
  it('hides non-matching markers and disables their pointer events', () => {
    mv.setVisibility(h => h.id === 0);
    expect(houses[0].marker!.options.opacity).toBe(1);
    expect(houses[1].marker!.options.opacity).toBe(0);
    const path = (houses[1].marker as unknown as { _path?: HTMLElement })._path;
    expect(path?.style.pointerEvents).toBe('none');
  });
  it('tolerates markers without a rendered path', () => {
    const h = houses[2];
    const saved = h.marker!;
    const setStyle = vi.fn<(opts: L.PathOptions) => L.CircleMarker>();
    h.marker = { setStyle, _path: undefined } as unknown as L.CircleMarker;
    expect(() => mv.setVisibility(() => true)).not.toThrow();
    expect(setStyle).toHaveBeenCalledOnce();
    h.marker = saved;
  });
});

describe('highlight', () => {
  it('applies the hover style and restores the mode style', () => {
    const h = houses[0];
    mv.highlight(h, true);
    expect(h.marker!.options.fillColor).toBe('#ff3b6b');
    expect(h.marker!.options.radius).toBe(11);
    mv.highlight(h, false);
    expect(h.marker!.options.radius).toBe(5.2);
    expect(h.marker!.options.fillColor).not.toBe('#ff3b6b');
  });
});

describe('renderLegend', () => {
  const legend = () => document.getElementById('legend')!;
  it('lists boligtyper in type mode', () => {
    colorMode = 'type';
    mv.renderLegend();
    expect(legend().textContent).toContain('Boligtype');
    expect(legend().querySelectorAll('.row').length).toBeGreaterThan(2);
  });
  it('lists the three bands in band mode', () => {
    colorMode = 'band';
    mv.renderLegend();
    expect(legend().textContent).toContain('Salgsutsikt 5 år');
    expect(legend().querySelectorAll('.row').length).toBe(3);
  });
  it('shows a gradient with year domain in eiertid mode', () => {
    colorMode = 'eiertid';
    mv.renderLegend();
    expect(legend().textContent).toContain('År siden tinglysing');
    expect(legend().querySelector('.grad')).not.toBeNull();
    expect(legend().textContent).toContain(`${Math.round(domains.eiertidMax)}+ år`);
  });
  it('shows a gradient with percent domain in p5 mode', () => {
    colorMode = 'p5';
    mv.renderLegend();
    expect(legend().textContent).toContain('Salgssannsynlighet 5 år');
    expect(legend().textContent).toContain(`${Math.round(domains.p5Max * 100)} %`);
    colorMode = 'type';
  });
});

describe('popup content', () => {
  it('renders all fields, the three external links and the favorite button', () => {
    const h = houses.find(x => x.bra_klasse != null && x.registrert_kjoper != null)!;
    h.fav = true;
    h.marker!.openPopup();
    const el = h.marker!.getPopup()!.getElement()!;
    expect(el.textContent).toContain(h.adresse);
    expect(el.textContent).toContain('Google Maps');
    expect(el.textContent).toContain('Street View');
    expect(el.textContent).toContain('Finn solgte eiendommer');
    const fav = el.querySelector<HTMLElement>('.popup-fav')!;
    expect(fav.textContent).toBe('★');
    expect(fav.title).toBe('Fjern fra favoritter');
    expect(el.querySelector<HTMLAnchorElement>('.links a.f')!.href).toContain('finn.no/map/realestate/sold');
    h.marker!.closePopup();
    h.fav = false;
  });

  it('renders dashes and the empty star for missing data', () => {
    const html = popupHtml(makeHouse({
      fav: false, bra_klasse: null, bra_min_m2: null, byggeaar: null, tomt_m2: null,
      eiertid_aar: null, estimat_min_mnok: null, estimat_maks_mnok: null,
      registrert_kjoper: null, kjoper_tvetydig: false,
    }));
    expect(html).toContain('☆');
    expect(html).toContain('Legg til som favoritt');
    expect(html).toContain('– m²');
    expect(html).toContain('– år');
    // bruksareal falls back from the missing class to the BRA floor text
    expect(html).toMatch(/Bruksareal<\/span><span class="v">–/);
  });

  it('prefers the bruksareal class text when present', () => {
    const html = popupHtml(makeHouse({ bra_klasse: 'over 150 m²' }));
    expect(html).toContain('over 150 m²');
  });

  it('links the registered buyer name to a Google search', () => {
    const html = popupHtml(makeHouse({ registrert_kjoper: 'Kari Nordmann' }));
    expect(html).toContain('<a href="https://www.google.com/search?q=Kari+Nordmann" target="_blank" rel="noopener">Kari Nordmann</a>');
  });

  it('splits co-buyers into separate Google search links', () => {
    const html = popupHtml(makeHouse({ registrert_kjoper: 'Ola Nordmann, Kari Nordmann' }));
    expect(html).toContain('<a href="https://www.google.com/search?q=Ola+Nordmann" target="_blank" rel="noopener">Ola Nordmann</a>');
    expect(html).toContain('<a href="https://www.google.com/search?q=Kari+Nordmann" target="_blank" rel="noopener">Kari Nordmann</a>');
  });
});

describe('popup fit (keeps popups inside the map)', () => {
  interface FakePopup { getElement(): HTMLElement | undefined; }
  const fire = (popup: FakePopup) => mv.map.fire('popupopen', { popup });

  function fakePopupEl(r: DOMRect, withContent: boolean): HTMLElement {
    const el = document.createElement('div');
    el.style.transform = 'translate3d(10px, 10px, 0px)';
    Object.defineProperty(el, 'getBoundingClientRect', { value: () => r, configurable: true });
    if (withContent) {
      const content = document.createElement('div');
      content.className = 'leaflet-popup-content';
      el.appendChild(content);
    }
    return el;
  }

  beforeAll(() => {
    Object.defineProperty(mv.map.getContainer(), 'getBoundingClientRect', {
      value: () => rect(0, 0, 800, 600),
      configurable: true,
    });
  });

  it('ignores popups without an element', () => {
    expect(() => fire({ getElement: () => undefined })).not.toThrow();
  });

  it('leaves fully visible popups untouched', () => {
    const el = fakePopupEl(rect(300, 200, 250, 300), true);
    fire({ getElement: () => el });
    expect(el.style.transform).toBe('translate3d(10px, 10px, 0px)');
  });

  it('caps the content height to the map height', () => {
    const el = fakePopupEl(rect(300, 200, 250, 300), true);
    fire({ getElement: () => el });
    expect(el.querySelector<HTMLElement>('.leaflet-popup-content')!.style.maxHeight).toBe('530px');
  });

  it('shifts popups overflowing the top-left corner into view', () => {
    const el = fakePopupEl(rect(-50, -40, 250, 300), false);
    fire({ getElement: () => el });
    expect(el.style.transform).toContain('translate(58px, 48px)');
  });

  it('shifts popups overflowing the bottom-right corner into view', () => {
    const el = fakePopupEl(rect(700, 400, 250, 300), true);
    fire({ getElement: () => el });
    expect(el.style.transform).toContain('translate(-158px, -108px)');
  });

  it('re-fits when the map settles after a pan', () => {
    const el = fakePopupEl(rect(-20, 100, 250, 300), true);
    fire({ getElement: () => el });
    const afterOpen = el.style.transform;
    mv.map.fire('moveend');
    // jsdom rects are static, so the moveend pass appends the same correction again
    expect(el.style.transform.length).toBeGreaterThan(afterOpen.length);
  });
});
