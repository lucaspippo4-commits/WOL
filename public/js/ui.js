// ui.js — binding de htm+preact y helpers compartidos de UI.
import { h } from 'preact';
import htm from 'htm';

export const html = htm.bind(h);

// Formato de dinero en pesos argentinos.
export function fmt(n) {
  return '$' + (n || 0).toLocaleString('es-AR');
}

export function timeAr(iso) {
  if (!iso) return '';
  // Los timestamps de SQLite vienen en UTC ('YYYY-MM-DD HH:MM:SS').
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

// --- Toasts (feedback inmediato) -------------------------------------------
let toastCb = null;
export function registerToaster(fn) { toastCb = fn; }
export function toast(msg, tipo = 'ok') { if (toastCb) toastCb(msg, tipo); }

// Acentos de categoría.
export const CAT_COLOR = {
  'Tragos': 'var(--c-tragos)',
  'Combos': 'var(--c-combos)',
  'Cervezas': 'var(--c-cervezas)',
  'Sin alcohol': 'var(--c-sinalcohol)',
  'Extras': 'var(--c-extras)',
  'Kiosco': 'var(--c-kiosco)',
};
export const CAT_SOFT = {
  'Tragos': 'rgba(255,45,85,.14)',
  'Combos': 'rgba(168,85,247,.14)',
  'Cervezas': 'rgba(245,158,11,.14)',
  'Sin alcohol': 'rgba(45,212,191,.14)',
  'Extras': 'rgba(56,189,248,.14)',
  'Kiosco': 'rgba(182,255,60,.14)',
};
export function catColor(c) { return CAT_COLOR[c] || 'var(--neon)'; }
export function catSoft(c) { return CAT_SOFT[c] || 'rgba(255,45,85,.14)'; }
