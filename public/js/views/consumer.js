// views/consumer.js — interfaz pública (consumidor) de WOL.
import { useState, useEffect, useRef } from 'preact/hooks';
import { html, fmt, toast, catColor, timeAr } from '../ui.js';
import { I, ProductIcon } from '../icons.js';
import {
  Topbar, Spinner, FooterWOL, BarMap, BarLegend, ProductCard, ProductThumb, OrderTimeline, nav
} from '../components.js';
import { api } from '../api.js';
import {
  sessionToken, getCart, onCartChange, addToCart, setQty, setComment,
  clearCart, cartCount, cartSubtotal, cartProductIds
} from '../store.js';

const SEL_BAR_KEY = 'wol_bar';
const getSelBar = () => localStorage.getItem(SEL_BAR_KEY);
const setSelBar = (id) => localStorage.setItem(SEL_BAR_KEY, id);

// Hook: re-render cuando cambia el carrito.
function useCart() {
  const [, setN] = useState(0);
  useEffect(() => onCartChange(() => setN(n => n + 1)), []);
  return getCart();
}

// ── Splash ────────────────────────────────────────────────────────────────
export function Splash() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get('/config').then(setCfg).catch(() => {}); }, []);
  return html`<div class="splash">
    <div class="hush"><img src="/assets/hush-logo.jpeg" alt="Hush Club" /></div>
    <h1 class="wol-title">WOL</h1>
    <p style="margin-top:-10px;max-width:300px">${cfg?.nombre_noche || 'Pedí desde tu mesa. Sin filas. Retirá en la barra que quieras.'}</p>
    <button class="btn primary lg block" style="max-width:320px" onClick=${() => nav('/menu')}>Ver carta · Pedir ahora</button>
    <button class="btn ghost" style="max-width:320px" onClick=${() => nav('/menu?tab=mapa')}>Ver mapa del local</button>
    <div class="brand-wol" style="margin-top:30px">POWERED BY WOL</div>
  </div>`;
}

// ── Shell consumidor con tabs ───────────────────────────────────────────────
export function ConsumerApp({ params }) {
  const initialTab = new URLSearchParams(location.search).get('tab') || 'carta';
  const [tab, setTab] = useState(initialTab);
  const cart = useCart();
  const count = cartCount();

  const tabs = [
    { id: 'carta', label: 'Carta', icon: I.carta },
    { id: 'mapa', label: 'Mapa', icon: I.mapa },
    { id: 'pedidos', label: 'Mis pedidos', icon: I.pedido },
    { id: 'noche', label: 'Mi noche', icon: I.noche },
  ];

  return html`<div>
    <${Topbar} title="Hush Club" />
    <div class="pad" style="padding-bottom:120px">
      ${tab === 'carta' && html`<${CartaTab} />`}
      ${tab === 'mapa' && html`<${MapaTab} />`}
      ${tab === 'pedidos' && html`<${PedidosTab} />`}
      ${tab === 'noche' && html`<${NocheTab} />`}
      <${FooterWOL} onContact=${() => nav('/wol')} />
    </div>

    ${count > 0 && html`<div class="bottombar">
      <button class="btn primary lg block" onClick=${() => nav('/carrito')}>
        <span>Ver carrito · ${count} item${count > 1 ? 's' : ''}</span>
        <span class="grow"></span>
        <span>${fmt(cartSubtotal())}</span>
      </button>
    </div>`}

    <div class="tabbar">
      ${tabs.map(t => html`<a key=${t.id} class=${tab === t.id ? 'active' : ''}
        onClick=${(e) => { e.preventDefault(); setTab(t.id); }} href="#">
        ${t.icon(tab === t.id ? 'var(--neon-glow)' : 'currentColor')}<span>${t.label}</span>
      </a>`)}
    </div>
  </div>`;
}

