// views/admin.js — panel de encargado/admin.
import { useState, useEffect } from 'preact/hooks';
import { html, fmt, toast, timeAr } from '../ui.js';
import { Topbar, Spinner, nav } from '../components.js';
import { StaffLogin } from './bartender.js';
import { api, getStaffToken, setStaffToken } from '../api.js';

// GET y DELETE toman (url, opts); POST/PUT/PATCH toman (url, body, opts).
const A = (m, u, b) =>
  (m === 'get' || m === 'del') ? api[m](u, { auth: true }) : api[m](u, b, { auth: true });

export function AdminApp() {
  const [me, setMe] = useState(undefined);
  useEffect(() => {
    if (!getStaffToken()) { setMe(null); return; }
    api.get('/staff/me', { auth: true }).then(setMe).catch(() => { setStaffToken(null); setMe(null); });
  }, []);
  if (me === undefined) return html`<${Spinner} />`;
  if (!me) return html`<${StaffLogin} kind="admin" onLogin=${setMe} />`;
  if (me.rol !== 'admin' && me.rol !== 'encargado')
    return html`<div class="pad center" style="padding-top:60px"><p>Este panel es solo para encargados/admin.</p><button class="btn" onClick=${() => { setStaffToken(null); setMe(null); }}>Salir</button></div>`;
  return html`<${AdminShell} me=${me} onLogout=${() => { setStaffToken(null); nav('/acceso'); }} />`;
}

function AdminShell({ me, onLogout }) {
  const [tab, setTab] = useState('dashboard');
  const tabs = [
    ['dashboard', '📊 Dashboard'], ['pedidos', '🔎 Pedidos'], ['carta', '🍸 Carta'], ['ofertas', '% Ofertas'],
    ['barras', '🗺️ Barras'], ['staff', '👥 Staff'], ['config', '⚙️ Config']
  ];
  const right = html`<button class="btn ghost sm" onClick=${onLogout}>⇄ Vista</button>`;
  return html`<div>
    <${Topbar} title=${'Admin · ' + me.nombre} right=${right} />
    <div class="scroll-x" style="position:sticky;top:62px;z-index:20;background:var(--bg);border-bottom:1px solid var(--border)">
      <div class="row" style="padding:10px 12px">
        ${tabs.map(([id, label]) => html`<button key=${id} class="chip ${tab === id ? 'active' : ''}" onClick=${() => setTab(id)}>${label}</button>`)}
      </div>
    </div>
    <div class="pad" style="padding-bottom:60px">
      ${tab === 'dashboard' && html`<${Dashboard} />`}
      ${tab === 'pedidos' && html`<${OrdersAdmin} />`}
      ${tab === 'carta' && html`<${CartaAdmin} />`}
      ${tab === 'ofertas' && html`<${OffersAdmin} />`}
      ${tab === 'barras' && html`<${BarsAdmin} />`}
      ${tab === 'staff' && html`<${StaffAdmin} />`}
      ${tab === 'config' && html`<${ConfigAdmin} />`}
    </div>
  </div>`;
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard() {
  const [d, setD] = useState(null);
  async function load() { try { setD(await A('get', '/admin/dashboard')); } catch {} }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  if (!d) return html`<${Spinner} />`;
  return html`<div class="stack">
    <div class="grid2">
      <div class="kpi"><div class="k">Ventas de la noche</div><div class="v">${fmt(d.ventas_total)}</div></div>
      <div class="kpi"><div class="k">Pedidos</div><div class="v">${d.pedidos_total}</div></div>
      <div class="kpi"><div class="k">Ticket promedio</div><div class="v">${fmt(d.ticket_promedio)}</div></div>
    </div>

    <div class="grid2">
      <div class="kpi"><div class="k">Pendientes</div><div class="v" style="color:var(--warn)">${d.pendientes}</div></div>
      <div class="kpi"><div class="k">Entregados</div><div class="v" style="color:var(--ok)">${d.entregados}</div></div>
    </div>

    <div class="card pad">
      <h3>Ventas por barra</h3>
      <table class="bar-table"><thead><tr><th>Barra</th><th>Pedidos</th><th>En cola</th><th>Total</th></tr></thead>
      <tbody>${d.por_barra.map(b => html`<tr key=${b.id}>
        <td>${b.nombre}</td><td>${b.pedidos}</td>
        <td>${b.pendientes > 5 ? '🔴' : b.pendientes > 2 ? '🟡' : '🟢'} ${b.pendientes}</td>
        <td>${fmt(b.total)}</td></tr>`)}</tbody></table>
    </div>

    <div class="card pad">
      <h3>Top productos</h3>
      ${d.top_productos.length === 0 && html`<p class="muted">Sin ventas todavía.</p>`}
      ${d.top_productos.map((p, i) => html`<div key=${p.nombre} class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)">
        <span>${i + 1}. ${p.nombre}</span><span><b>${p.unidades}</b> u · ${fmt(p.recaudado)}</span>
      </div>`)}
    </div>
  </div>`;
}

