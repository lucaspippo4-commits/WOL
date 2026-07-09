// views/admin.js (demo) — club owner view: live dashboard, dynamic pricing
// (the star feature), menu management and staff. English, no login.
import { useState, useEffect, useRef } from 'preact/hooks';
import { html, fmt, toast } from '../ui.js';
import { DemoShell, Topbar, Spinner } from '../components.js';
import { api } from '../api.js';

export function AdminApp() {
  const initialTab = new URLSearchParams(location.search).get('tab') || 'dashboard';
  const [tab, setTab] = useState(initialTab);
  const tabs = [
    ['dashboard', '📊 Dashboard'],
    ['pricing', '⚡ Dynamic pricing'],
    ['menu', '🍸 Menu'],
    ['staff', '👥 Staff'],
  ];
  return html`<${DemoShell} active="/admin" wide=${true}>
    <${Topbar} title="Hush Club — Owner" sub="LIVE NIGHT · POWERED BY WOL" />
    <div class="scroll-x" style="position:sticky;top:0;z-index:20;background:var(--bg);border-bottom:1px solid var(--border)">
      <div class="row" style="padding:10px 12px">
        ${tabs.map(([id, label]) => html`<button key=${id} class="chip ${tab === id ? 'active' : ''}" onClick=${() => setTab(id)}>${label}</button>`)}
      </div>
    </div>
    <div class="pad" style="padding-bottom:60px">
      ${tab === 'dashboard' && html`<${Dashboard} />`}
      ${tab === 'pricing' && html`<${PricingTab} />`}
      ${tab === 'menu' && html`<${MenuAdmin} />`}
      ${tab === 'staff' && html`<${StaffAdmin} />`}
    </div>
  <//>`;
}

