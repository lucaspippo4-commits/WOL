// components.js — componentes de UI compartidos por las 3 interfaces.
import { useState, useEffect } from 'preact/hooks';
import { html, fmt, registerToaster, catColor, catSoft, timeAr } from './ui.js';
import { ProductIcon, I } from './icons.js';

export function nav(path) {
  history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// --- Topbar con logo de Hush + marca WOL discreta --------------------------
export function Topbar({ title, back, right }) {
  return html`<div class="topbar">
    ${back && html`<button class="btn ghost sm" onClick=${back} aria-label="Volver" style="padding:0 8px;min-height:40px">${I.back()}</button>`}
    <img class="logo" src="/assets/hush-logo.jpeg" alt="Hush Club" onClick=${() => nav('/')} />
    <div class="grow">
      <div style="font-weight:800;line-height:1">${title || 'Hush Club'}</div>
      <div class="brand-wol">POWERED BY WOL</div>
    </div>
    ${right}
  </div>`;
}

export function Spinner() { return html`<div class="spinner"></div>`; }

export function FooterWOL({ onContact }) {
  return html`<div class="footer-wol">
    <div><b>W O L</b></div>
    <div style="margin-top:6px">Powered by WOL · Hush Club</div>
    ${onContact && html`<button class="btn ghost sm" style="margin-top:10px" onClick=${onContact}>¿Te gustó WOL?</button>`}
    <!-- Acceso discreto al selector de vistas (staff/admin/founders) -->
    <div style="margin-top:14px"><span title="Cambiar de vista" style="cursor:pointer;opacity:.35;font-size:.8rem"
      onClick=${() => nav('/acceso')}>· cambiar vista ·</span></div>
  </div>`;
}

// --- Toaster global ---------------------------------------------------------
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    registerToaster((msg, tipo) => {
      const id = Math.random();
      setItems(x => [...x, { id, msg, tipo }]);
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 2200);
    });
  }, []);
  if (!items.length) return null;
  return html`<div class="toast-wrap">
    ${items.map(i => html`<div key=${i.id} class="toast ${i.tipo}">${i.msg}</div>`)}
  </div>`;
}

// --- Mapa del local (SVG inspirado en el plano de Hush) ---------------------
// Distribución relativa: VIP arriba-izq (Barra 1), Barra 2 arriba-der,
// Barra 3 abajo-izq, Patio abajo-der (Barra 4).
const BAR_POS = {
  barra_1: { x: 52, y: 60 },
  barra_2: { x: 250, y: 70 },
  barra_3: { x: 50, y: 300 },
  barra_4: { x: 245, y: 300 },
};
export function BarMap({ bars, occupancy, selected, onSelect }) {
  const occ = (id) => occupancy?.find(o => o.id === id);
  return html`<div class="map-wrap">
    <svg viewBox="0 0 320 380">
      <rect x="6" y="6" width="308" height="368" rx="14" fill="#15151c" stroke="#2a2a36" stroke-width="2"/>
      <!-- VIP -->
      <path d="M10 10 H150 V120 Q150 150 110 150 H10 Z" fill="rgba(168,85,247,.16)" stroke="rgba(168,85,247,.5)" stroke-width="1.5"/>
      <text x="74" y="86" fill="#c89bff" font-size="13" font-weight="700" text-anchor="middle">VIP</text>
      <!-- Patio -->
      <path d="M170 200 H310 V370 H170 Z" fill="rgba(56,189,248,.14)" stroke="rgba(56,189,248,.45)" stroke-width="1.5"/>
      <text x="240" y="290" fill="#7dd3fc" font-size="13" font-weight="700" text-anchor="middle">PATIO</text>
      <text x="200" y="180" fill="#55556a" font-size="11" font-weight="600" text-anchor="middle">PISTA</text>

      ${bars.map(b => {
        const p = BAR_POS[b.id]; if (!p) return null;
        const o = occ(b.id);
        const color = o ? ({ verde: '#34d399', amarillo: '#fbbf24', rojo: '#f43f5e' }[o.color]) : '#888';
        const isSel = selected === b.id;
        return html`<g class="bar-dot" key=${b.id} onClick=${() => onSelect && onSelect(b.id)}>
          <circle cx=${p.x} cy=${p.y} r=${isSel ? 26 : 22} fill=${color} fill-opacity=${isSel ? .3 : .18}
            stroke=${color} stroke-width=${isSel ? 3 : 2}/>
          <circle cx=${p.x} cy=${p.y} r="13" fill=${color}/>
          <text x=${p.x} y=${p.y + 5} fill="#0a0a0d" font-size="15" font-weight="900" text-anchor="middle">${b.id.split('_')[1]}</text>
          <text x=${p.x} y=${p.y + 40} fill="#e6e6ee" font-size="10.5" font-weight="700" text-anchor="middle">${b.nombre.replace(/^Barra \d+\s*/, '') || b.nombre}</text>
        </g>`;
      })}
    </svg>
  </div>`;
}