// ── Pedidos: búsqueda manual + acciones (respaldo operativo) ─────────────────
function OrdersAdmin() {
  const [q, setQ] = useState('');
  const [bar, setBar] = useState('');
  const [estado, setEstado] = useState('');
  const [rows, setRows] = useState([]);
  const [bars, setBars] = useState([]);
  const [qr, setQr] = useState(null); // {codigo, qr_data_url, order}

  async function load() {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (bar) p.set('bar', bar);
    if (estado) p.set('estado', estado);
    try { setRows(await A('get', '/admin/orders?' + p.toString())); } catch (e) { toast(e.message, 'err'); }
  }
  useEffect(() => { A('get', '/admin/bars').then(setBars).catch(() => {}); load(); }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q, bar, estado]);

  const verQR = async (o) => { try { setQr(await A('get', `/admin/orders/${o.id}/qr`)); } catch (e) { toast(e.message, 'err'); } };
  const entregar = async (o) => {
    const motivo = prompt('Entregar manualmente el pedido ' + o.codigo_retiro + '.\nJustificación (ej. "cliente perdió el QR"):', '');
    if (motivo === null) return;
    try { await A('post', `/admin/orders/${o.id}/entregar`, { motivo }); toast('Marcado entregado ✓'); load(); }
    catch (e) { toast(e.message, 'err'); }
  };
  const revertir = async (o) => {
    if (!confirm('¿Revertir la entrega del pedido ' + o.codigo_retiro + '? Volverá a la cola de la barra.')) return;
    try { await A('post', `/admin/orders/${o.id}/revertir`, {}); toast('Entrega revertida ✓'); load(); }
    catch (e) { toast(e.message, 'err'); }
  };

  const ESTADO_LBL = { pagado: 'En cola', listo: 'Listo', entregado: 'Entregado', regalo_pendiente: 'Regalo s/canjear', cancelado: 'Cancelado' };

  return html`<div class="stack">
    <div class="card pad">
      <label class="field">Buscar pedido (código, N° de orden, producto, monto u hora HH:MM)</label>
      <input value=${q} placeholder="Ej: 7KQ4M · 12 · Fernet · 6000 · 01:15" onInput=${e => setQ(e.target.value)} />
      <div class="row" style="margin-top:10px">
        <select class="grow" value=${bar} onChange=${e => setBar(e.target.value)}>
          <option value="">Todas las barras</option>
          ${bars.map(b => html`<option value=${b.id} selected=${bar === b.id}>${b.nombre}</option>`)}
        </select>
        <select class="grow" value=${estado} onChange=${e => setEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          ${['pagado', 'listo', 'entregado', 'regalo_pendiente'].map(s => html`<option value=${s} selected=${estado === s}>${ESTADO_LBL[s]}</option>`)}
        </select>
      </div>
    </div>

    ${rows.length === 0 && html`<p class="center muted" style="padding:24px 0">Sin resultados.</p>`}
    ${rows.map(o => html`<div key=${o.id} class="card pad">
      <div class="row between">
        <div class="row" style="gap:8px">${o.numero_orden ? html`<span class="num-badge">#${o.numero_orden}</span>` : ''}<b style="letter-spacing:.06em">${o.codigo_retiro}</b></div>
        <span class="pill-state s-${o.estado}">${ESTADO_LBL[o.estado] || o.estado}</span>
      </div>
      <div class="muted" style="font-size:.82rem;margin:4px 0">${o.bar?.nombre || '—'} · ${fmt(o.monto_total)} · ${o.paid_at ? timeAr(o.paid_at) + ' hs' : 's/pago'}${o.es_regalo ? ' · 🎁' : ''}</div>
      <div style="font-size:.9rem">${o.items.map(it => html`<span key=${it.id}>${it.cantidad}× ${it.nombre}${it.comentario ? ' ('+it.comentario+')' : ''}; </span>`)}</div>
      ${o.nota_admin ? html`<div class="muted" style="font-size:.78rem;margin-top:4px">📝 ${o.nota_admin}</div>` : ''}
      <div class="row wrap" style="margin-top:10px">
        <button class="btn sm" onClick=${() => verQR(o)}>Ver código/QR</button>
        ${(o.estado === 'pagado' || o.estado === 'listo') && html`<button class="btn sm ok" onClick=${() => entregar(o)}>Entregar manual</button>`}
        ${o.estado === 'entregado' && html`<button class="btn sm danger" onClick=${() => revertir(o)}>↩ Revertir</button>`}
      </div>
    </div>`)}

    ${qr && html`<div class="modal-bg" onClick=${() => setQr(null)}><div class="modal center" onClick=${e => e.stopPropagation()}>
      <div class="row between"><h2 style="margin:0">Pedido ${qr.codigo_retiro}</h2><button class="btn ghost sm" onClick=${() => setQr(null)}>✕</button></div>
      <div class="codigo-big" style="font-size:2.4rem">${qr.codigo_retiro}</div>
      <div class="qr-box"><img src=${qr.qr_data_url} alt="QR" /></div>
      <p class="muted" style="font-size:.82rem;margin-top:10px">Mostrale este código/QR al cliente o dictáselo para que retire.</p>
    </div></div>`}
  </div>`;
}

