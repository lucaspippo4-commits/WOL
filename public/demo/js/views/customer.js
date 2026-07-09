// views/customer.js (demo) — the guest-facing app in English, plus the
// simulated Mercado Pago checkout used by the public demo.
import { useState, useEffect, useRef } from 'preact/hooks';
import { html, fmt, toast, catColor, timeHM } from '../ui.js';
import { I } from '../icons.js';
import { DemoShell, Topbar, Spinner, ProductCard, ProductThumb, OrderTimeline, BarPill, nav } from '../components.js';
import { api } from '../api.js';
import {
  sessionToken, getCart, onCartChange, addToCart, setQty, setComment,
  clearCart, cartCount, cartSubtotal, cartProductIds
} from '../store.js';

const SEL_BAR_KEY = 'wol_demo_bar';
const getSelBar = () => localStorage.getItem(SEL_BAR_KEY);
const setSelBar = (id) => localStorage.setItem(SEL_BAR_KEY, id);

function useCart() {
  const [, setN] = useState(0);
  useEffect(() => onCartChange(() => setN(n => n + 1)), []);
  return getCart();
}

// Poll the demo pricing state (movements + in-app notification).
function useDemoState(intervalMs = 4000) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.get('/demo/state').then(s => alive && setState(s)).catch(() => {});
    load();
    const t = setInterval(load, intervalMs);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return state;
}

// ── Customer shell with tabs ─────────────────────────────────────────────────
export function CustomerApp() {
  const initialTab = new URLSearchParams(location.search).get('tab') || 'menu';
  const [tab, setTab] = useState(initialTab);
  useCart();
  const count = cartCount();
  const demo = useDemoState();
  const [dismissed, setDismissed] = useState(0);

  const tabs = [
    { id: 'menu', label: 'Menu', icon: I.carta },
    { id: 'map', label: 'Map', icon: I.mapa },
    { id: 'orders', label: 'My orders', icon: I.pedido },
    { id: 'night', label: 'My night', icon: I.noche },
  ];
  const notice = demo?.notice && demo.notice.id !== dismissed ? demo.notice : null;

  return html`<${DemoShell} active="/customer" wide=${true}>
    <div class="phone-col">
      <${Topbar} title="Hush Club" sub="SATURDAY NIGHT · POWERED BY WOL" />
      ${notice && html`<div class="cust-wrap"><div class="push-note" onClick=${() => setDismissed(notice.id)}>
        <span class="push-emoji">${notice.emoji}</span>
        <span class="grow"><b>${notice.title}</b><div>${notice.text}</div></span>
        <span class="push-x">✕</span>
      </div></div>`}
      <div class="pad cust-wrap" style="padding-bottom:120px">
        ${tab === 'menu' && html`<${MenuTab} demo=${demo} />`}
        ${tab === 'map' && html`<div class="narrow"><${MapTab} /></div>`}
        ${tab === 'orders' && html`<div class="narrow"><${OrdersTab} /></div>`}
        ${tab === 'night' && html`<div class="narrow"><${NightTab} /></div>`}
      </div>

      ${count > 0 && html`<div class="bottombar">
        <div class="cust-wrap"><button class="btn primary lg block" onClick=${() => nav('/cart')}>
          <span>View cart · ${count} item${count > 1 ? 's' : ''}</span>
          <span class="grow"></span>
          <span>${fmt(cartSubtotal())}</span>
        </button></div>
      </div>`}

      <div class="tabbar">
        ${tabs.map(t => html`<a key=${t.id} class=${tab === t.id ? 'active' : ''}
          onClick=${(e) => { e.preventDefault(); setTab(t.id); }} href="#">
          ${t.icon(tab === t.id ? 'var(--neon-glow)' : 'currentColor')}<span>${t.label}</span>
        </a>`)}
      </div>
    </div>
  <//>`;
}