// ── Tab: Carta ──────────────────────────────────────────────────────────────
function CartaTab() {
  const [data, setData] = useState(null);
  const [recs, setRecs] = useState(null);
  const [cat, setCat] = useState('Todos');
  const [q, setQ] = useState('');

  async function load() {
    try {
      const menu = await api.get('/menu');
      // mapear ofertas activas
      const offerMap = {};
      (menu.offers || []).forEach(o => { if (o.product_id && o.precio_especial != null) offerMap[o.product_id] = o.precio_especial; });
      menu.products.forEach(p => { if (offerMap[p.id] != null) p._offer = offerMap[p.id]; });
      setData(menu);
      const r = await api.get('/recommendations');
      const recIds = new Set((r.recomendados || []).map(p => p.id));
      menu.products.forEach(p => { if (recIds.has(p.id)) p._recomendado = true; });
      setRecs(r);
    } catch (e) { /* tolerante a red */ }
  }
  useEffect(() => { load(); }, []);

  if (!data) return html`<${Spinner} />`;

  const onAdd = (p, comentario) => { addToCart(p, comentario); toast(`${p.nombre} agregado ✓`); };
  const cats = ['Todos', ...data.categorias];
  const topIds = new Set((recs?.mas_pedidos || []).map(m => m.id));

  let visible = data.products;
  if (cat !== 'Todos') visible = visible.filter(p => p.categoria === cat);
  if (q) visible = visible.filter(p => p.nombre.toLowerCase().includes(q.toLowerCase()));

  return html`<div class="stack">
    <input placeholder="🔍 Buscar trago…" value=${q} onInput=${e => setQ(e.target.value)} />

    <div class="scroll-x"><div class="row" style="padding-bottom:4px">
      ${cats.map(c => html`<button key=${c} class="chip ${cat === c ? 'active' : ''}" onClick=${() => setCat(c)}>${c}</button>`)}
    </div></div>

    ${cat === 'Todos' && !q && recs?.recomendados?.length > 0 && html`<div>
      <div class="section-title"><h2>⭐ Recomendados para vos</h2></div>
      <div class="stack">${recs.recomendados.slice(0, 3).map(p => {
        const full = data.products.find(x => x.id === p.id) || p;
        return html`<${ProductCard} key=${'r' + p.id} p=${full} onAdd=${onAdd} ranking=${topIds.has(p.id)} />`;
      })}</div>
    </div>`}

    ${cat === 'Todos' && !q && recs?.mas_pedidos?.length > 0 && html`<div>
      <div class="section-title"><h2>🔥 Los más pedidos esta noche</h2></div>
      <div class="stack">${recs.mas_pedidos.slice(0, 3).map(m => {
        const full = data.products.find(x => x.id === m.id);
        return full ? html`<${ProductCard} key=${'m' + m.id} p=${full} onAdd=${onAdd} ranking=${true} />` : null;
      })}</div>
    </div>`}

    <div class="section-title"><h2>${cat === 'Todos' ? 'Toda la carta' : cat}</h2></div>
    <div class="stack">
      ${visible.map(p => html`<${ProductCard} key=${p.id} p=${p} onAdd=${onAdd} ranking=${topIds.has(p.id)} />`)}
      ${visible.length === 0 && html`<p class="center muted">Sin resultados.</p>`}
    </div>
  </div>`;
}