// ── Carta (productos + ajuste manual de precio) ──────────────────────────────
function CartaAdmin() {
  const [products, setProducts] = useState(null);
  const [edit, setEdit] = useState(null);
  async function load() { try { setProducts(await A('get', '/admin/products')); } catch {} }
  useEffect(() => { load(); }, []);
  if (!products) return html`<${Spinner} />`;

  async function precio(p, val) {
    try { await A('patch', `/admin/products/${p.id}/precio`, { precio_actual: val }); load(); }
    catch (e) { toast(e.message, 'err'); }
  }
  async function toggle(p) {
    try { await A('patch', `/admin/products/${p.id}/disponible`, { disponible: !p.disponible }); load(); }
    catch (e) { toast(e.message, 'err'); }
  }

  return html`<div class="stack">
    <button class="btn primary block" onClick=${() => setEdit({ nuevo: true, categoria: 'Tragos', icono: 'vaso', margen: 'medio', precio_base: 0, precio_min: 0, precio_max: 0, precio_actual: 0, disponible: true })}>+ Nuevo producto</button>
    ${products.map(p => html`<div key=${p.id} class="card pad">
      <div class="row between">
        <div class="grow"><b>${p.nombre}</b> <span class="muted" style="font-size:.8rem">· ${p.categoria}</span></div>
        <label class="row" style="gap:6px;font-size:.8rem">
          <input type="checkbox" style="width:auto;min-height:auto" checked=${p.disponible} onChange=${() => toggle(p)} /> ${p.disponible ? 'Disp.' : 'Agotado'}
        </label>
      </div>
      <div style="margin-top:10px">
        <label class="field">Precio actual</label>
        <div class="row">
          <input type="number" step="100" min="0" value=${p.precio_actual}
            onChange=${e => precio(p, parseInt(e.target.value) || 0)} />
        </div>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn sm" onClick=${() => setEdit({ ...p })}>Editar</button>
        <button class="btn sm danger" onClick=${async () => { if (confirm('¿Eliminar ' + p.nombre + '?')) { await A('del', '/admin/products/' + p.id); load(); } }}>Eliminar</button>
      </div>
    </div>`)}
    ${edit && html`<${ProductEditor} p=${edit} onClose=${() => setEdit(null)} onSaved=${() => { setEdit(null); load(); }} />`}
  </div>`;
}

