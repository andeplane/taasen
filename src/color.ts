import type { ColorMode, House, Salgsband } from './types';

export interface TypeMeta { short: string; color: string; }
export const TYPE_META: Record<string, TypeMeta> = {
  'Enebolig':        { short: 'Enebolig',     color: '#3d8bfd' },
  'Tomannsbolig':    { short: 'Tomannsbolig', color: '#2fb8a0' },
  'Rekkehus/småhus': { short: 'Rekkehus',     color: '#e0a03a' },
  'Leilighetsbygg':  { short: 'Leilighet',    color: '#b06bd6' },
  'Annet bolig':     { short: 'Annet bolig',  color: '#8fa1b5' },
  'Ukjent/annet':    { short: 'Annet',        color: '#6b7688' },
};
export const typeMeta = (t: string): TypeMeta => TYPE_META[t] ?? { short: t, color: '#6b7688' };

export interface BandMeta { color: string; bg: string; dot: string; }
export const BAND_META: Record<Salgsband, BandMeta> = {
  'Lav':     { color: '#7fd6c6', bg: 'rgba(47,184,160,.13)', dot: '#2fb8a0' },
  'Middels': { color: '#e6bf7a', bg: 'rgba(224,160,58,.13)', dot: '#e0a03a' },
  'Høyere':  { color: '#f0a08e', bg: 'rgba(224,112,90,.14)', dot: '#e0705a' },
};
export const bandMeta = (b: Salgsband): BandMeta =>
  BAND_META[b] ?? { color: '#c2ccd9', bg: 'rgba(255,255,255,.08)', dot: '#888' };

// Viridis (matplotlib), dark purple = low → yellow = high; perceptually uniform and CVD-safe
export const SEQ_STOPS = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e',
  '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'];

const hex2rgb = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export function seqColor(t: number): string {
  t = Math.max(0, Math.min(1, t));
  const x = t * (SEQ_STOPS.length - 1);
  const i = Math.min(Math.floor(x), SEQ_STOPS.length - 2);
  const f = x - i;
  const a = hex2rgb(SEQ_STOPS[i]), b = hex2rgb(SEQ_STOPS[i + 1]);
  return '#' + a.map((v, j) => Math.round(v + (b[j] - v) * f).toString(16).padStart(2, '0')).join('');
}

const UNKNOWN = '#8b98a5';
export interface ColorDomains { eiertidMax: number; p5Min: number; p5Max: number; }
export function colorFor(h: House, mode: ColorMode, dom: ColorDomains): string {
  if (mode === 'band') return bandMeta(h.salgsband).dot;
  if (mode === 'eiertid') return h.eiertid_aar == null ? UNKNOWN : seqColor(h.eiertid_aar / dom.eiertidMax);
  if (mode === 'p5') return h.p5 == null ? UNKNOWN : seqColor((h.p5 - dom.p5Min) / (dom.p5Max - dom.p5Min));
  return typeMeta(h.boligtype).color;
}