// ── Menu ─────────────────────────────────────────────────────────────────────
function MenuTab({ demo }) {
  const [data, setData] = useState(null);
  const [recs, setRecs] = useState(null);
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');

  async function load() {
    try {
      const menu = await api.get('/menu');
      const offerMap = {};
      (menu.offers || []).forEach(o => { if (o.product_id && o.precio_especial != null) offerMap[o.product_id] = o.precio_especial; });
      menu.products.forEach(p => { if (offerMap[p.id] != null) p._offer = offerMap[p.id]; });
      setData(menu);
      setRecs(await api.get('/recommendations'));
    } catch (e) { /* network-tolerant */ }
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  if (!data) return html`<${Spinner} />`;

  const onAdd = (p, comentario) => { addToCart(p, comentario); toast(`${p.nombre} added ✓`); };
  const cats = ['All', ...data.categorias];
  const topIds = new Set((recs?.mas_pedidos || []).map(m => m.id));
  const movements = demo?.movements || {};

  let visible = data.products;
  if (cat !== 'All') visible = visible.filter(p => p.categoria === cat);
  if (q) visible = visible.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase()));

  return html`<div class="stack">
    <input placeholder="🔍 Search drinks…" value=${q} onInput=${e => setQ(e.target.value)} />

    <div class="scroll-x"><div class="row" style="padding-bottom:4px">
      ${cats.map(c => html`<button key=${c} class="chip ${cat === c ? 'active' : ''}" onClick=${() => setCat(c)}>${c}</button>`)}
    </div></div>

    ${cat === 'All' && !q && recs?.mas_pedidos?.length > 0 && html`<div>
      <div class="section-title"><h2>🔥 Most ordered tonight</h2></div>
      <div class="menu-grid">${recs.mas_pedidos.slice(0, 3).map(m => {
        const full = data.products.find(x => x.id === m.id);
        return full ? html`<${ProductCard} key=${'m' + m.id} p=${full} onAdd=${onAdd} ranking=${true} movement=${movements[full.id]} />` : null;
      })}</div>
    </div>`}

    <div class="section-title"><h2>${cat === 'All' ? 'Full menu' : cat}</h2></div>
    <div class="menu-grid">
      ${visible.map(p => html`<${ProductCard} key=${p.id} p=${p} onAdd=${onAdd} ranking=${topIds.has(p.id)} movement=${movements[p.id]} />`)}
      ${visible.length === 0 && html`<p class="center muted">No results.</p>`}
    </div>
  </div>`;
}