function ProductEditor({ p, onClose, onSaved }) {
  const [f, setF] = useState({ ...p });
  const upd = (k, v) => setF(x => ({ ...x, [k]: v }));
  const cats = ['Tragos', 'Combos', 'Cervezas', 'Sin alcohol', 'Extras', 'Kiosco'];
  const iconos = ['vaso_500', 'vaso', 'lata', 'botella', 'hielera', 'kiosco'];
  const save = async () => {
    try {
      if (f.nuevo) await A('post', '/admin/products', f);
      else await A('put', '/admin/products/' + f.id, f);
      toast('Guardado ✓'); onSaved();
    } catch (e) { toast(e.message, 'err'); }
  };
  return html`<div class="modal-bg" onClick=${onClose}><div class="modal" onClick=${e => e.stopPropagation()}>
    <h2>${f.nuevo ? 'Nuevo producto' : 'Editar producto'}</h2>
    <div class="stack">
      <div><label class="field">Nombre</label><input value=${f.nombre || ''} onInput=${e => upd('nombre', e.target.value)} /></div>
      <div><label class="field">Descripción</label><input value=${f.descripcion || ''} onInput=${e => upd('descripcion', e.target.value)} /></div>
      <div class="grid2">
        <div><label class="field">Categoría</label><select value=${f.categoria} onChange=${e => upd('categoria', e.target.value)}>${cats.map(c => html`<option value=${c} selected=${f.categoria === c}>${c}</option>`)}</select></div>
        <div><label class="field">Ícono</label><select value=${f.icono} onChange=${e => upd('icono', e.target.value)}>${iconos.map(c => html`<option value=${c} selected=${f.icono === c}>${c}</option>`)}</select></div>
      </div>
      <div class="grid2">
        <div><label class="field">Precio base</label><input type="number" value=${f.precio_base} onInput=${e => upd('precio_base', +e.target.value)} /></div>
        <div><label class="field">Precio actual</label><input type="number" value=${f.precio_actual} onInput=${e => upd('precio_actual', +e.target.value)} /></div>
      </div>
      <div><label class="field">Productos incluidos (combos)</label><input value=${f.productos_incluidos || ''} onInput=${e => upd('productos_incluidos', e.target.value)} /></div>
      <label class="row" style="gap:8px"><input type="checkbox" style="width:auto;min-height:auto" checked=${!!f.es_combo} onChange=${e => upd('es_combo', e.target.checked)} /> Es combo</label>
      <label class="row" style="gap:8px"><input type="checkbox" style="width:auto;min-height:auto" checked=${!!f.permite_comentario} onChange=${e => upd('permite_comentario', e.target.checked)} /> Permite comentario</label>
      ${f.permite_comentario && html`<div><label class="field">Placeholder del comentario</label><input value=${f.comentario_placeholder || ''} onInput=${e => upd('comentario_placeholder', e.target.value)} placeholder="Ej: poco hielo" /></div>`}
      <div class="row"><button class="btn primary grow" onClick=${save}>Guardar</button><button class="btn ghost" onClick=${onClose}>Cancelar</button></div>
    </div>
  </div></div>`;
}

