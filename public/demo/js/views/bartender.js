// views/bartender.js (demo) — live queue + pickup-code verification, English,
// no login (the demo server authenticates the view automatically).
import { useState, useEffect } from 'preact/hooks';
import { html, fmt, toast, timeHM } from '../ui.js';
import { I } from '../icons.js';
import { DemoShell, Topbar, Spinner, nav } from '../components.js';
import { api } from '../api.js';

export function BartenderApp() {
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null); // {order, puede_operar, verificado}
  const [manual, setManual] = useState('');
  const [tab, setTab] = useState('pend');
  const [barFilter, setBarFilter] = useState('');
  const [bars, setBars] = useState([]);

  async function load() {
    try { setData(await api.get('/staff/queue')); } catch {}
  }
  useEffect(() => {
    load();
    api.get('/bars').then(setBars).catch(() => {});
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  async function resolve(code) {
    if (!code) return;
    try {
      const r = await api.get('/staff/resolve/' + encodeURIComponent(code.trim()));
      setDetail({ ...r, verificado: true }); setManual('');
    } catch (e) { toast(e.message || 'Code not found', 'err'); }
  }

  if (!data) return html`<${DemoShell} active="/bartender" wide=${true}><${Spinner} /><//>`;

  const viewOrder = (o) => setDetail({ order: o, puede_operar: true, verificado: false });
  const pendientes = (data.pedidos || []).filter(o => !barFilter || o.bar_id === barFilter);
  const entregados = (data.entregados || []).filter(o => !barFilter || o.bar_id === barFilter);

  return html`<${DemoShell} active="/bartender" wide=${true}>
    <${Topbar} title="Bar station" sub="ALL BARS · LIVE QUEUE" />
    <div class="pad stack" style="padding-bottom:60px">
      <div class="staff-grid">
        <div class="card pad">
          <label class="field">Verify a pickup code to deliver</label>
          <form class="row" onSubmit=${e => { e.preventDefault(); resolve(manual); }}>
            <input class="grow" style="text-transform:uppercase;font-size:1.3rem;letter-spacing:.1em;font-weight:800"
              value=${manual} placeholder="e.g. 7KQ4M" onInput=${e => setManual(e.target.value.toUpperCase())} />
            <button class="btn primary" type="submit">Find</button>
          </form>
          <p class="muted" style="font-size:.8rem;margin:10px 0 0">
            In the club this is a camera scan of the customer's QR. Delivery is only enabled
            after the code checks out against the order — a screenshot of the queue can't be redeemed.
          </p>
        </div>

        <div class="card pad">
          <label class="field">Filter by bar</label>
          <div class="row wrap">
            <button class="chip ${barFilter === '' ? 'active' : ''}" onClick=${() => setBarFilter('')}>All bars</button>
            ${bars.map(b => html`<button key=${b.id} class="chip ${barFilter === b.id ? 'active' : ''}"
              onClick=${() => setBarFilter(b.id)}>${b.nombre}</button>`)}
          </div>
          <div class="row" style="gap:8px;margin-top:12px">
            <button class="chip ${tab === 'pend' ? 'active' : ''}" onClick=${() => setTab('pend')}>In queue (${pendientes.length})</button>
            <button class="chip ${tab === 'entreg' ? 'active' : ''}" onClick=${() => setTab('entreg')}>Delivered (${entregados.length})</button>
          </div>
        </div>
      </div>

      ${tab === 'pend' && html`<div class="queue-grid">
        ${pendientes.length === 0 && html`<p class="center muted" style="padding:30px 0;grid-column:1/-1">Queue's clear 🎉</p>`}
        ${pendientes.map(o => html`<button key=${o.id} class="card pad queue-card s-${o.estado}" style="text-align:left;width:100%"
            onClick=${() => viewOrder(o)}>
          <div class="row between">
            <div class="row" style="gap:10px">
              <span class="num-badge" style="min-width:48px;height:34px;font-size:1.05rem">#${o.numero_orden || '—'}</span>
              <b style="font-size:1.05rem">${o.bar?.nombre || ''}</b>
            </div>
            <span class="pill-state s-${o.estado}">${stateTxt(o.estado)}</span>
          </div>
          <div class="muted" style="font-size:.82rem;margin:4px 0">paid ${timeHM(o.paid_at)}${o.es_regalo ? ' · 🎁 gift' : ''}</div>
          <div>${o.items.map(it => html`<div key=${it.id} style="font-size:.95rem">
            <b>${it.cantidad}×</b> ${it.nombre}
            ${it.comentario && html`<span class="note-flag" style="margin-left:6px;padding:2px 8px">${I.note('var(--warn)')} ${it.comentario}</span>`}
          </div>`)}</div>
        </button>`)}
      </div>`}

      ${tab === 'entreg' && html`<div class="queue-grid">
        ${entregados.length === 0 && html`<p class="center muted" style="padding:30px 0;grid-column:1/-1">Nothing delivered yet.</p>`}
        ${entregados.map(o => html`<button key=${o.id} class="card pad" style="text-align:left;width:100%;opacity:.6"
            onClick=${() => viewOrder(o)}>
          <div class="row between">
            <div class="row" style="gap:10px">
              <span class="num-badge" style="background:var(--text-mute);min-width:48px;height:34px;font-size:1.05rem">#${o.numero_orden || '—'}</span>
              <b style="font-size:1rem">${o.bar?.nombre || ''}</b>
            </div>
            <span class="pill-state s-entregado">${I.check('var(--ok)')} Delivered</span>
          </div>
          <div style="font-size:.85rem;margin-top:4px">${o.items.map(it => it.cantidad + '× ' + it.nombre).join(', ')}</div>
          <div class="muted" style="font-size:.8rem;margin-top:2px">delivered ${timeHM(o.delivered_at)}</div>
        </button>`)}
      </div>`}
    </div>

    ${detail && html`<${OrderDetailModal} data=${detail} onClose=${() => setDetail(null)} onChanged=${load} setDetail=${setDetail} />`}
  <//>`;
}

function stateTxt(e) { return ({ pagado: 'In queue', listo: 'Ready', entregado: 'Delivered' })[e] || e; }

// The DELIVER button only appears once THIS order's code has been verified
// (typed or scanned). That's the anti-fraud core of WOL.
function OrderDetailModal({ data, onClose, onChanged, setDetail }) {
  const { order, puede_operar, verificado } = data;
  const [busy, setBusy] = useState(false);
  const [conf, setConf] = useState('');

  async function deliver(force = false) {
    setBusy(true);
    try {
      const r = await api.post('/staff/orders/' + order.id + '/estado', { estado: 'entregado', forzar: force });
      setDetail({ ...data, order: r.order });
      onChanged();
      toast('Delivered ✓'); onClose();
    } catch (e) {
      if (e.data?.error === 'YA_ENTREGADO') {
        if (confirm('⚠️ This order was already delivered. Deliver again anyway?')) return deliver(true);
      } else toast(e.message || 'Error', 'err');
    } finally { setBusy(false); }
  }

  const confirmCode = async () => {
    const c = conf.trim();
    if (!c) return;
    try {
      const r = await api.get('/staff/resolve/' + encodeURIComponent(c));
      if (r.order.id === order.id) { setDetail({ ...r, verificado: true }); toast('Code verified ✓'); }
      else toast('That code belongs to a different order', 'err');
    } catch (e) { toast('Wrong or unknown code', 'err'); }
  };

  const delivered = order.estado === 'entregado';

  return html`<div class="modal-bg" onClick=${onClose}><div class="modal" onClick=${e => e.stopPropagation()}>
    <div class="row between"><h2 style="margin:0">Order ${order.numero_orden ? '#' + order.numero_orden : ''}</h2><button class="btn ghost sm" onClick=${onClose}>✕</button></div>
    <div class="muted" style="margin-bottom:10px">${order.bar?.nombre} · ${fmt(order.monto_total)}${order.es_regalo ? ' · 🎁 gift' : ''}</div>
    ${verificado && !delivered && html`<div class="card pad" style="border-color:var(--ok);margin-bottom:12px">✓ Code verified: <b style="letter-spacing:.08em">${order.codigo_retiro}</b></div>`}

    ${delivered && html`<div class="card pad" style="border-color:var(--text-mute);margin-bottom:12px">
      Already <b>delivered</b>${order.delivered_at ? ' at ' + timeHM(order.delivered_at) : ''}. Scanning it again warns the bartender — a code can't be redeemed twice.
    </div>`}

    <div class="card pad" style="margin-bottom:14px">
      ${order.items.map(it => html`<div key=${it.id} style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div class="row between"><div><b style="font-size:1.1rem">${it.cantidad}×</b> ${it.nombre}</div></div>
        ${it.comentario && html`<div class="note-flag" style="margin-top:6px">${I.note('var(--warn)')} <b>${it.comentario}</b></div>`}
      </div>`)}
      <div class="row between" style="padding-top:10px"><b>Total</b><b>${fmt(order.monto_total)}</b></div>
    </div>

    ${puede_operar && !delivered && (
      verificado
        ? html`<button class="btn ok block lg" style="min-height:72px;font-size:1.3rem" disabled=${busy} onClick=${() => deliver()}>${I.check('#04130d')} DELIVER</button>`
        : html`<div class="card pad" style="border-color:var(--warn)">
            <b>🔒 Verify the code to deliver</b>
            <p class="muted" style="font-size:.83rem;margin:6px 0 10px">Type the customer's pickup code (in the club: scan their QR). This is what makes a queue screenshot worthless.</p>
            <div class="row">
              <input class="grow" style="text-transform:uppercase;font-weight:800" placeholder="Customer's code"
                value=${conf} onInput=${e => setConf(e.target.value.toUpperCase())} />
              <button class="btn primary" onClick=${confirmCode}>Verify</button>
            </div>
          </div>`
    )}
  </div></div>`;
}