export function BarLegend({ occupancy }) {
  return html`<div class="row wrap" style="gap:14px;justify-content:center;margin-top:8px;font-size:.8rem">
    <span class="row" style="gap:6px"><span class="dot verde"></span>Tranquila</span>
    <span class="row" style="gap:6px"><span class="dot amarillo"></span>Movida</span>
    <span class="row" style="gap:6px"><span class="dot rojo"></span>Muy demandada</span>
  </div>`;
}

// --- Miniatura de producto: foto real si existe, si no el ícono SVG ---------
export function ProductThumb({ p, size = 64 }) {
  const st = `flex:0 0 ${size}px;width:${size}px;height:${size}px`;
  if (p.imagen_url) {
    return html`<div class="prod-photo" style=${st}><img src=${p.imagen_url} alt=${p.nombre} loading="lazy" /></div>`;
  }
  return html`<div class="icon-wrap" style=${st}><${ProductIcon} icono=${p.icono} color=${catColor(p.categoria)} /></div>`;
}

// --- Tarjeta de producto (consumidor) --------------------------------------
export function ProductCard({ p, onAdd, ranking }) {
  const [comentario, setComentario] = useState('');
  const offerPrice = p._offer; // precio especial si hay oferta activa
  const badges = [];
  if (ranking) badges.push(html`<span class="badge hot">🔥 Más pedido</span>`);
  if (p._recomendado) badges.push(html`<span class="badge rec">⭐ Recomendado</span>`);
  if (offerPrice != null) badges.push(html`<span class="badge off">% Oferta</span>`);
  if (!p.disponible) badges.push(html`<span class="badge out">Agotado</span>`);

  const add = () => { onAdd(p, comentario); setComentario(''); };

  return html`<div class="prod ${p.disponible ? '' : 'unavailable'}"
      style=${`--cat:${catColor(p.categoria)};--cat-soft:${catSoft(p.categoria)}`}>
    <div class="cat-strip"></div>
    <${ProductThumb} p=${p} />
    <div class="pinfo">
      ${badges.length > 0 && html`<div class="pbadges">${badges}</div>`}
      <div class="row between" style="align-items:flex-start">
        <div class="grow">
          <div class="pname">${p.nombre}</div>
          <!-- Combos: la composición se muestra una sola vez (desde la descripción) -->
          <div class="pdesc">${p.descripcion}</div>
        </div>
      </div>
      <div class="row between" style="margin-top:10px">
        <div class="price">
          ${offerPrice != null && html`<span class="old">${fmt(p.precio_actual)}</span>`}
          ${fmt(offerPrice != null ? offerPrice : p.precio_actual)}
        </div>
        ${p.disponible
          ? html`<button class="btn primary sm" onClick=${add}>+ Agregar</button>`
          : html`<button class="btn sm" disabled>No disp.</button>`}
      </div>
      ${p.permite_comentario && p.disponible && html`<div class="comment-input">
        <input value=${comentario} maxlength="60"
          placeholder=${p.comentario_placeholder || 'Ej: poco hielo'}
          onInput=${e => setComentario(e.target.value)} />
      </div>`}
    </div>
  </div>`;
}

// --- Timeline de estado del pedido -----------------------------------------
// Flujo simplificado: Pagado → ¡Listo! Pasá a buscarlo → Entregado.
const FLUJO = [
  { key: 'pagado', label: 'Pagado', sub: 'Tu pago fue confirmado' },
  { key: 'listo', label: '¡Listo! Pasá a buscarlo', sub: 'Mostrá tu código en la barra' },
  { key: 'entregado', label: 'Entregado ✓', sub: 'Disfrutá 🍸' },
];
export function OrderTimeline({ estado, order }) {
  // Apenas está pagado ya se le dice "pasá a buscarlo" (no hay estado intermedio).
  const idx = estado === 'entregado' ? 2 : 1;
  const tsMap = { pagado: order.paid_at, listo: order.ready_at, entregado: order.delivered_at };
  return html`<div class="steps">
    ${FLUJO.map((f, i) => {
      const cls = i < idx ? 'done' : i === idx ? 'current' : '';
      return html`<div key=${f.key}>
        <div class="step ${cls}">
          <div class="bullet">${i < idx ? I.check('#04130d') : i + 1}</div>
          <div class="label">${f.label}<small>${f.sub}${tsMap[f.key] ? ' · ' + timeAr(tsMap[f.key]) : ''}</small></div>
        </div>
        ${i < FLUJO.length - 1 && html`<div class="step ${i < idx ? 'done' : ''}"><div class="line"></div></div>`}
      </div>`;
    })}
  </div>`;
}