// ── Animated counter (runs once on mount, then follows live values) ──────────
function useCountUp(target, dur = 900) {
  const [v, setV] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (target == null) return;
    if (started.current) { setV(target); return; }
    started.current = true;
    const t0 = performance.now();
    let raf;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function Kpi({ label, value, display, accent }) {
  const v = useCountUp(value);
  return html`<div class="kpi">
    <div class="k">${label}</div>
    <div class="v" style=${accent ? `color:${accent}` : ''}>${display ? display(v) : v}</div>
  </div>`;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard() {
  const [d, setD] = useState(null);
  const [hours, setHours] = useState(null);
  async function load() {
    try {
      setD(await api.get('/admin/dashboard'));
      setHours((await api.get('/demo/analytics')).hours);
    } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  if (!d) return html`<${Spinner} />`;

  const maxBarTotal = Math.max(...d.por_barra.map(b => b.total), 1);

  return html`<div class="stack">
    <div class="kpi-row">
      <${Kpi} label="Tonight's sales" value=${d.ventas_total} display=${fmt} />
      <${Kpi} label="Orders" value=${d.pedidos_total} />
      <${Kpi} label="Avg ticket" value=${d.ticket_promedio} display=${fmt} />
      <${Kpi} label="In queue" value=${d.pendientes} accent="var(--warn)" />
      <${Kpi} label="Delivered" value=${d.entregados} accent="var(--ok)" />
    </div>

    <div class="dash-grid">
      ${hours && html`<div class="card pad">
        <h3 style="margin-bottom:2px">Demand through the night</h3>
        <p class="muted" style="font-size:.8rem;margin:0 0 12px">Revenue per hour — the shape a venue plans staffing and pricing around.</p>
        <${HourChart} hours=${hours} />
      </div>`}

      <div class="card pad">
        <h3>Sales by bar</h3>
        <div class="stack" style="gap:14px;margin-top:10px">
          ${d.por_barra.map(b => html`<div key=${b.id}>
            <div class="row between" style="font-size:.92rem">
              <b>${b.nombre}</b>
              <span>${b.pedidos} orders · ${fmt(b.total)}</span>
            </div>
            <div class="mini-bar"><div style=${`width:${Math.round(b.total / maxBarTotal * 100)}%`}></div></div>
            <div class="muted" style="font-size:.78rem;margin-top:2px">
              ${b.pendientes > 5 ? '🔴' : b.pendientes > 2 ? '🟡' : '🟢'} ${b.pendientes} in queue right now
            </div>
          </div>`)}
        </div>
      </div>
    </div>

    <div class="card pad">
      <h3>Top products tonight</h3>
      ${d.top_productos.length === 0 && html`<p class="muted">No sales yet.</p>`}
      <div class="top-grid">
        ${d.top_productos.slice(0, 8).map((p, i) => html`<div key=${p.nombre} class="row between" style="padding:8px 0;border-bottom:1px solid var(--border)">
          <span><span class="muted" style="font-variant-numeric:tabular-nums">${i + 1}.</span> ${p.nombre}</span>
          <span style="white-space:nowrap"><b>${p.unidades}</b> u · ${fmt(p.recaudado)}</span>
        </div>`)}
      </div>
    </div>
  </div>`;
}

// Hourly revenue chart: one series, hover tooltip, peak direct-labeled.
function HourChart({ hours }) {
  const [hover, setHover] = useState(null);
  const W = 560, H = 190, padL = 8, padB = 26, padT = 26;
  const max = Math.max(...hours.map(h => h.revenue), 1);
  const bw = (W - padL * 2) / hours.length;
  const peakIdx = hours.reduce((bi, h, i) => h.revenue > hours[bi].revenue ? i : bi, 0);
  const label = (h) => {
    const d = new Date(Date.now() - h.hours_ago * 3600e3);
    return d.toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', '').toLowerCase();
  };
  return html`<div class="hour-chart">
    <svg viewBox=${`0 0 ${W} ${H}`} onMouseLeave=${() => setHover(null)}>
      ${[0.5, 1].map(f => html`<line key=${f} x1=${padL} x2=${W - padL}
        y1=${padT + (H - padB - padT) * (1 - f)} y2=${padT + (H - padB - padT) * (1 - f)}
        stroke="var(--border)" stroke-width="1" stroke-dasharray="3 4" />`)}
      ${hours.map((h, i) => {
        const bh = Math.max(2, (H - padB - padT) * h.revenue / max);
        const x = padL + i * bw + 5, y = H - padB - bh;
        const on = hover === i;
        return html`<g key=${i} onMouseEnter=${() => setHover(i)}>
          <rect x=${padL + i * bw} y=${padT} width=${bw} height=${H - padB - padT} fill="transparent" />
          <rect x=${x} y=${y} width=${bw - 10} height=${bh} rx="4"
            fill=${on ? 'var(--neon-glow)' : 'rgba(255,45,85,.55)'} style="transition:fill .15s" />
          ${(on || (hover == null && i === peakIdx)) && html`<text x=${x + (bw - 10) / 2} y=${y - 8}
            text-anchor="middle" fill="var(--text)" font-size="12" font-weight="700">${fmt(h.revenue)}</text>`}
          <text x=${x + (bw - 10) / 2} y=${H - 8} text-anchor="middle"
            fill=${on ? 'var(--text)' : 'var(--text-mute)'} font-size="11">${label(h)}</text>
        </g>`;
      })}
    </svg>
    <div class="muted center" style="font-size:.78rem;min-height:18px">
      ${hover != null ? `${label(hours[hover])} — ${hours[hover].orders} orders · ${fmt(hours[hover].revenue)} revenue` : ''}
    </div>
  </div>`;
}

// ── Dynamic pricing (star feature) ───────────────────────────────────────────
function PricingTab() {
  const [products, setProducts] = useState(null);
  const [state, setState] = useState(null);
  const [occ, setOcc] = useState([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setProducts(await api.get('/admin/products'));
      setState(await api.get('/demo/state'));
      setOcc(await api.get('/occupancy'));
    } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  if (!products || !state) return html`<${Spinner} />`;

  const spike = async () => {
    setBusy(true);
    try {
      const r = await api.post('/demo/spike');
      toast(r.spike_on ? '⚡ Demand spike — prices reacting' : '⚖️ Demand rebalanced — prices easing back');
      await load();
    } catch (e) { toast(e.message || 'Error', 'err'); }
    setBusy(false);
  };

  const maxQ = Math.max(...occ.map(o => o.pendientes), 1);
  const movements = state.movements || {};
  const priced = products.filter(p => p.precio_max > p.precio_min);

  return html`<div class="stack">
    <div class="card pad pricing-hero">
      <div class="grow">
        <h3 style="margin:0">Demand-based pricing, inside the owner's limits</h3>
        <p class="muted" style="font-size:.88rem;margin:6px 0 0;max-width:640px">
          Dynamic pricing lets the venue move demand across bars and time slots — discounting
          to fill quiet moments and capturing value at peak, always within limits the owner sets.
          Guests see it as price drops and happy-hour deals, never as surprises.
        </p>
      </div>
      <button class=${'btn lg ' + (state.spike_on ? 'ok' : 'violet')} disabled=${busy} onClick=${spike}>
        ${busy ? '…' : state.spike_on ? '⚖️ Rebalance demand' : '⚡ Simulate demand spike'}
      </button>
    </div>

    <div class="card pad">
      <h3>Bar load right now</h3>
      <div class="occ-grid">
        ${occ.map(o => html`<div key=${o.id} class="occ-cell">
          <div class="row between" style="font-size:.88rem"><b>${o.nombre}</b><span class="muted">${o.nivel}</span></div>
          <div class="mini-bar occ-${o.color}"><div style=${`width:${Math.round(o.pendientes / maxQ * 100)}%`}></div></div>
          <div class="muted" style="font-size:.78rem">${o.pendientes} orders in queue</div>
        </div>`)}
      </div>
      <p class="muted" style="font-size:.8rem;margin:12px 0 0">
        When one bar saturates, WOL discounts at the quiet ones and notifies guests in-app —
        the crowd redistributes itself without a single staff decision.
      </p>
    </div>

    <div class="card pad">
      <h3 style="margin-bottom:12px">Live prices <span class="muted" style="font-weight:400;font-size:.85rem">· each product moves only inside its min–max range</span></h3>
      <div class="price-list">
        ${priced.map(p => {
          const m = movements[p.id];
          const pct = Math.round((p.precio_actual - p.precio_min) / (p.precio_max - p.precio_min) * 100);
          return html`<div key=${p.id} class="price-row">
            <div class="pr-name"><b>${p.nombre}</b><div class="muted" style="font-size:.76rem">${p.categoria}</div></div>
            <div class="pr-range">
              <span class="muted">${fmt(p.precio_min)}</span>
              <div class="pr-track"><div class="pr-marker ${m ? 'm-' + m.dir : ''}" style=${`left:${pct}%`}></div></div>
              <span class="muted">${fmt(p.precio_max)}</span>
            </div>
            <div class="pr-price ${m ? 'chg-' + m.dir : ''}">
              ${m && html`<span class="pr-arrow">${m.dir === 'up' ? '↑' : '↓'}</span>`}
              ${fmt(p.precio_actual)}
            </div>
            <div class="pr-reason muted">${m ? m.reason : 'Holding at base price'}</div>
          </div>`;
        })}
      </div>
    </div>
  </div>`;
}

// ── Menu management ──────────────────────────────────────────────────────────
function MenuAdmin() {
  const [products, setProducts] = useState(null);
  async function load() { try { setProducts(await api.get('/admin/products')); } catch {} }
  useEffect(() => { load(); }, []);
  if (!products) return html`<${Spinner} />`;

  async function setPrice(p, val) {
    try { await api.patch(`/admin/products/${p.id}/precio`, { precio_actual: val }); toast('Price updated ✓'); load(); }
    catch (e) { toast(e.message, 'err'); }
  }
  async function toggle(p) {
    try { await api.patch(`/admin/products/${p.id}/disponible`, { disponible: !p.disponible }); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  return html`<div class="stack">
    <p class="muted" style="margin:0">Edit a price or mark something sold out — customers see it instantly. Try it, then check the customer view.</p>
    <div class="menu-admin-grid">
      ${products.map(p => html`<div key=${p.id} class="card pad">
        <div class="row between">
          <div class="grow"><b>${p.nombre}</b> <span class="muted" style="font-size:.8rem">· ${p.categoria}</span></div>
          <label class="row" style="gap:6px;font-size:.8rem">
            <input type="checkbox" style="width:auto;min-height:auto" checked=${p.disponible} onChange=${() => toggle(p)} /> ${p.disponible ? 'Available' : 'Sold out'}
          </label>
        </div>
        <div style="margin-top:10px">
          <label class="field">Current price</label>
          <input type="number" step="100" min="0" value=${p.precio_actual}
            onChange=${e => setPrice(p, parseInt(e.target.value) || 0)} />
        </div>
      </div>`)}
    </div>
  </div>`;
}

// ── Staff ────────────────────────────────────────────────────────────────────
function StaffAdmin() {
  const [staff, setStaff] = useState(null);
  const [bars, setBars] = useState([]);
  useEffect(() => {
    api.get('/admin/staff').then(setStaff).catch(() => {});
    api.get('/admin/bars').then(setBars).catch(() => {});
  }, []);
  if (!staff) return html`<${Spinner} />`;
  const barName = (id) => bars.find(b => b.id === id)?.nombre || id;
  const ROLE = { bartender: 'Bartender', encargado: 'Floor manager', admin: 'Admin' };
  const visible = staff.filter(s => s.usuario !== 'demo');
  return html`<div class="stack">
    <p class="muted" style="margin:0">Each bartender is scoped to their own bars: they can only see and deliver that queue. In this public demo, accounts are display-only.</p>
    <div class="menu-admin-grid">
      ${visible.map(s => html`<div key=${s.id} class="card pad">
        <div class="row between">
          <div><b>${s.nombre}</b> <span class="muted" style="font-size:.8rem">· ${ROLE[s.rol] || s.rol}</span></div>
          <span class="badge ${s.activo ? 'new' : 'out'}">${s.activo ? 'Active' : 'Inactive'}</span>
        </div>
        ${s.rol === 'bartender' && html`<div class="muted" style="font-size:.82rem;margin-top:6px">Bars: ${s.barras.map(barName).join(', ') || '—'}</div>`}
      </div>`)}
    </div>
  </div>`;
}
