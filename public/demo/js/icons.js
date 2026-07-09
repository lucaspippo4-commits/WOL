// icons.js — íconos SVG ilustrados (flat/outline) por tipo de recipiente y de UI.
// No dependen de assets externos: son componentes vectoriales parametrizados por color.
import { html } from './ui.js';

// Íconos de producto, indexados por el campo `icono` de cada producto.
function VasoPlastico({ c, tall }) {
  // Vaso plástico cónico (tall = 500ml).
  const top = tall ? 6 : 10;
  return html`<svg viewBox="0 0 48 48" fill="none">
    <path d="M${14} ${top} H34 L31 42 H17 Z" stroke=${c} stroke-width="2.4" stroke-linejoin="round" fill=${c} fill-opacity="0.14"/>
    <path d="M${14} ${top + 9} H34" stroke=${c} stroke-width="1.6" opacity=".5"/>
    <line x1="20" y1=${top + 3} x2="19" y2="40" stroke=${c} stroke-width="1.2" opacity=".4"/>
    <line x1="28" y1=${top + 3} x2="29" y2="40" stroke=${c} stroke-width="1.2" opacity=".4"/>
  </svg>`;
}
function Lata({ c }) {
  return html`<svg viewBox="0 0 48 48" fill="none">
    <rect x="16" y="9" width="16" height="30" rx="3" stroke=${c} stroke-width="2.4" fill=${c} fill-opacity="0.14"/>
    <rect x="16" y="9" width="16" height="5" rx="2.4" stroke=${c} stroke-width="2.2"/>
    <ellipse cx="24" cy="11.5" rx="4" ry="1.4" fill=${c} opacity=".5"/>
    <line x1="20" y1="20" x2="20" y2="33" stroke=${c} stroke-width="1.2" opacity=".4"/>
  </svg>`;
}
function Botella({ c }) {
  return html`<svg viewBox="0 0 48 48" fill="none">
    <path d="M20 6 H28 V12 C28 14 31 15 31 20 V40 C31 41.5 30 42 28 42 H20 C18 42 17 41.5 17 40 V20 C17 15 20 14 20 12 Z"
      stroke=${c} stroke-width="2.4" stroke-linejoin="round" fill=${c} fill-opacity="0.14"/>
    <rect x="20" y="3" width="8" height="4" rx="1" stroke=${c} stroke-width="2"/>
    <path d="M17 27 H31" stroke=${c} stroke-width="1.5" opacity=".5"/>
  </svg>`;
}
function Hielera({ c }) {
  // Hielera / caja "unboxing" para combos.
  return html`<svg viewBox="0 0 48 48" fill="none">
    <path d="M9 18 L24 13 L39 18 V20 L24 25 L9 20 Z" stroke=${c} stroke-width="2.2" stroke-linejoin="round" fill=${c} fill-opacity=".2"/>
    <path d="M11 20 V36 C11 37 11.5 38 13 38 H35 C36.5 38 37 37 37 36 V20" stroke=${c} stroke-width="2.2" stroke-linejoin="round" fill=${c} fill-opacity=".1"/>
    <path d="M24 25 V38" stroke=${c} stroke-width="1.6" opacity=".5"/>
    <circle cx="18" cy="30" r="2" fill=${c} opacity=".6"/>
    <circle cx="30" cy="32" r="2" fill=${c} opacity=".6"/>
  </svg>`;
}
function Paquete({ c }) {
  // Paquete de kiosco (snack/chicle).
  return html`<svg viewBox="0 0 48 48" fill="none">
    <path d="M14 12 L34 12 L31 36 L17 36 Z" stroke=${c} stroke-width="2.2" stroke-linejoin="round" fill=${c} fill-opacity=".14"/>
    <path d="M12 9 L36 9 L34 13 L14 13 Z" stroke=${c} stroke-width="2" stroke-linejoin="round" fill=${c} fill-opacity=".25"/>
    <path d="M19 20 H29 M18 26 H30" stroke=${c} stroke-width="1.6" opacity=".5"/>
  </svg>`;
}

const MAP = {
  vaso_500: (p) => VasoPlastico({ ...p, tall: true }),
  vaso: (p) => VasoPlastico({ ...p, tall: false }),
  lata: Lata,
  botella: Botella,
  hielera: Hielera,
  kiosco: Paquete,
};

export function ProductIcon({ icono, color }) {
  const C = MAP[icono] || VasoPlastico;
  return C({ c: color || 'var(--neon)' });
}

// --- Íconos de interfaz (tabbar, etc.) -------------------------------------
export const I = {
  carta: (c = 'currentColor') => html`<svg viewBox="0 0 24 24" fill="none"><path d="M4 5h16v14H4z" stroke=${c} stroke-width="1.8"/><path d="M8 9h8M8 13h8M8 17h5" stroke=${c} stroke-width="1.8" stroke-linecap="round"/></svg>`,
  mapa: (c = 'currentColor') => html`<svg viewBox="0 0 24 24" fill="none"><path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" stroke=${c} stroke-width="1.8" stroke-linejoin="round"/><path d="M9 4v14M15 6v14" stroke=${c} stroke-width="1.6"/></svg>`,
  pedido: (c = 'currentColor') => html`<svg viewBox="0 0 24 24" fill="none"><path d="M6 7h12l-1 13H7L6 7Z" stroke=${c} stroke-width="1.8" stroke-linejoin="round"/><path d="M9 7a3 3 0 0 1 6 0" stroke=${c} stroke-width="1.8"/></svg>`,
  noche: (c = 'currentColor') => html`<svg viewBox="0 0 24 24" fill="none"><path d="M20 14a8 8 0 1 1-9-11 6 6 0 0 0 9 11Z" stroke=${c} stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  qr: (c = 'currentColor') => html`<svg viewBox="0 0 24 24" fill="none"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" stroke=${c} stroke-width="1.8"/><path d="M14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" fill=${c}/></svg>`,
  scan: (c = 'currentColor') => html`<svg viewBox="0 0 24 24" fill="none"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" stroke=${c} stroke-width="2" stroke-linecap="round"/><path d="M4 12h16" stroke=${c} stroke-width="2" stroke-linecap="round"/></svg>`,
  check: (c = 'currentColor') => html`<svg viewBox="0 0 24 24" fill="none"><path d="m5 13 4 4L19 7" stroke=${c} stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  back: (c = 'currentColor') => html`<svg viewBox="0 0 24 24" fill="none"><path d="m15 5-7 7 7 7" stroke=${c} stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  clock: (c = 'currentColor') => html`<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke=${c} stroke-width="1.8"/><path d="M12 8v4l3 2" stroke=${c} stroke-width="1.8" stroke-linecap="round"/></svg>`,
  note: (c = 'currentColor') => html`<svg viewBox="0 0 24 24" fill="none"><path d="M5 4h14v16H5z" stroke=${c} stroke-width="1.8"/><path d="M8 9h8M8 13h6" stroke=${c} stroke-width="1.8" stroke-linecap="round"/></svg>`,
};
