import type { House } from './types';

export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c] as string));

export const formatDate = (iso: string | null): string =>
  iso ? new Intl.DateTimeFormat('nb-NO').format(new Date(`${iso}T00:00:00`)) : '–';

export const buyerText = (h: House): string =>
  h.registrert_kjoper || (h.kjoper_tvetydig ? 'Tvetydig – seksjonert' : '–');

export const braText = (v: number | null): string =>
  v == null ? '–' : v === 0 ? '<30' : `${v}+`;

export const estimatText = (h: House): string =>
  h.estimat_min_mnok != null ? `${h.estimat_min_mnok}–${h.estimat_maks_mnok}M` : '–';

export const nb = (n: number): string => n.toLocaleString('nb-NO');