// ── Map ──────────────────────────────────────────────────────────────────────
function MapTab() {
  const [bars, setBars] = useState([]);
  const [occ, setOcc] = useState([]);
  const [sel, setSel] = useState(getSelBar());

  async function load() {
    try { setBars(await api.get('/bars')); setOcc(await api.get('/occupancy')); } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const pick = (id) => { setSel(id); setSelBar(id); const b = bars.find(x => x.id === id); toast(`Pickup at ${b?.nombre || id}`); };

  return html`<div class="stack">
    <div class="section-title"><h2>Club map</h2></div>
    <p>See where each bar is and how busy it looks — then pick where you'll grab your order.</p>
    <div class="map-wrap"><img src="/assets/plano-local.jpeg" alt="Hush Club floor plan with its four bars" style="width:100%;display:block" /></div>
    <div class="row wrap" style="gap:14px;justify-content:center;margin-top:8px;font-size:.8rem">
      <span class="row" style="gap:6px"><span class="dot verde"></span>Quiet</span>
      <span class="row" style="gap:6px"><span class="dot amarillo"></span>Busy</span>
      <span class="row" style="gap:6px"><span class="dot rojo"></span>Slammed</span>
    </div>
    <div class="stack" style="margin-top:8px">
      ${bars.map(b => html`<${BarPill} key=${b.id} bar=${b} occ=${occ.find(x => x.id === b.id)}
        selected=${sel === b.id} onClick=${() => pick(b.id)} />`)}
    </div>
    ${sel && html`<button class="btn primary block" onClick=${() => nav('/customer')}>Choose your drinks →</button>`}
  </div>`;
}

// ── My orders ────────────────────────────────────────────────────────────────
function OrdersTab() {
  const [orders, setOrders] = useState(null);
  async function load() { try { setOrders(await api.get(`/sessions/${sessionToken()}/orders`)); } catch {} }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  if (!orders) return html`<${Spinner} />`;
  if (orders.length === 0) return html`<div class="center" style="padding:40px 0">
    <p class="muted">No orders yet tonight.</p>
    <button class="btn primary" onClick=${() => nav('/customer')}>Browse the menu</button>
  </div>`;
  return html`<div class="stack">
    <div class="section-title"><h2>Tonight's orders</h2></div>
    ${orders.map(o => html`<button key=${o.id} class="list-row" style="text-align:left;width:100%;background:var(--surface)"
        onClick=${() => nav('/order/' + o.qr_token)}>
      <div class="grow">
        <div class="row between"><b>Code ${o.codigo_retiro}</b><span class="pill-state s-${o.estado}">${stateLabel(o)}</span></div>
        <div class="muted" style="font-size:.82rem">${o.items.reduce((a, i) => a + i.cantidad, 0)} items · ${o.bar?.nombre || 'gift'} · ${fmt(o.monto_total)}</div>
      </div>
      ${I.back('var(--text-mute)')}
    </button>`)}
  </div>`;
}

function stateLabel(o) {
  if (o.estado === 'regalo_pendiente') return 'Gift — not redeemed';
  return ({ creado: 'Payment pending', pagado: 'Ready!', listo: 'Ready!', entregado: 'Delivered', cancelado: 'Cancelled' })[o.estado] || o.estado;
}

// ── My night (loyalty + survey) ──────────────────────────────────────────────
function NightTab() {
  return html`<div class="stack">
    <${LoyaltyCard} />
    <div class="section-title"><h2>How's your night going?</h2></div>
    <${SurveyForm} />
  </div>`;
}

function LoyaltyCard() {
  const [l, setL] = useState(null);
  async function load() { try { setL(await api.get('/loyalty/' + sessionToken())); } catch {} }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  if (!l) return null;
  const pct = Math.min(100, Math.round((l.puntos / l.umbral) * 100));
  return html`<div class="card pad">
    <div class="row between"><h3 style="margin:0">⭐ Points tonight</h3><div style="font-size:1.6rem;font-weight:900">${l.puntos}</div></div>
    <div style="height:10px;background:var(--bg-2);border-radius:999px;overflow:hidden;margin:10px 0">
      <div style=${`height:100%;width:${pct}%;background:linear-gradient(90deg,var(--violet),var(--neon-glow));transition:width .6s`}></div>
    </div>
    <p class="muted" style="font-size:.85rem;margin:0">${l.recompensa_texto}</p>
    ${l.cupones?.filter(c => !c.usado).map(c => html`<div key=${c.cupon} class="card pad" style="margin-top:10px;border-color:var(--lime)">
      🎉 <b>Reward unlocked!</b><br/>Use code <b style="color:var(--lime)">${c.cupon}</b> on your next order tonight.
    </div>`)}
  </div>`;
}

function SurveyForm() {
  const [rating, setRating] = useState(0);
  const [nps, setNps] = useState('');
  const [sug, setSug] = useState('');
  const [com, setCom] = useState('');
  const [sent, setSent] = useState(false);
  const send = async () => {
    try {
      await api.post('/survey', { session: sessionToken(), rating, nps, sugerencia_trago: sug, comentario: com });
      setSent(true); toast('Thanks for the feedback! 🙌');
    } catch { toast('Could not send', 'err'); }
  };
  if (sent) return html`<div class="card pad center">✅ <b>Thank you!</b><br/><span class="muted">Your feedback shapes the night.</span></div>`;
  return html`<div class="card pad stack">
    <div>
      <label class="field">Rate your experience</label>
      <div class="stars">${[1, 2, 3, 4, 5].map(n => html`<span key=${n} onClick=${() => setRating(n)}>${n <= rating ? '⭐' : '☆'}</span>`)}</div>
    </div>
    <div>
      <label class="field">A drink you'd love us to add</label>
      <input value=${sug} onInput=${e => setSug(e.target.value)} placeholder="e.g. Aperol Spritz" />
    </div>
    <div>
      <label class="field">Would you use WOL again?</label>
      <div class="row">${[['si', '👍 Yes'], ['tal_vez', '🤔 Maybe'], ['no', '👎 No']].map(([v, t]) =>
        html`<button key=${v} class="chip ${nps === v ? 'active' : ''}" onClick=${() => setNps(v)}>${t}</button>`)}</div>
    </div>
    <div>
      <label class="field">Anything else? (optional)</label>
      <textarea value=${com} onInput=${e => setCom(e.target.value)} placeholder="Tell us how it went…"></textarea>
    </div>
    <button class="btn primary block" disabled=${!rating} onClick=${send}>Send</button>
  </div>`;
}

// ── Cart / checkout ──────────────────────────────────────────────────────────
export function Cart() {
  const cart = useCart();
  const [bars, setBars] = useState([]);
  const [occ, setOcc] = useState([]);
  const [sel, setSel] = useState(getSelBar());
  const [cross, setCross] = useState([]);
  const [products, setProducts] = useState({});
  const [loyalty, setLoyalty] = useState(null);
  const [cupon, setCupon] = useState('');
  const [loading, setLoading] = useState(false);
  const [isGift, setIsGift] = useState(false);
  const [giftMsg, setGiftMsg] = useState('');

  useEffect(() => {
    api.get('/bars').then(setBars).catch(() => {});
    api.get('/occupancy').then(setOcc).catch(() => {});
    api.get('/loyalty/' + sessionToken()).then(setLoyalty).catch(() => {});
    api.get('/menu').then(m => { const map = {}; m.products.forEach(p => map[p.id] = p); setProducts(map); }).catch(() => {});
  }, []);

  useEffect(() => {
    const ids = cartProductIds();
    if (!ids.length) { setCross([]); return; }
    api.get('/recommendations?cart=' + ids.join(',')).then(r => setCross(r.cross_sell || [])).catch(() => {});
  }, [cart.length, JSON.stringify(cart.map(i => i.product_id))]);

  if (cart.length === 0) return html`<${DemoShell} active="/customer"><div class="phone-col">
    <${Topbar} title="Your cart" back=${() => nav('/customer')} />
    <div class="center" style="padding:60px 20px">
      <p class="muted">Your cart is empty.</p>
      <button class="btn primary" onClick=${() => nav('/customer')}>Browse the menu</button>
    </div>
  </div><//>`;

  const subtotal = cartSubtotal();
  const validCoupon = loyalty?.cupones?.find(c => c.cupon === cupon && !c.usado);
  const discount = validCoupon ? Math.round(subtotal * validCoupon.descuento_pct) : 0;
  const total = subtotal - discount;

  const pay = async () => {
    if (!isGift && !sel) { toast('Pick a pickup bar first', 'err'); return; }
    setLoading(true);
    try {
      const body = {
        session: sessionToken(),
        items: cart.map(i => ({ product_id: i.product_id, cantidad: i.cantidad, comentario: i.comentario })),
        bar_id: isGift ? null : sel,
        tipo_pedido: 'normal',
        cupon: (!isGift && validCoupon) ? cupon : null,
        es_regalo: isGift,
        regalo_mensaje: isGift ? giftMsg : ''
      };
      const res = await api.post('/orders', body);
      clearCart();
      nav('/checkout/' + res.order.qr_token);   // simulated Mercado Pago checkout
    } catch (e) {
      toast(e.offline ? 'Offline — try again' : (e.message || 'Error'), 'err');
      setLoading(false);
    }
  };

  return html`<${DemoShell} active="/customer"><div class="phone-col">
    <${Topbar} title="Your order" back=${() => nav('/customer')} />
    <div class="pad stack" style="padding-bottom:40px">
      ${cart.map((i, idx) => html`<div key=${idx} class="prod" style=${`--cat:${catColor(products[i.product_id]?.categoria)}`}>
        <div class="cat-strip"></div>
        <${ProductThumb} p=${products[i.product_id] || { icono: i.icono }} size=${52} />
        <div class="pinfo">
          <div class="row between"><div class="pname">${i.nombre}</div><div class="price">${fmt(i.precio_unit * i.cantidad)}</div></div>
          <div class="row between" style="margin-top:8px">
            <div class="qty">
              <button onClick=${() => setQty(idx, i.cantidad - 1)}>−</button>
              <span class="n">${i.cantidad}</span>
              <button onClick=${() => setQty(idx, i.cantidad + 1)}>+</button>
            </div>
            <button class="btn ghost sm danger" onClick=${() => setQty(idx, 0)}>Remove</button>
          </div>
          ${i.permite_comentario && html`<div class="comment-input">
            <input value=${i.comentario} maxlength="60" placeholder=${i.comentario_placeholder || 'e.g. light ice'}
              onInput=${e => setComment(idx, e.target.value)} />
          </div>`}
        </div>
      </div>`)}

      ${cross.length > 0 && html`<div class="card pad">
        <h3 style="margin:0 0 10px">Add something else?</h3>
        <div class="stack">${cross.map(p => html`<div key=${p.id} class="row between">
          <div class="row" style="gap:10px">
            <${ProductThumb} p=${p} size=${44} />
            <div><div style="font-weight:700;font-size:.95rem">${p.nombre}</div><div class="muted" style="font-size:.8rem">+${fmt(p.precio_actual)}</div></div>
          </div>
          <button class="btn violet sm" onClick=${() => { addToCart(p); toast(p.nombre + ' added ✓'); }}>+ Add</button>
        </div>`)}</div>
      </div>`}

      <div class="card pad">
        <label class="field">For you, or a gift?</label>
        <div class="row">
          <button class="chip ${!isGift ? 'active' : ''}" onClick=${() => setIsGift(false)}>🍸 For me</button>
          <button class="chip ${isGift ? 'active' : ''}" onClick=${() => setIsGift(true)}>🎁 It's a gift</button>
        </div>
        ${isGift && html`<div style="margin-top:12px">
          <label class="field">A note for your friend (optional)</label>
          <input value=${giftMsg} maxlength="140" placeholder="Happy birthday! 🎉" onInput=${e => setGiftMsg(e.target.value)} />
          <p class="muted" style="font-size:.82rem;margin:8px 0 0">After paying you'll get a link to share. Your friend picks the bar and redeems it with their own code.</p>
        </div>`}
      </div>

      ${!isGift && html`<div class="card pad">
        <label class="field">Pickup bar</label>
        <div class="stack">${bars.map(b => html`<${BarPill} key=${b.id} bar=${b} occ=${occ.find(x => x.id === b.id)}
          selected=${sel === b.id} onClick=${() => { setSel(b.id); setSelBar(b.id); }}
          right=${sel === b.id ? I.check('var(--ok)') : null} />`)}</div>
      </div>`}

      ${!isGift && html`<div class="card pad">
        <label class="field">Got a discount code?</label>
        <input value=${cupon} placeholder="WOL-XXXXXX" onInput=${e => setCupon(e.target.value.toUpperCase().trim())} />
        ${loyalty?.cupones?.some(c => !c.usado) && html`<div class="row wrap" style="margin-top:8px">
          ${loyalty.cupones.filter(c => !c.usado).map(c => html`<button key=${c.cupon} class="chip" onClick=${() => setCupon(c.cupon)}>Use ${c.cupon}</button>`)}
        </div>`}
        ${cupon && validCoupon && html`<p style="color:var(--lime);margin:8px 0 0;font-size:.85rem">✓ ${Math.round(validCoupon.descuento_pct * 100)}% off applied</p>`}
        ${cupon && !validCoupon && html`<p style="color:var(--danger);margin:8px 0 0;font-size:.85rem">✗ Invalid or already used</p>`}
      </div>`}

      <div class="card pad">
        <div class="row between"><span class="muted">Subtotal</span><span>${fmt(subtotal)}</span></div>
        ${discount > 0 && html`<div class="row between" style="color:var(--lime)"><span>Discount</span><span>−${fmt(discount)}</span></div>`}
        <div class="divider"></div>
        <div class="row between"><b style="font-size:1.2rem">Total</b><b style="font-size:1.4rem">${fmt(total)}</b></div>
        ${loyalty?.pesos_por_punto && Math.floor(total / loyalty.pesos_por_punto) > 0 && html`
          <div class="row between" style="margin-top:8px;color:var(--violet)">
            <span>⭐ You'll earn</span><b>${Math.floor(total / loyalty.pesos_por_punto)} points</b>
          </div>`}
      </div>
    </div>

    <div class="bottombar">
      <button class="btn primary lg block" disabled=${loading} onClick=${pay}>
        ${loading ? 'Processing…' : html`Pay with Mercado Pago · ${fmt(total)}`}
      </button>
      <p class="center muted" style="font-size:.72rem;margin:8px 0 0">Secure payment · funds go straight to the venue</p>
    </div>
  </div><//>`;
}

// ── Simulated Mercado Pago checkout ──────────────────────────────────────────
// Faithful to Checkout Pro's look so the reader "feels" the real flow, without
// requiring a Mercado Pago account. The production build redirects to the real
// Checkout Pro instead of this screen.
const PAY_METHODS = [
  ['💳', 'Credit card', 'Visa, Mastercard, Amex'],
  ['🏧', 'Debit card', 'Visa Débito, Maestro'],
  ['💰', 'Mercado Pago balance', 'Money in your account'],
  ['🏦', 'Bank transfer', 'Instant via CVU'],
];
export function MPCheckout({ params }) {
  const token = params.token;
  const [order, setOrder] = useState(null);
  const [method, setMethod] = useState(2);
  const [phase, setPhase] = useState('idle'); // idle | paying | approved
  useEffect(() => { api.get('/orders/' + token).then(setOrder).catch(() => {}); }, [token]);
  if (!order) return html`<${Spinner} />`;

  const pay = async () => {
    setPhase('paying');
    try {
      await new Promise(r => setTimeout(r, 1400));           // brief, believable
      await api.post('/orders/' + token + '/pay-sim');
      setPhase('approved');
      setTimeout(() => nav('/order/' + token), 1500);
    } catch (e) { toast('Could not confirm payment', 'err'); setPhase('idle'); }
  };
  const decline = () => nav('/order/' + token + '?declined=1');

  return html`<div class="mp-page">
    <div class="mp-card">
      <div class="mp-head">
        <div class="mp-logo"><span class="mp-hand">🤝</span> mercado pago</div>
        <div class="mp-merchant">HUSH CLUB · via WOL</div>
      </div>

      ${phase === 'approved' ? html`<div class="mp-approved">
        <div class="mp-check">✓</div>
        <h2>Payment approved</h2>
        <p>Generating your pickup code…</p>
      </div>` : html`<div>
        <div class="mp-summary">
          <div class="mp-items">
            ${order.items.map(it => html`<div key=${it.id} class="mp-item"><span>${it.cantidad}× ${it.nombre}</span><span>${fmt(it.precio_unit * it.cantidad)}</span></div>`)}
            ${order.descuento > 0 && html`<div class="mp-item mp-disc"><span>Discount</span><span>−${fmt(order.descuento)}</span></div>`}
          </div>
          <div class="mp-total"><span>You pay</span><b>${fmt(order.monto_total)}</b></div>
        </div>

        <div class="mp-methods">
          ${PAY_METHODS.map(([icon, t, d], i) => html`<label key=${t} class=${'mp-method' + (method === i ? ' on' : '')} onClick=${() => setMethod(i)}>
            <span class="mp-m-icon">${icon}</span>
            <span class="grow"><b>${t}</b><small>${d}</small></span>
            <span class="mp-radio">${method === i ? '●' : ''}</span>
          </label>`)}
        </div>

        <button class="mp-pay" disabled=${phase === 'paying'} onClick=${pay}>
          ${phase === 'paying' ? html`<span class="mp-spin"></span> Processing…` : `Pay ${fmt(order.monto_total)}`}
        </button>
        <button class="mp-decline" onClick=${decline}>Simulate a declined payment</button>
        <div class="mp-note">Demo mode — simulated checkout. The production build runs live Mercado Pago Checkout Pro.</div>
      </div>`}
    </div>
    <button class="btn ghost sm" style="margin-top:14px" onClick=${() => nav('/customer')}>← Back to the menu</button>
  </div>`;
}

// ── Order status ─────────────────────────────────────────────────────────────
export function OrderStatus({ params }) {
  const token = params.token;
  const declined = new URLSearchParams(location.search).get('declined') === '1';
  const [order, setOrder] = useState(null);
  const [qr, setQr] = useState(null);
  const [err, setErr] = useState(false);

  async function load() {
    try { const o = await api.get('/orders/' + token + '?qr=1'); setOrder(o); setQr(o.qr_data_url); setErr(false); }
    catch (e) { if (e.status === 404) setErr(true); }
  }
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [token]);

  if (err) return html`<${DemoShell} active="/customer"><div class="phone-col"><${Topbar} title="Order" back=${() => nav('/customer')} /><div class="center pad"><p>Order not found.</p></div></div><//>`;
  if (!order) return html`<${Spinner} />`;

  const delivered = order.estado === 'entregado';

  // Gift paid but not redeemed → share screen.
  if (order.es_regalo && order.estado === 'regalo_pendiente') {
    const link = location.origin + '/gift/' + order.qr_token;
    const copy = () => { navigator.clipboard?.writeText(link); toast('Link copied ✓'); };
    return html`<${DemoShell} active="/customer"><div class="phone-col">
      <${Topbar} title="Your gift" back=${() => nav('/customer')} />
      <div class="pad stack" style="padding-top:20px">
        <div class="card pad center">
          <div style="font-size:3rem">🎁</div>
          <h2 style="margin:6px 0">Gift paid!</h2>
          <p class="muted">Share this link with your friend. They'll pick a bar and redeem it with their own code.</p>
          <div class="stack" style="margin-top:8px">
            ${order.items.map(it => html`<div key=${it.id}>${it.cantidad}× <b>${it.nombre}</b></div>`)}
          </div>
        </div>
        <button class="btn ok lg block" onClick=${copy}>🔗 Copy the gift link</button>
        <button class="btn block" onClick=${() => nav('/gift/' + order.qr_token)}>Open it as your friend →</button>
        <div class="card pad"><div class="muted" style="font-size:.78rem;word-break:break-all">${link}</div></div>
        ${order.puntos_otorgados > 0 && html`<p class="center" style="color:var(--violet)">⭐ You earned ${order.puntos_otorgados} points with this gift</p>`}
      </div>
    </div><//>`;
  }

  // Payment not confirmed → pending screen (this is exactly what production
  // shows when Mercado Pago hasn't approved a payment: no code, no QR).
  if (order.estado === 'creado') {
    return html`<${DemoShell} active="/customer"><div class="phone-col">
      <${Topbar} title="Your order" back=${() => nav('/customer')} />
      <div class="pad stack" style="padding-top:24px">
        ${declined ? html`<div class="card pad" style="border-color:var(--danger)">
          <b style="color:var(--danger)">✗ Payment declined</b>
          <p class="muted" style="margin:6px 0 0;font-size:.88rem">No pickup code was issued and nothing entered the bar queue — exactly what happens in production when Mercado Pago rejects a card. You can retry the payment below.</p>
        </div>` : html`<div class="card pad center">
          <${Spinner} />
          <h2 style="margin:6px 0">Verifying your payment…</h2>
          <p class="muted">Your pickup code and QR appear the moment the payment is confirmed.</p>
        </div>`}
        <div class="card pad"><h3>Order detail</h3>
          ${order.items.map(it => html`<div key=${it.id} class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)"><div><b>${it.cantidad}×</b> ${it.nombre}</div><div>${fmt(it.precio_unit * it.cantidad)}</div></div>`)}
          <div class="row between" style="padding-top:8px"><b>Total</b><b>${fmt(order.monto_total)}</b></div>
        </div>
        <button class="btn primary block" onClick=${() => nav('/checkout/' + token)}>Retry payment</button>
        <button class="btn ghost block" onClick=${() => nav('/customer')}>Back to the menu</button>
      </div>
    </div><//>`;
  }

  return html`<${DemoShell} active="/customer"><div class="phone-col">
    <${Topbar} title="Your order" back=${() => nav('/customer')} />
    <div class="pad stack" style="padding-bottom:40px">
      ${delivered && html`<div class="card pad center" style="border-color:var(--text-mute);background:var(--surface-2)">
        <div style="font-size:1.3rem;font-weight:900;color:var(--text-mute)">Delivered ✓</div>
        <p class="muted" style="margin:6px 0 0">Picked up${order.delivered_at ? ' at ' + timeHM(order.delivered_at) : ''}. This code is no longer valid.</p>
      </div>`}

      <div class="card pad center reveal">
        ${order.numero_orden && html`<div style="font-weight:800;color:var(--neon-glow);letter-spacing:.05em">ORDER #${order.numero_orden}</div>`}
        <div class="muted" style="font-size:.85rem;margin-top:4px">Your pickup code</div>
        <div class="codigo-big" style=${delivered ? 'opacity:.4;text-decoration:line-through' : ''}>${order.codigo_retiro}</div>
        ${qr && html`<div class="qr-box" style=${delivered ? 'opacity:.4' : ''}><img src=${qr} alt="Order QR code" /></div>`}
        <p class="muted" style="font-size:.8rem;margin-top:12px">Show this code or QR at the bar. Anyone can watch the status — only the bar can deliver it, once.</p>
        ${!delivered && html`<div class="card pad" style="margin-top:14px;border-color:var(--violet);text-align:left">
          <b style="color:var(--violet)">Demo tip:</b>
          <span class="muted" style="font-size:.85rem"> switch to the <b>Bartender view</b> and type code <b style="letter-spacing:.08em">${order.codigo_retiro}</b> to deliver this order yourself.</span>
        </div>`}
      </div>

      <div class="card pad"><${OrderTimeline} estado=${order.estado} order=${order} /></div>

      ${order.bar && html`<div class="card pad" style="border-color:var(--neon)">
        <div class="row" style="gap:10px">${I.mapa('var(--neon-glow)')}<div>
          <b>Pick up at ${order.bar.nombre}</b>
          <div class="muted" style="font-size:.85rem">${order.bar.ubicacion}</div>
        </div></div>
      </div>`}

      <div class="card pad">
        <h3>Order detail</h3>
        ${order.items.map(it => html`<div key=${it.id} class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)">
          <div><b>${it.cantidad}×</b> ${it.nombre}
            ${it.comentario && html`<div class="note-flag" style="margin-top:4px">${I.note('var(--warn)')} ${it.comentario}</div>`}
          </div>
          <div>${fmt(it.precio_unit * it.cantidad)}</div>
        </div>`)}
        ${order.descuento > 0 && html`<div class="row between" style="padding:6px 0;color:var(--lime)"><span>Discount</span><span>−${fmt(order.descuento)}</span></div>`}
        <div class="row between" style="padding-top:8px"><b>Total</b><b>${fmt(order.monto_total)}</b></div>
        ${order.puntos_otorgados > 0 && html`<p style="color:var(--violet);margin:10px 0 0;font-size:.85rem">⭐ You earned ${order.puntos_otorgados} points with this order</p>`}
      </div>

      <button class="btn ghost block" onClick=${() => nav('/customer?tab=orders')}>See all my orders</button>
    </div>
  </div><//>`;
}

