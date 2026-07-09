// components.js (demo) — shared UI for the demo app: view-switcher shell,
// product cards with dynamic-pricing badges, timeline, toasts.
import { useState, useEffect } from 'preact/hooks';
import { html, fmt, registerToaster, catColor, catSoft, timeHM } from './ui.js';
import { ProductIcon, I } from './icons.js';

export function nav(path) {
  history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}

// --- Demo shell: persistent view switcher above every view ------------------
const VIEWS = [
  ['/customer', 'Customer'],
  ['/bartender', 'Bartender'],
  ['/admin', 'Admin'],
];
export function DemoShell({ active, children, wide }) {
  return html`<div class=${'demo-shell' + (wide ? ' wide' : '')}>
    <div class="demo-switch">
      <button class="demo-brand" onClick=${() => nav('/')} title="Back to overview">
        <span class="wol">WOL</span><span class="live">LIVE DEMO</span>
      </button>
      <div class="demo-pills">
        ${VIEWS.map(([path, label]) => html`<button key=${path}
          class=${'demo-pill' + (active === path ? ' on' : '')}
          onClick=${() => nav(path)}>${label}</button>`)}
      </div>
      <button class="demo-exit" onClick=${() => nav('/')}>${I.back('currentColor')} <span>Overview</span></button>
    </div>
    <div class="demo-body">${children}</div>
  </div>`;
}

// --- Topbar inside a view -----------------------------------------------------
export function Topbar({ title, sub, back, right }) {
  return html`<div class="topbar">
    ${back && html`<button class="btn ghost sm" onClick=${back} aria-label="Back" style="padding:0 8px;min-height:40px">${I.back()}</button>`}
    <img class="logo" src="/assets/hush-logo.jpeg" alt="Hush Club" />
    <div class="grow">
      <div style="font-weight:800;line-height:1">${title || 'Hush Club'}</div>
      <div class="brand-wol">${sub || 'POWERED BY WOL'}</div>
    </div>
    ${right}
  </div>`;
}

export function Spinner() { return html`<div class="spinner"></div>`; }

// --- Toaster -------------------------------------------------------------------
export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    registerToaster((msg, tipo) => {
      const id = Math.random();
      setItems(x => [...x, { id, msg, tipo }]);
      setTimeout(() => setItems(x => x.filter(i => i.id !== id)), 2400);
    });
  }, []);
  if (!items.length) return null;
  return html`<div class="toast-wrap">
    ${items.map(i => html`<div key=${i.id} class="toast ${i.tipo}">${i.msg}</div>`)}
  </div>`;
}

// --- Product photo / icon -------------------------------------------------------
export function ProductThumb({ p, size = 64 }) {
  const st = `flex:0 0 ${size}px;width:${size}px;height:${size}px`;
  if (p.imagen_url) {
    return html`<div class="prod-photo" style=${st}><img src=${p.imagen_url} alt=${p.nombre} loading="lazy" /></div>`;
  }
  return html`<div class="icon-wrap" style=${st}><${ProductIcon} icono=${p.icono} color=${catColor(p.categoria)} /></div>`;
}

// --- Product card (customer menu) ------------------------------------------------
// `movement` comes from the dynamic-pricing demo state: {dir, prev, now, reason}.
export function ProductCard({ p, onAdd, ranking, movement }) {
  const [comentario, setComentario] = useState('');
  const offerPrice = p._offer;
  const dropped = movement && movement.dir === 'down';
  const badges = [];
  if (dropped) badges.push(html`<span class="badge drop">🔥 Price drop</span>`);
  if (offerPrice != null) badges.push(html`<span class="badge off">Happy hour pricing</span>`);
  if (ranking) badges.push(html`<span class="badge hot">Most ordered tonight</span>`);
  if (!p.disponible) badges.push(html`<span class="badge out">Sold out</span>`);

  const add = () => { onAdd(p, comentario); setComentario(''); };

  return html`<div class="prod ${p.disponible ? '' : 'unavailable'}"
      style=${`--cat:${catColor(p.categoria)};--cat-soft:${catSoft(p.categoria)}`}>
    <div class="cat-strip"></div>
    <${ProductThumb} p=${p} />
    <div class="pinfo">
      ${badges.length > 0 && html`<div class="pbadges">${badges}</div>`}
      <div class="pname">${p.nombre}</div>
      <div class="pdesc">${p.descripcion}</div>
      <div class="row between prow-bottom">
        <div class="price">
          ${dropped && html`<span class="old">${fmt(movement.prev)}</span>`}
          ${!dropped && offerPrice != null && html`<span class="old">${fmt(p.precio_actual)}</span>`}
          ${fmt(offerPrice != null ? offerPrice : p.precio_actual)}
        </div>
        ${p.disponible
          ? html`<button class="btn primary sm" onClick=${add}>+ Add</button>`
          : html`<button class="btn sm" disabled>Sold out</button>`}
      </div>
      ${p.permite_comentario && p.disponible && html`<div class="comment-input">
        <input value=${comentario} maxlength="60"
          placeholder=${p.comentario_placeholder || 'e.g. light ice'}
          onInput=${e => setComentario(e.target.value)} />
      </div>`}
    </div>
  </div>`;
}

// --- Order timeline ---------------------------------------------------------------
const FLOW = [
  { key: 'pagado', label: 'Paid', sub: 'Payment confirmed' },
  { key: 'listo', label: 'Ready — pick it up', sub: 'Show your code at the bar' },
  { key: 'entregado', label: 'Delivered ✓', sub: 'Enjoy 🍸' },
];
export function OrderTimeline({ estado, order }) {
  const idx = estado === 'entregado' ? 2 : 1;
  const tsMap = { pagado: order.paid_at, listo: order.ready_at, entregado: order.delivered_at };
  return html`<div class="steps">
    ${FLOW.map((f, i) => {
      const cls = i < idx ? 'done' : i === idx ? 'current' : '';
      return html`<div key=${f.key}>
        <div class="step ${cls}">
          <div class="bullet">${i < idx ? I.check('#04130d') : i + 1}</div>
          <div class="label">${f.label}<small>${f.sub}${tsMap[f.key] ? ' · ' + timeHM(tsMap[f.key]) : ''}</small></div>
        </div>
        ${i < FLOW.length - 1 && html`<div class="step ${i < idx ? 'done' : ''}"><div class="line"></div></div>`}
      </div>`;
    })}
  </div>`;
}

// --- Bar picker pill ---------------------------------------------------------------
export function BarPill({ bar, occ, selected, onClick, right }) {
  return html`<button class="bar-pill ${selected ? 'sel' : ''}" onClick=${onClick}>
    <span class="dot ${occ?.color || 'verde'}"></span>
    <span class="grow">
      <b>${bar.nombre}</b>
      <div class="muted" style="font-size:.78rem">${bar.ubicacion}</div>
    </span>
    ${right != null ? right : (occ ? html`<span class="muted" style="font-size:.78rem;text-align:right">${occ.nivel}<br/>${occ.pendientes} in queue</span>` : '')}
  </button>`;
}
