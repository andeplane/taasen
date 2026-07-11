import type { House } from './types';

export const escapeHtml = (value: string | number | null | undefined): string =>
  String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]!));

const DATE_FMT = new Intl.DateTimeFormat('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const formatDate = (iso: string | null): string =>
  iso ? DATE_FMT.format(new Date(`${iso}T00:00:00`)) : '–';

export const buyerText = (h: House): string =>
  h.registrert_kjoper ?? (h.kjoper_tvetydig ? 'Tvetydig – seksjonert' : '–');

/** Registered buyer names, split on commas (a property can have multiple co-buyers). */
export const buyerNames = (h: House): string[] =>
  h.registrert_kjoper ? h.registrert_kjoper.split(',').map(n => n.trim()).filter(Boolean) : [];

export const braText = (v: number | null): string =>
  v == null ? '–' : v === 0 ? '<30' : `${v}+`;

export const estimatText = (h: House): string =>
  h.estimat_min_mnok != null ? `${h.estimat_min_mnok}–${h.estimat_maks_mnok}M` : '–';

export const nb = (n: number): string => n.toLocaleString('nb-NO');