// ── Gift redemption (recipient side) ─────────────────────────────────────────
export function GiftRedeem({ params }) {
  const token = params.token;
  const [order, setOrder] = useState(null);
  const [bars, setBars] = useState([]);
  const [occ, setOcc] = useState([]);
  const [sel, setSel] = useState(null);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/orders/' + token).then(setOrder).catch(() => setErr(true));
    api.get('/bars').then(setBars).catch(() => {});
    api.get('/occupancy').then(setOcc).catch(() => {});
  }, [token]);

  if (err) return html`<${DemoShell} active="/customer"><div class="phone-col"><${Topbar} title="Gift" /><div class="center pad"><p>Gift not found.</p></div></div><//>`;
  if (!order) return html`<${Spinner} />`;

  if (order.estado !== 'regalo_pendiente') {
    return html`<${DemoShell} active="/customer"><div class="phone-col">
      <${Topbar} title="Gift" />
      <div class="pad center" style="padding-top:40px">
        <div style="font-size:3rem">🎉</div>
        <h2>This gift was already redeemed</h2>
        <button class="btn primary" onClick=${() => nav('/order/' + token)}>See the order</button>
      </div>
    </div><//>`;
  }

  const redeem = async () => {
    if (!sel) { toast('Pick a pickup bar', 'err'); return; }
    setBusy(true);
    try { await api.post('/orders/' + token + '/redeem-gift', { bar_id: sel }); toast('Gift redeemed! 🍸'); nav('/order/' + token); }
    catch (e) { toast(e.message || 'Error', 'err'); setBusy(false); }
  };

  return html`<${DemoShell} active="/customer"><div class="phone-col">
    <${Topbar} title="Someone got you a drink" />
    <div class="pad stack" style="padding-top:20px;padding-bottom:120px">
      <div class="card pad center">
        <div style="font-size:3rem">🎁</div>
        <h2 style="margin:6px 0">You've been gifted a drink at Hush!</h2>
        ${order.regalo_mensaje && html`<p style="font-style:italic;color:var(--text)">"${order.regalo_mensaje}"</p>`}
      </div>
      <div class="card pad">
        ${order.items.map(it => html`<div key=${it.id} class="row between" style="padding:6px 0">
          <div>${it.cantidad}× <b>${it.nombre}</b></div>
        </div>`)}
      </div>
      <div class="card pad">
        <label class="field">Where will you pick it up?</label>
        <div class="stack">${bars.map(b => html`<${BarPill} key=${b.id} bar=${b} occ=${occ.find(x => x.id === b.id)}
          selected=${sel === b.id} onClick=${() => setSel(b.id)}
          right=${sel === b.id ? I.check('var(--ok)') : null} />`)}</div>
      </div>
    </div>
    <div class="bottombar">
      <button class="btn primary lg block" disabled=${busy} onClick=${redeem}>${busy ? 'Redeeming…' : 'Redeem it now 🍸'}</button>
    </div>
  </div><//>`;
}