// ── Ofertas ──────────────────────────────────────────────────────────────────
function OffersAdmin() {
  const [offers, setOffers] = useState(null);
  const [products, setProducts] = useState([]);
  const [edit, setEdit] = useState(null);
  async function load() { try { setOffers(await A('get', '/admin/offers')); setProducts(await A('get', '/admin/products')); } catch {} }
  useEffect(() => { load(); }, []);
  if (!offers) return html`<${Spinner} />`;
  const toggle = async (o) => { await A('put', '/admin/offers/' + o.id, { activo: !o.activo }); load(); };
  return html`<div class="stack">
    <button class="btn primary block" onClick=${() => setEdit({ nuevo: true, activo: true })}>+ Nueva oferta</button>
    ${offers.map(o => html`<div key=${o.id} class="card pad">
      <div class="row between"><b>${o.nombre}</b><span class="badge ${o.activo ? 'new' : 'out'}">${o.activo ? 'Activa' : 'Inactiva'}</span></div>
      <p class="muted" style="margin:6px 0;font-size:.85rem">${o.descripcion}</p>
      ${o.producto && html`<div class="muted" style="font-size:.85rem">${o.producto.nombre}: <b style="color:var(--lime)">${fmt(o.precio_especial)}</b> (antes ${fmt(o.producto.precio_actual)})</div>`}
      ${(o.hora_inicio || o.hora_fin) && html`<div class="muted" style="font-size:.8rem">Vigencia: ${o.hora_inicio || '—'} a ${o.hora_fin || '—'}</div>`}
      <div class="row" style="margin-top:10px">
        <button class="btn sm" onClick=${() => toggle(o)}>${o.activo ? 'Desactivar' : 'Activar'}</button>
        <button class="btn sm" onClick=${() => setEdit({ ...o })}>Editar</button>
        <button class="btn sm danger" onClick=${async () => { if (confirm('¿Eliminar?')) { await A('del', '/admin/offers/' + o.id); load(); } }}>Eliminar</button>
      </div>
    </div>`)}
    ${edit && html`<${OfferEditor} o=${edit} products=${products} onClose=${() => setEdit(null)} onSaved=${() => { setEdit(null); load(); }} />`}
  </div>`;
}
function OfferEditor({ o, products, onClose, onSaved }) {
  const [f, setF] = useState({ ...o });
  const upd = (k, v) => setF(x => ({ ...x, [k]: v }));
  const save = async () => {
    try { if (f.nuevo) await A('post', '/admin/offers', f); else await A('put', '/admin/offers/' + f.id, f); toast('Guardado ✓'); onSaved(); }
    catch (e) { toast(e.message, 'err'); }
  };
  return html`<div class="modal-bg" onClick=${onClose}><div class="modal" onClick=${e => e.stopPropagation()}>
    <h2>${f.nuevo ? 'Nueva oferta' : 'Editar oferta'}</h2>
    <div class="stack">
      <div><label class="field">Nombre</label><input value=${f.nombre || ''} onInput=${e => upd('nombre', e.target.value)} /></div>
      <div><label class="field">Descripción</label><input value=${f.descripcion || ''} onInput=${e => upd('descripcion', e.target.value)} /></div>
      <div><label class="field">Producto</label><select value=${f.product_id} onChange=${e => upd('product_id', +e.target.value)}>
        <option value="">— Ninguno —</option>
        ${products.map(p => html`<option value=${p.id} selected=${f.product_id === p.id}>${p.nombre} (${fmt(p.precio_actual)})</option>`)}
      </select></div>
      <div><label class="field">Precio especial</label><input type="number" value=${f.precio_especial || ''} onInput=${e => upd('precio_especial', +e.target.value)} /></div>
      <div class="grid2">
        <div><label class="field">Hora inicio (opc)</label><input value=${f.hora_inicio || ''} placeholder="22:00" onInput=${e => upd('hora_inicio', e.target.value)} /></div>
        <div><label class="field">Hora fin (opc)</label><input value=${f.hora_fin || ''} placeholder="01:00" onInput=${e => upd('hora_fin', e.target.value)} /></div>
      </div>
      <div class="row"><button class="btn primary grow" onClick=${save}>Guardar</button><button class="btn ghost" onClick=${onClose}>Cancelar</button></div>
    </div>
  </div></div>`;
}

