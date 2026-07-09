// ui.js (demo) — htm+preact binding and shared UI helpers, English copy.
import { h } from 'preact';
import htm from 'htm';

export const html = htm.bind(h);

// Money: Argentine pesos, US-style grouping for an international reader.
export function fmt(n) {
  return '$' + (n || 0).toLocaleString('en-US');
}

export function timeHM(iso) {
  if (!iso) return '';
  // SQLite timestamps come as UTC 'YYYY-MM-DD HH:MM:SS'.
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// --- Toasts ------------------------------------------------------------------
let toastCb = null;
export function registerToaster(fn) { toastCb = fn; }
export function toast(msg, tipo = 'ok') { if (toastCb) toastCb(msg, tipo); }

// Category accents (demo categories are in English).
export const CAT_COLOR = {
  'Drinks': 'var(--c-tragos)',
  'Combos': 'var(--c-combos)',
  'Beer': 'var(--c-cervezas)',
  'Zero proof': 'var(--c-sinalcohol)',
  'Extras': 'var(--c-extras)',
  'Kiosk': 'var(--c-kiosco)',
};
export const CAT_SOFT = {
  'Drinks': 'rgba(255,45,85,.14)',
  'Combos': 'rgba(168,85,247,.14)',
  'Beer': 'rgba(245,158,11,.14)',
  'Zero proof': 'rgba(45,212,191,.14)',
  'Extras': 'rgba(56,189,248,.14)',
  'Kiosk': 'rgba(182,255,60,.14)',
};
export function catColor(c) { return CAT_COLOR[c] || 'var(--neon)'; }
export function catSoft(c) { return CAT_SOFT[c] || 'rgba(255,45,85,.14)'; }