// ── Tab: Mapa ────────────────────────────────────────────────────────────────
function MapaTab() {
  const [bars, setBars] = useState([]);
  const [occ, setOcc] = useState([]);
  const [sel, setSel] = useState(getSelBar());

  async function load() {
    try { setBars(await api.get('/bars')); setOcc(await api.get('/occupancy')); } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const pick = (id) => { setSel(id); setSelBar(id); const b = bars.find(x => x.id === id); toast(`Retirás en ${b?.nombre || id}`); };

  return html`<div class="stack">
    <div class="section-title"><h2>Mapa del local</h2></div>
    <p>Mirá dónde está cada barra y elegí abajo en cuál querés retirar tu pedido.</p>
    <div class="map-wrap"><img src="/assets/plano-local.jpeg" alt="Plano de Hush Club con las 4 barras" style="width:100%;display:block" /></div>
    <${BarLegend} occupancy=${occ} />
    <div class="stack" style="margin-top:8px">
      ${bars.map(b => {
        const o = occ.find(x => x.id === b.id);
        return html`<button key=${b.id} class="bar-pill ${sel === b.id ? 'sel' : ''}" onClick=${() => pick(b.id)}>
          <span class="dot ${o?.color || 'verde'}"></span>
          <span class="grow">
            <div style="font-weight:800">${b.nombre}</div>
            <div class="muted" style="font-size:.8rem">${b.ubicacion}</div>
          </span>
          <span class="muted" style="font-size:.8rem;text-align:right">${o ? o.nivel : ''}<br/>${o ? o.pendientes + ' en cola' : ''}</span>
        </button>`;
      })}
    </div>
    ${sel && html`<button class="btn primary block" onClick=${() => nav('/menu')}>Elegir productos →</button>`}
  </div>`;
}

// ── Tab: Mis pedidos ─────────────────────────────────────────────────────────
function PedidosTab() {
  const [orders, setOrders] = useState(null);
  async function load() { try { setOrders(await api.get(`/sessions/${sessionToken()}/orders`)); } catch {} }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  if (!orders) return html`<${Spinner} />`;
  if (orders.length === 0) return html`<div class="center" style="padding:40px 0">
    <p class="muted">Todavía no hiciste ningún pedido esta noche.</p>
    <button class="btn primary" onClick=${() => nav('/menu')}>Ver la carta</button>
  </div>`;
  return html`<div class="stack">
    <div class="section-title"><h2>Mis pedidos de hoy</h2></div>
    ${orders.map(o => html`<button key=${o.id} class="list-row" style="text-align:left;width:100%;background:var(--surface)"
        onClick=${() => nav('/pedido/' + o.qr_token)}>
      <div class="grow">
        <div class="row between"><b>Código ${o.codigo_retiro}</b><span class="pill-state s-${o.estado}">${estadoLabel(o)}</span></div>
        <div class="muted" style="font-size:.82rem">${o.items.reduce((a, i) => a + i.cantidad, 0)} items · ${o.bar?.nombre} · ${fmt(o.monto_total)}</div>
      </div>
      ${I.back('var(--text-mute)')}
    </button>`)}
  </div>`;
}

function estadoLabel(o) {
  if (o.estado === 'regalo_pendiente') return 'Regalo sin canjear';
  if (o.tipo_pedido === 'pre-pedido' && !o.en_cola && o.estado === 'pagado') return 'Pre-pedido';
  return ({ creado: 'Pago pendiente', pagado: '¡Listo!', listo: '¡Listo!', entregado: 'Entregado', cancelado: 'Cancelado' })[o.estado] || o.estado;
}

// ── Tab: Mi noche (fidelización + encuesta) ─────────────────────────────────
function NocheTab() {
  return html`<div class="stack">
    <${LoyaltyCard} />
    <div class="section-title"><h2>¿Cómo estuvo tu noche?</h2></div>
    <${SurveyForm} />
  </div>`;
}

function LoyaltyCard() {
  const [l, setL] = useState(null);
  useEffect(() => { api.get('/loyalty/' + sessionToken()).then(setL).catch(() => {}); }, []);
  if (!l) return null;
  const pct = Math.min(100, Math.round((l.puntos / l.umbral) * 100));
  return html`<div class="card pad">
    <div class="row between"><h3 style="margin:0">⭐ Puntos de la noche</h3><div style="font-size:1.6rem;font-weight:900">${l.puntos}</div></div>
    <div style="height:10px;background:var(--bg-2);border-radius:999px;overflow:hidden;margin:10px 0">
      <div style=${`height:100%;width:${pct}%;background:linear-gradient(90deg,var(--violet),var(--neon-glow))`}></div>
    </div>
    <p class="muted" style="font-size:.85rem;margin:0">${l.recompensa_texto}</p>
    ${l.cupones?.filter(c => !c.usado).map(c => html`<div key=${c.cupon} class="card pad" style="margin-top:10px;border-color:var(--lime)">
      🎉 <b>¡Recompensa desbloqueada!</b><br/>Usá el cupón <b style="color:var(--lime)">${c.cupon}</b> en tu próximo pedido.
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
      setSent(true); toast('¡Gracias por tu feedback! 🙌');
    } catch { toast('No se pudo enviar', 'err'); }
  };
  if (sent) return html`<div class="card pad center">✅ <b>¡Gracias!</b><br/><span class="muted">Tu opinión ayuda a mejorar la noche.</span></div>`;
  return html`<div class="card pad stack">
    <div>
      <label class="field">Calificá tu experiencia</label>
      <div class="stars">${[1, 2, 3, 4, 5].map(n => html`<span key=${n} onClick=${() => setRating(n)}>${n <= rating ? '⭐' : '☆'}</span>`)}</div>
    </div>
    <div>
      <label class="field">¿Qué trago te gustaría que agreguemos?</label>
      <input value=${sug} onInput=${e => setSug(e.target.value)} placeholder="Ej: Aperol Spritz" />
    </div>
    <div>
      <label class="field">¿Recomendarías usar WOL la próxima vez?</label>
      <div class="row">${[['si', '👍 Sí'], ['tal_vez', '🤔 Tal vez'], ['no', '👎 No']].map(([v, t]) =>
        html`<button key=${v} class="chip ${nps === v ? 'active' : ''}" onClick=${() => setNps(v)}>${t}</button>`)}</div>
    </div>
    <div>
      <label class="field">Comentario (opcional)</label>
      <textarea value=${com} onInput=${e => setCom(e.target.value)} placeholder="Contanos cómo la pasaste…"></textarea>
    </div>
    <button class="btn primary block" disabled=${!rating} onClick=${send}>Enviar</button>
  </div>`;
}