// ── Barras ───────────────────────────────────────────────────────────────────
function BarsAdmin() {
  const [bars, setBars] = useState(null);
  async function load() { try { setBars(await A('get', '/admin/bars')); } catch {} }
  useEffect(() => { load(); }, []);
  if (!bars) return html`<${Spinner} />`;
  const save = async (b, nombre) => { await A('put', '/admin/bars/' + b.id, { nombre }); toast('Guardado ✓'); load(); };
  return html`<div class="stack">
    <p class="muted">Editá el nombre visible de cada barra. El identificador interno (${'barra_1..4'}) queda fijo.</p>
    ${bars.map(b => html`<div key=${b.id} class="card pad">
      <label class="field">${b.id} · ${b.ubicacion}</label>
      <div class="row">
        <input class="grow" id=${'bar-' + b.id} value=${b.nombre} onChange=${e => save(b, e.target.value)} />
      </div>
      <div class="muted" style="font-size:.82rem;margin-top:8px">Bartenders: ${b.bartenders.map(x => x.nombre).join(', ') || '— ninguno —'}</div>
    </div>`)}
  </div>`;
}

// ── Staff ────────────────────────────────────────────────────────────────────
function StaffAdmin() {
  const [staff, setStaff] = useState(null);
  const [bars, setBars] = useState([]);
  const [edit, setEdit] = useState(null);
  async function load() { try { setStaff(await A('get', '/admin/staff')); setBars(await A('get', '/admin/bars')); } catch {} }
  useEffect(() => { load(); }, []);
  if (!staff) return html`<${Spinner} />`;
  return html`<div class="stack">
    <button class="btn primary block" onClick=${() => setEdit({ nuevo: true, rol: 'bartender', activo: true, barras: [] })}>+ Nuevo usuario</button>
    ${staff.map(s => html`<div key=${s.id} class="card pad">
      <div class="row between">
        <div><b>${s.nombre}</b> <span class="muted" style="font-size:.8rem">@${s.usuario} · ${s.rol}</span></div>
        <span class="badge ${s.activo ? 'new' : 'out'}">${s.activo ? 'Activo' : 'Inactivo'}</span>
      </div>
      ${s.rol === 'bartender' && html`<div class="muted" style="font-size:.82rem;margin-top:4px">Barras: ${s.barras.join(', ') || '—'}</div>`}
      <div class="row" style="margin-top:10px">
        <button class="btn sm" onClick=${() => setEdit({ ...s })}>Editar</button>
        <button class="btn sm danger" onClick=${async () => { if (confirm('¿Eliminar usuario?')) { await A('del', '/admin/staff/' + s.id); load(); } }}>Eliminar</button>
      </div>
    </div>`)}
    ${edit && html`<${StaffEditor} s=${edit} bars=${bars} onClose=${() => setEdit(null)} onSaved=${() => { setEdit(null); load(); }} />`}
  </div>`;
}
function StaffEditor({ s, bars, onClose, onSaved }) {
  const [f, setF] = useState({ ...s, password: '' });
  const upd = (k, v) => setF(x => ({ ...x, [k]: v }));
  const toggleBar = (id) => setF(x => ({ ...x, barras: x.barras.includes(id) ? x.barras.filter(b => b !== id) : [...x.barras, id] }));
  const save = async () => {
    try {
      if (f.nuevo) await A('post', '/admin/staff', f);
      else await A('put', '/admin/staff/' + f.id, f);
      toast('Guardado ✓'); onSaved();
    } catch (e) { toast(e.message, 'err'); }
  };
  return html`<div class="modal-bg" onClick=${onClose}><div class="modal" onClick=${e => e.stopPropagation()}>
    <h2>${f.nuevo ? 'Nuevo usuario' : 'Editar usuario'}</h2>
    <div class="stack">
      <div><label class="field">Nombre</label><input value=${f.nombre || ''} onInput=${e => upd('nombre', e.target.value)} /></div>
      ${f.nuevo && html`<div><label class="field">Usuario</label><input value=${f.usuario || ''} autocapitalize="none" onInput=${e => upd('usuario', e.target.value)} /></div>`}
      <div><label class="field">${f.nuevo ? 'Contraseña' : 'Nueva contraseña (vacío = no cambiar)'}</label><input type="password" value=${f.password} onInput=${e => upd('password', e.target.value)} /></div>
      <div><label class="field">Rol</label><select value=${f.rol} onChange=${e => upd('rol', e.target.value)}>
        ${['bartender', 'encargado', 'admin'].map(r => html`<option value=${r} selected=${f.rol === r}>${r}</option>`)}
      </select></div>
      ${!f.nuevo && html`<label class="row" style="gap:8px"><input type="checkbox" style="width:auto;min-height:auto" checked=${!!f.activo} onChange=${e => upd('activo', e.target.checked)} /> Activo</label>`}
      ${f.rol === 'bartender' && html`<div>
        <label class="field">Barras asignadas</label>
        <div class="row wrap">${bars.map(b => html`<button key=${b.id} class="chip ${f.barras.includes(b.id) ? 'active' : ''}" onClick=${() => toggleBar(b.id)}>${b.nombre}</button>`)}</div>
      </div>`}
      <div class="row"><button class="btn primary grow" onClick=${save}>Guardar</button><button class="btn ghost" onClick=${onClose}>Cancelar</button></div>
    </div>
  </div></div>`;
}

// ── Encuestas ────────────────────────────────────────────────────────────────
// NOTA: la vista de Encuestas se movió al panel de Founders (views/founder.js).

// ── Config ───────────────────────────────────────────────────────────────────
function ConfigAdmin() {
  const [c, setC] = useState(null);
  useEffect(() => { A('get', '/admin/config').then(setC).catch(() => {}); }, []);
  if (!c) return html`<${Spinner} />`;
  const upd = (k, v) => setC(x => ({ ...x, [k]: v }));
  const updReg = (k, v) => setC(x => ({ ...x, reglas: { ...x.reglas, [k]: v } }));
  const save = async () => { try { await A('put', '/admin/config', c); toast('Configuración guardada ✓'); } catch (e) { toast(e.message, 'err'); } };
  return html`<div class="stack">
    <div class="card pad">
      <h3>Fidelización</h3>
      <label class="field">Pesos por punto</label>
      <input type="number" value=${c.loyalty_pesos_por_punto} onInput=${e => upd('loyalty_pesos_por_punto', +e.target.value)} />
      <label class="field" style="margin-top:8px">Umbral de recompensa (puntos)</label>
      <input type="number" value=${c.loyalty_umbral} onInput=${e => upd('loyalty_umbral', +e.target.value)} />
      <label class="field" style="margin-top:8px">Descuento recompensa (0.10 = 10%)</label>
      <input type="number" step="0.01" value=${c.loyalty_recompensa_pct} onInput=${e => upd('loyalty_recompensa_pct', +e.target.value)} />
      <label class="field" style="margin-top:8px">Texto de la recompensa</label>
      <input value=${c.loyalty_recompensa_texto} onInput=${e => upd('loyalty_recompensa_texto', e.target.value)} />
    </div>
    <div class="card pad">
      <h3>Reglas de recomendación</h3>
      <p class="muted" style="font-size:.82rem">Qué usa el sistema para sugerir productos. La franja de la noche se determina sola según la hora.</p>
      ${[['momento', 'Por momento de la noche'], ['crosssell', 'Cross-sell (carrito)'], ['ranking', 'Ranking en vivo'], ['stock', 'Ocultar agotados']].map(([k, t]) =>
        html`<label key=${k} class="row between" style="padding:8px 0;border-bottom:1px solid var(--border)">
          <span>${t}</span><input type="checkbox" style="width:auto;min-height:auto" checked=${c.reglas?.[k] !== false} onChange=${e => updReg(k, e.target.checked)} />
        </label>`)}
    </div>
    <div class="card pad">
      <h3>Ocupación</h3>
      <label class="field">Ventana de cálculo (minutos)</label>
      <input type="number" value=${c.occupancy_window_min} onInput=${e => upd('occupancy_window_min', +e.target.value)} />
    </div>
    <button class="btn primary block lg" onClick=${save}>Guardar configuración</button>
  </div>`;
}