// ── Carrito / Checkout ───────────────────────────────────────────────────────
export function Cart() {
  const cart = useCart();
  const [bars, setBars] = useState([]);
  const [occ, setOcc] = useState([]);
  const [sel, setSel] = useState(getSelBar());
  const [cross, setCross] = useState([]);
  const [products, setProducts] = useState({});
  const [tipo, setTipo] = useState('normal');
  const [loyalty, setLoyalty] = useState(null);
  const [cupon, setCupon] = useState('');
  const [loading, setLoading] = useState(false);
  const [esRegalo, setEsRegalo] = useState(false);
  const [regaloMsg, setRegaloMsg] = useState('');
  const [cfg, setCfg] = useState({ precompra_abierta: true, mp_enabled: false });

  useEffect(() => {
    api.get('/bars').then(setBars).catch(() => {});
    api.get('/occupancy').then(setOcc).catch(() => {});
    api.get('/loyalty/' + sessionToken()).then(setLoyalty).catch(() => {});
    api.get('/config').then(setCfg).catch(() => {});
    api.get('/menu').then(m => { const map = {}; m.products.forEach(p => map[p.id] = p); setProducts(map); }).catch(() => {});
  }, []);

  useEffect(() => {
    const ids = cartProductIds();
    if (!ids.length) { setCross([]); return; }
    api.get('/recommendations?cart=' + ids.join(',')).then(r => setCross(r.cross_sell || [])).catch(() => {});
  }, [cart.length, JSON.stringify(cart.map(i => i.product_id))]);

  if (cart.length === 0) return html`<div>
    <${Topbar} title="Tu carrito" back=${() => nav('/menu')} />
    <div class="center" style="padding:60px 20px">
      <p class="muted">Tu carrito está vacío.</p>
      <button class="btn primary" onClick=${() => nav('/menu')}>Ver la carta</button>
    </div>
  </div>`;

  const subtotal = cartSubtotal();
  const cuponValido = loyalty?.cupones?.find(c => c.cupon === cupon && !c.usado);
  const descuento = cuponValido ? Math.round(subtotal * cuponValido.descuento_pct) : 0;
  const total = subtotal - descuento;

  const pagar = async () => {
    if (!esRegalo && !sel) { toast('Elegí una barra de retiro', 'err'); return; }
    setLoading(true);
    try {
      const body = {
        session: sessionToken(),
        items: cart.map(i => ({ product_id: i.product_id, cantidad: i.cantidad, comentario: i.comentario })),
        bar_id: esRegalo ? null : sel,
        tipo_pedido: 'normal',
        cupon: (!esRegalo && cuponValido) ? cupon : null,
        es_regalo: esRegalo,
        regalo_mensaje: esRegalo ? regaloMsg : ''
      };
      const res = await api.post('/orders', body);
      clearCart();
      // Mercado Pago real → redirige al checkout; si no, al checkout simulado (mock).
      if (res.mp_enabled && res.payment?.initPoint && /^https?:/.test(res.payment.initPoint)) {
        window.location.href = res.payment.initPoint;
      } else {
        nav('/checkout-simulado/' + res.order.qr_token);
      }
    } catch (e) {
      toast(e.offline ? 'Sin conexión, reintentá' : (e.message || 'Error'), 'err');
      setLoading(false);
    }
  };

  return html`<div>
    <${Topbar} title="Tu pedido" back=${() => nav('/menu')} />
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
            <button class="btn ghost sm danger" onClick=${() => setQty(idx, 0)}>Quitar</button>
          </div>
          ${i.permite_comentario && html`<div class="comment-input">
            <input value=${i.comentario} maxlength="60" placeholder=${i.comentario_placeholder || 'Ej: poco hielo'}
              onInput=${e => setComment(idx, e.target.value)} />
          </div>`}
        </div>
      </div>`)}

      ${cross.length > 0 && html`<div class="card pad">
        <h3 style="margin:0 0 10px">¿Sumás algo más?</h3>
        <div class="stack">${cross.map(p => html`<div key=${p.id} class="row between">
          <div class="row" style="gap:10px">
            <${ProductThumb} p=${p} size=${44} />
            <div><div style="font-weight:700;font-size:.95rem">${p.nombre}</div><div class="muted" style="font-size:.8rem">+${fmt(p.precio_actual)}</div></div>
          </div>
          <button class="btn violet sm" onClick=${() => { addToCart(p); toast(p.nombre + ' agregado ✓'); }}>+ Sumar</button>
        </div>`)}</div>
      </div>`}

      <div class="card pad">
        <label class="field">¿Es para vos o lo regalás?</label>
        <div class="row">
          <button class="chip ${!esRegalo ? 'active' : ''}" onClick=${() => setEsRegalo(false)}>🍸 Para mí</button>
          <button class="chip ${esRegalo ? 'active' : ''}" onClick=${() => setEsRegalo(true)}>🎁 Lo regalo</button>
        </div>
        ${esRegalo && html`<div style="margin-top:12px">
          <label class="field">Mensaje para tu amigo (opcional)</label>
          <input value=${regaloMsg} maxlength="140" placeholder="Feliz día del amigo 🎉" onInput=${e => setRegaloMsg(e.target.value)} />
          <p class="muted" style="font-size:.82rem;margin:8px 0 0">Después de pagar vas a recibir un link para compartirle. Tu amigo elige en qué barra retirarlo.</p>
        </div>`}
      </div>

      ${!esRegalo && html`<div class="card pad">
        <label class="field">Barra de retiro</label>
        <div class="stack">${bars.map(b => {
          const o = occ.find(x => x.id === b.id);
          return html`<button key=${b.id} class="bar-pill ${sel === b.id ? 'sel' : ''}" onClick=${() => { setSel(b.id); setSelBar(b.id); }}>
            <span class="dot ${o?.color || 'verde'}"></span>
            <span class="grow"><b>${b.nombre}</b><div class="muted" style="font-size:.78rem">${b.ubicacion}</div></span>
            ${sel === b.id ? I.check('var(--ok)') : ''}
          </button>`;
        })}</div>
      </div>`}

      ${!esRegalo && html`<div class="card pad">
        <label class="field">¿Tenés un código de descuento?</label>
        <input value=${cupon} placeholder="WOL-XXXXXX" onInput=${e => setCupon(e.target.value.toUpperCase().trim())} />
        ${loyalty?.cupones?.some(c => !c.usado) && html`<div class="row wrap" style="margin-top:8px">
          ${loyalty.cupones.filter(c => !c.usado).map(c => html`<button key=${c.cupon} class="chip" onClick=${() => setCupon(c.cupon)}>Usar ${c.cupon}</button>`)}
        </div>`}
        ${cupon && cuponValido && html`<p style="color:var(--lime);margin:8px 0 0;font-size:.85rem">✓ ${Math.round(cuponValido.descuento_pct * 100)}% OFF aplicado</p>`}
        ${cupon && !cuponValido && html`<p style="color:var(--danger);margin:8px 0 0;font-size:.85rem">✗ Código inválido o ya usado</p>`}
      </div>`}

      <div class="card pad">
        <div class="row between"><span class="muted">Subtotal</span><span>${fmt(subtotal)}</span></div>
        ${descuento > 0 && html`<div class="row between" style="color:var(--lime)"><span>Descuento</span><span>−${fmt(descuento)}</span></div>`}
        <div class="divider"></div>
        <div class="row between"><b style="font-size:1.2rem">Total</b><b style="font-size:1.4rem">${fmt(total)}</b></div>
        ${loyalty?.pesos_por_punto && Math.floor(total / loyalty.pesos_por_punto) > 0 && html`
          <div class="row between" style="margin-top:8px;color:var(--violet)">
            <span>⭐ Sumás con esta compra</span><b>${Math.floor(total / loyalty.pesos_por_punto)} puntos</b>
          </div>`}
      </div>
    </div>

    <div class="bottombar">
      <button class="btn primary lg block" disabled=${loading} onClick=${pagar}>
        ${loading ? 'Procesando…' : html`Pagar con Mercado Pago · ${fmt(total)}`}
      </button>
      <p class="center muted" style="font-size:.72rem;margin:8px 0 0">Pago seguro · El dinero va a Hush Club</p>
    </div>
  </div>`;
}

// ── Checkout simulado (representa el checkout de Mercado Pago) ───────────────
export function CheckoutSim({ params }) {
  const token = params.token;
  const [order, setOrder] = useState(null);
  const [paying, setPaying] = useState(false);
  useEffect(() => { api.get('/orders/' + token).then(setOrder).catch(() => {}); }, [token]);
  if (!order) return html`<${Spinner} />`;

  const pagar = async () => {
    setPaying(true);
    try { await api.post('/orders/' + token + '/pay-sim'); nav('/pedido/' + token); }
    catch (e) { toast('Error al confirmar pago', 'err'); setPaying(false); }
  };

  return html`<div>
    <${Topbar} title="Pago" />
    <div class="pad stack" style="padding-top:30px">
      <div class="card pad center">
        <div class="badge off" style="margin-bottom:10px">MODO DEMO · PAGO SIMULADO</div>
        <h2>Mercado Pago</h2>
        <p class="muted" style="font-size:.85rem">Esta pantalla reemplaza al checkout real de Mercado Pago. En producción, acá se abre el pago real (Checkout Pro) y el dinero va a la cuenta de Hush Club.</p>
        <div class="divider"></div>
        <div class="row between"><span class="muted">Pedido</span><b>${order.codigo_retiro}</b></div>
        <div class="row between"><span class="muted">Total a pagar</span><b style="font-size:1.4rem">${fmt(order.monto_total)}</b></div>
      </div>
      <button class="btn ok lg block" disabled=${paying} onClick=${pagar}>${paying ? 'Confirmando…' : '✓ Simular pago aprobado'}</button>
      <button class="btn ghost block" onClick=${() => nav('/menu')}>Cancelar</button>
    </div>
  </div>`;
}

// ── Estado del pedido / "Tu pedido" ─────────────────────────────────────────
export function OrderStatus({ params }) {
  const token = params.token;
  const [order, setOrder] = useState(null);
  const [qr, setQr] = useState(null);
  const [err, setErr] = useState(false);

  async function load() {
    try { const o = await api.get('/orders/' + token + '?qr=1'); setOrder(o); setQr(o.qr_data_url); setErr(false); }
    catch (e) { if (e.status === 404) setErr(true); }
  }
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [token]);

  // Retorno desde el checkout de Mercado Pago (back_url de éxito): confirmar el pago
  // si el webhook todavía no llegó. Nunca confiamos solo en el status del query.
  useEffect(() => {
    const qp = new URLSearchParams(location.search);
    const pid = qp.get('payment_id') || qp.get('collection_id');
    if (pid || qp.get('status')) {
      api.post('/orders/' + token + '/confirm-return', { payment_id: pid }).then(load).catch(() => {});
    }
  }, [token]);

  if (err) return html`<div><${Topbar} title="Pedido" back=${() => nav('/menu')} /><div class="center pad"><p>Pedido no encontrado.</p></div></div>`;
  if (!order) return html`<${Spinner} />`;

  const entregado = order.estado === 'entregado';
  const preEspera = order.tipo_pedido === 'pre-pedido' && !order.en_cola && order.estado === 'pagado';

  const activar = async () => {
    try { await api.post('/orders/' + token + '/activate'); toast('¡Pedido enviado a la barra! 🍸'); load(); }
    catch (e) { toast(e.message || 'Error', 'err'); }
  };

  // Descargar el QR como imagen con el código de retiro escrito debajo (legible).
  const descargarQR = () => {
    if (!qr) return;
    const img = new Image();
    img.onload = () => {
      const pad = 28, qs = img.width || 320, w = qs + pad * 2, h = qs + pad + 92;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, pad, pad, qs, qs);
      ctx.fillStyle = '#000'; ctx.textAlign = 'center';
      ctx.font = '600 18px sans-serif'; ctx.fillText('Código de retiro · Hush Club', w / 2, qs + pad + 30);
      ctx.font = '900 38px monospace'; ctx.fillText(order.codigo_retiro, w / 2, qs + pad + 70);
      const a = document.createElement('a');
      a.href = c.toDataURL('image/png'); a.download = 'WOL-pedido-' + order.codigo_retiro + '.png'; a.click();
      toast('QR descargado ✓');
    };
    img.src = qr;
  };
  // Compartir el pedido con el menú nativo (WhatsApp/Mail/etc.) o copiar el link.
  const compartirPedido = async () => {
    const url = location.origin + '/pedido/' + order.qr_token;
    const text = `Mi pedido en Hush Club 🍸 — código ${order.codigo_retiro}`;
    if (navigator.share) { try { await navigator.share({ title: 'Mi pedido · WOL', text, url }); } catch { } }
    else { navigator.clipboard?.writeText(url); toast('Link copiado ✓'); }
  };

  // Regalo pagado pero todavía sin canjear → pantalla para compartir el link.
  if (order.es_regalo && order.estado === 'regalo_pendiente') {
    const link = location.origin + '/regalo/' + order.qr_token;
    const wa = 'https://wa.me/?text=' + encodeURIComponent('¡Te regalé un trago en Hush Club! 🎁 Canjealo acá: ' + link);
    const copiar = () => { navigator.clipboard?.writeText(link); toast('Link copiado ✓'); };
    return html`<div>
      <${Topbar} title="Tu regalo" back=${() => nav('/menu')} />
      <div class="pad stack" style="padding-top:20px">
        <div class="card pad center">
          <div style="font-size:3rem">🎁</div>
          <h2 style="margin:6px 0">¡Regalo pago!</h2>
          <p class="muted">Compartile este link a tu amigo. Cuando lo abra, elige la barra y lo retira con su propio código.</p>
          <div class="stack" style="margin-top:8px">
            ${order.items.map(it => html`<div key=${it.id}>${it.cantidad}× <b>${it.nombre}</b></div>`)}
          </div>
        </div>
        <a class="btn ok lg block" href=${wa} target="_blank" rel="noopener" style="text-decoration:none">📲 Compartir por WhatsApp</a>
        <button class="btn block" onClick=${copiar}>🔗 Copiar link</button>
        <div class="card pad"><div class="muted" style="font-size:.78rem;word-break:break-all">${link}</div></div>
        ${order.puntos_otorgados > 0 && html`<p class="center" style="color:var(--violet)">⭐ Ganaste ${order.puntos_otorgados} puntos con este regalo</p>`}
      </div>
    </div>`;
  }

  // Pago AÚN no confirmado por Mercado Pago → pantalla de verificación.
  // No se muestra código ni QR hasta que el estado real sea 'pagado'.
  if (order.estado === 'creado') {
    return html`<div>
      <${Topbar} title="Tu pedido" back=${() => nav('/menu')} />
      <div class="pad stack" style="padding-top:24px">
        <div class="card pad center">
          <${Spinner} />
          <h2 style="margin:6px 0">Verificando tu pago…</h2>
          <p class="muted">Estamos confirmando el pago con Mercado Pago. Tu código de retiro y el QR aparecen apenas se acredite (suele tardar unos segundos).</p>
          <p class="muted" style="font-size:.82rem">Si tu pago fue rechazado, podés volver a intentarlo desde la carta.</p>
        </div>
        <div class="card pad"><h3>Detalle</h3>
          ${order.items.map(it => html`<div key=${it.id} class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)"><div><b>${it.cantidad}×</b> ${it.nombre}</div><div>${fmt(it.precio_unit * it.cantidad)}</div></div>`)}
          <div class="row between" style="padding-top:8px"><b>Total</b><b>${fmt(order.monto_total)}</b></div>
        </div>
        <button class="btn block" onClick=${load}>↻ Actualizar estado</button>
        <button class="btn ghost block" onClick=${() => nav('/menu')}>Volver a la carta</button>
      </div>
    </div>`;
  }

  return html`<div>
    <${Topbar} title="Tu pedido" back=${() => nav('/menu')} />
    <div class="pad stack" style="padding-bottom:40px">
      ${entregado && html`<div class="card pad center" style="border-color:var(--text-mute);background:var(--surface-2)">
        <div style="font-size:1.3rem;font-weight:900;color:var(--text-mute)">Entregado ✓</div>
        <p class="muted" style="margin:6px 0 0">Este pedido ya fue retirado${order.delivered_at ? ' a las ' + timeAr(order.delivered_at) + ' hs' : ''}. El código ya no es válido.</p>
      </div>`}

      <div class="card pad center">
        ${order.numero_orden && html`<div style="font-weight:800;color:var(--neon-glow);letter-spacing:.05em">PEDIDO #${order.numero_orden}</div>`}
        <div class="muted" style="font-size:.85rem;margin-top:4px">Tu código de retiro</div>
        <div class="codigo-big" style=${entregado ? 'opacity:.4;text-decoration:line-through' : ''}>${order.codigo_retiro}</div>
        ${qr && html`<div class="qr-box" style=${entregado ? 'opacity:.4' : ''}><img src=${qr} alt="QR del pedido" /></div>`}
        <p class="muted" style="font-size:.8rem;margin-top:12px">Mostrá este código o QR en la barra. Cualquiera puede ver el estado, pero solo la barra puede entregarlo.</p>
        ${!entregado && html`<div style="margin-top:14px">
          <div class="card pad" style="border-color:var(--warn);background:rgba(251,191,36,.08);text-align:left">
            <b style="color:var(--warn)">⚠️ Guardá esta pantalla</b>
            <p class="muted" style="font-size:.82rem;margin:4px 0 0">Sacale una captura o descargá el QR. Lo vas a necesitar para retirar tu pedido en la barra.</p>
          </div>
          <div class="row" style="margin-top:10px">
            <button class="btn grow" onClick=${descargarQR}>⬇ Descargar QR</button>
            <button class="btn grow" onClick=${compartirPedido}>↗ Compartir</button>
          </div>
        </div>`}
      </div>

      ${preEspera && html`<div class="card pad" style="border-color:var(--violet)">
        <b>⏰ Pre-pedido guardado</b>
        <p class="muted" style="font-size:.85rem;margin:6px 0 12px">Está pago y guardado. Cuando estés listo para retirarlo, activalo y entra a la cola de preparación.</p>
        <button class="btn violet block" onClick=${activar}>Quiero que lo preparen ahora</button>
      </div>`}

      ${!preEspera && html`<div class="card pad"><${OrderTimeline} estado=${order.estado} order=${order} /></div>`}

      <div class="card pad" style="border-color:var(--neon)">
        <div class="row" style="gap:10px">${I.mapa('var(--neon-glow)')}<div>
          <b>Retirá en ${order.bar?.nombre}</b>
          <div class="muted" style="font-size:.85rem">${order.bar?.ubicacion}</div>
        </div></div>
      </div>

      <div class="card pad">
        <h3>Detalle</h3>
        ${order.items.map(it => html`<div key=${it.id} class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)">
          <div><b>${it.cantidad}×</b> ${it.nombre}
            ${it.comentario && html`<div class="note-flag" style="margin-top:4px">${I.note('var(--warn)')} ${it.comentario}</div>`}
          </div>
          <div>${fmt(it.precio_unit * it.cantidad)}</div>
        </div>`)}
        ${order.descuento > 0 && html`<div class="row between" style="padding:6px 0;color:var(--lime)"><span>Descuento</span><span>−${fmt(order.descuento)}</span></div>`}
        <div class="row between" style="padding-top:8px"><b>Total</b><b>${fmt(order.monto_total)}</b></div>
        ${order.puntos_otorgados > 0 && html`<p style="color:var(--violet);margin:10px 0 0;font-size:.85rem">⭐ Ganaste ${order.puntos_otorgados} puntos con este pedido</p>`}
      </div>

      <button class="btn ghost block" onClick=${() => nav('/menu?tab=pedidos')}>Ver todos mis pedidos</button>
    </div>
  </div>`;
}

// ── Canje de regalo (receptor, link público /regalo/:token) ─────────────────
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

  if (err) return html`<div><${Topbar} title="Regalo" /><div class="center pad"><p>Regalo no encontrado.</p></div></div>`;
  if (!order) return html`<${Spinner} />`;

  // Ya canjeado → mandamos a la pantalla de estado normal.
  if (order.estado !== 'regalo_pendiente') {
    return html`<div>
      <${Topbar} title="Regalo" />
      <div class="pad center" style="padding-top:40px">
        <div style="font-size:3rem">🎉</div>
        <h2>Este regalo ya fue canjeado</h2>
        <button class="btn primary" onClick=${() => nav('/pedido/' + token)}>Ver el pedido</button>
      </div>
    </div>`;
  }

  const canjear = async () => {
    if (!sel) { toast('Elegí una barra de retiro', 'err'); return; }
    setBusy(true);
    try { await api.post('/orders/' + token + '/redeem-gift', { bar_id: sel }); toast('¡Regalo canjeado! 🍸'); nav('/pedido/' + token); }
    catch (e) { toast(e.message || 'Error', 'err'); setBusy(false); }
  };

  return html`<div>
    <${Topbar} title="Te regalaron un trago" />
    <div class="pad stack" style="padding-top:20px;padding-bottom:120px">
      <div class="card pad center">
        <div style="font-size:3rem">🎁</div>
        <h2 style="margin:6px 0">¡Te regalaron un trago en Hush!</h2>
        ${order.regalo_mensaje && html`<p style="font-style:italic;color:var(--text)">"${order.regalo_mensaje}"</p>`}
      </div>
      <div class="card pad">
        ${order.items.map(it => html`<div key=${it.id} class="row between" style="padding:6px 0">
          <div>${it.cantidad}× <b>${it.nombre}</b></div>
        </div>`)}
      </div>
      <div class="card pad">
        <label class="field">¿En qué barra lo retirás?</label>
        <div class="stack">${bars.map(b => {
          const o = occ.find(x => x.id === b.id);
          return html`<button key=${b.id} class="bar-pill ${sel === b.id ? 'sel' : ''}" onClick=${() => setSel(b.id)}>
            <span class="dot ${o?.color || 'verde'}"></span>
            <span class="grow"><b>${b.nombre}</b><div class="muted" style="font-size:.78rem">${b.ubicacion}</div></span>
            ${sel === b.id ? I.check('var(--ok)') : ''}
          </button>`;
        })}</div>
      </div>
    </div>
    <div class="bottombar">
      <button class="btn primary lg block" disabled=${busy} onClick=${canjear}>${busy ? 'Canjeando…' : 'Canjealo ahora 🍸'}</button>
    </div>
  </div>`;
}

// ── Contacto WOL ─────────────────────────────────────────────────────────────
export function ContactWOL() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get('/config').then(setCfg).catch(() => {}); }, []);
  const c = cfg?.contacto_wol || {};
  return html`<div>
    <${Topbar} title="WOL" back=${() => nav('/menu')} />
    <div class="pad stack" style="padding-top:30px">
      <div class="center"><h1 class="wol-title" style="font-size:3rem">WOL</h1></div>
      <div class="card pad">
        <h2>${c.titulo || '¿Te gustó WOL?'}</h2>
        <p>${c.texto || ''}</p>
        <div class="divider"></div>
        <p>📧 <a href=${'mailto:' + c.email}>${c.email}</a></p>
        <p>📸 ${c.instagram}</p>
      </div>
      <p class="center muted" style="font-size:.8rem">WOL · La experiencia sin filas para tu boliche.</p>
    </div>
  </div>`;
}
