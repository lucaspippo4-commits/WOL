// views/bartender.js — interfaz de bartender. Botones grandes, alto contraste,
// pensada para una mano y poca luz.
import { useState, useEffect, useRef } from 'preact/hooks';
import { html, fmt, toast, timeAr } from '../ui.js';
import { I } from '../icons.js';
import { Topbar, Spinner, nav } from '../components.js';
import { api, getStaffToken, setStaffToken } from '../api.js';

export function BartenderApp() {
  const [me, setMe] = useState(undefined); // undefined=cargando, null=no logueado
  useEffect(() => {
    if (!getStaffToken()) { setMe(null); return; }
    api.get('/staff/me', { auth: true }).then(setMe).catch(() => { setStaffToken(null); setMe(null); });
  }, []);
  if (me === undefined) return html`<${Spinner} />`;
  if (!me) return html`<${StaffLogin} kind="bartender" onLogin=${setMe} />`;
  if (me.rol !== 'bartender' && me.rol !== 'encargado' && me.rol !== 'admin')
    return html`<div class="pad">Sin permisos.</div>`;
  return html`<${Queue} me=${me} onLogout=${() => { setStaffToken(null); nav('/acceso'); }} />`;
}

// ── Login de staff (reutilizado por bartender y admin) ──────────────────────
export function StaffLogin({ kind, onLogin, back }) {
  const [usuario, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    setLoading(true); setErr('');
    try {
      const res = await api.post('/staff/login', { usuario, password });
      setStaffToken(res.token);
      onLogin(res.staff);
    } catch (e) { setErr(e.message || 'Error'); setLoading(false); }
  };
  const titulo = { admin: 'Administración / Encargado', founder: 'Founder', barra: 'Barra / Staff' }[kind] || 'Acceso staff';
  return html`<div class="splash" style="justify-content:flex-start;padding-top:54px">
    <div class="hush" style="width:140px"><img src="/assets/hush-logo.jpeg" /></div>
    <h2>${titulo}</h2>
    <form class="card pad stack" style="width:100%;max-width:360px" onSubmit=${submit}>
      <div><label class="field">Usuario</label><input value=${usuario} onInput=${e => setU(e.target.value)} autocapitalize="none" /></div>
      <div><label class="field">Contraseña</label><input type="password" value=${password} onInput=${e => setP(e.target.value)} /></div>
      ${err && html`<p style="color:var(--danger);margin:0">${err}</p>`}
      <button class="btn primary lg block" disabled=${loading}>${loading ? '…' : 'Ingresar'}</button>
    </form>
    <button class="btn ghost sm" onClick=${back || (() => nav('/'))}>← Volver</button>
  </div>`;
}

// ── Acceso oculto: selector de 4 vistas (Founder / Consumidor / Admin / Barra) ──
const ROLE_CFG = {
  founder: { roles: ['founder'], dest: '/founders', label: 'Founder' },
  admin: { roles: ['encargado', 'admin'], dest: '/admin', label: 'Administración' },
  barra: { roles: ['bartender'], dest: '/barra', label: 'Barra / Staff' },
};
export function AccesoApp() {
  const [mode, setMode] = useState(null); // null = selector; o 'founder'|'admin'|'barra'
  if (!mode) {
    return html`<div class="splash" style="justify-content:flex-start;padding-top:50px">
      <div class="hush" style="width:130px"><img src="/assets/hush-logo.jpeg" /></div>
      <h2 style="margin-bottom:0">Acceso WOL</h2>
      <p class="muted" style="margin-top:4px">Elegí una vista (modo prueba)</p>
      <div style="display:flex;flex-direction:column;gap:12px;width:100%;max-width:340px">
        <button class="btn primary lg block" style="justify-content:flex-start;gap:12px" onClick=${() => nav('/')}>🍸 Consumidor</button>
        <button class="btn violet lg block" style="justify-content:flex-start;gap:12px" onClick=${() => setMode('barra')}>🧑‍🍳 Barra / Staff</button>
        <button class="btn lg block" style="justify-content:flex-start;gap:12px" onClick=${() => setMode('admin')}>📊 Administración / Encargado</button>
        <button class="btn lg block" style="justify-content:flex-start;gap:12px" onClick=${() => setMode('founder')}>🪙 Founder</button>
      </div>
      <button class="btn ghost sm" style="margin-top:18px" onClick=${() => nav('/')}>← Volver a la app</button>
    </div>`;
  }
  const cfg = ROLE_CFG[mode];
  const onLogin = (staff) => {
    if (cfg.roles.includes(staff.rol)) nav(cfg.dest);
    else { setStaffToken(null); toast('Esas credenciales no son de ' + cfg.label, 'err'); }
  };
  return html`<${StaffLogin} kind=${mode} onLogin=${onLogin} back=${() => setMode(null)} />`;
}

// ── Cola de pedidos ──────────────────────────────────────────────────────────
function Queue({ me, onLogout }) {
  const [data, setData] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [detail, setDetail] = useState(null); // {order, puede_operar, aviso}
  const [manual, setManual] = useState('');
  const [offline, setOffline] = useState(false);
  const [tab, setTab] = useState('pend');

  async function load() {
    try { setData(await api.get('/staff/queue', { auth: true })); setOffline(false); }
    catch (e) { if (e.offline) setOffline(true); }
  }
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, []);

  async function resolve(code) {
    if (!code) return;
    try {
      const r = await api.get('/staff/resolve/' + encodeURIComponent(code), { auth: true });
      // Resuelto por escaneo/código → entrega habilitada (verificado).
      setDetail({ ...r, verificado: true }); setScanOpen(false); setManual('');
    } catch (e) { toast(e.message || 'No encontrado', 'err'); }
  }

  if (!data) return html`<${Spinner} />`;

  const right = html`<button class="btn ghost sm" onClick=${onLogout}>⇄ Vista</button>`;
  // Abrir un pedido desde la lista = solo VER (sin poder entregar hasta verificar el código).
  const verPedido = (o) => setDetail({ order: o, puede_operar: true, aviso: null, verificado: false });

  const entregados = data.entregados || [];
  const pendientes = data.pedidos || [];

  return html`<div>
    <${Topbar} title=${me.nombre} right=${right} />
    <div class="pad stack" style="padding-bottom:120px">
      <div class="row between">
        <div><b>${data.todas ? 'Todas las barras' : 'Tus barras'}</b>
          <div class="muted" style="font-size:.8rem">${data.todas ? 'Vista de encargado' : (data.barras || []).join(' · ')}</div>
        </div>
        ${offline && html`<span class="badge out">Sin conexión…</span>`}
      </div>

      <div class="card pad">
        <label class="field">Escaneá o ingresá el código para entregar</label>
        <form class="row" onSubmit=${e => { e.preventDefault(); resolve(manual); }}>
          <input class="grow" style="text-transform:uppercase;font-size:1.3rem;letter-spacing:.1em;font-weight:800"
            value=${manual} placeholder="A1B2C" onInput=${e => setManual(e.target.value.toUpperCase())} />
          <button class="btn primary" type="submit">Buscar</button>
        </form>
        <button class="btn violet block" style="margin-top:10px" onClick=${() => setScanOpen(true)}>${I.scan('#fff')} Escanear QR</button>
      </div>

      <div class="row" style="gap:8px">
        <button class="chip ${tab === 'pend' ? 'active' : ''}" onClick=${() => setTab('pend')}>Pendientes (${pendientes.length})</button>
        <button class="chip ${tab === 'entreg' ? 'active' : ''}" onClick=${() => setTab('entreg')}>Entregados (${entregados.length})</button>
      </div>

      ${tab === 'pend' && html`<div class="stack">
        ${pendientes.length === 0 && html`<p class="center muted" style="padding:30px 0">No hay pedidos en cola 🎉</p>`}
        ${pendientes.map(o => html`<button key=${o.id} class="card pad queue-card s-${o.estado}" style="text-align:left;width:100%"
            onClick=${() => verPedido(o)}>
          <div class="row between">
            <div class="row" style="gap:10px">
              <span class="num-badge" style="min-width:48px;height:34px;font-size:1.05rem">#${o.numero_orden || '—'}</span>
              <b style="font-size:1.1rem">Pedido</b>
            </div>
            <span class="pill-state s-${o.estado}">${estadoTxt(o.estado)}</span>
          </div>
          <div class="muted" style="font-size:.82rem;margin:4px 0">${o.bar?.nombre} · ${timeAr(o.paid_at)} hs${o.es_regalo ? ' · 🎁 regalo' : ''}</div>
          <div>${o.items.map(it => html`<div key=${it.id} style="font-size:.95rem">
            <b>${it.cantidad}×</b> ${it.nombre}
            ${it.comentario && html`<span class="note-flag" style="margin-left:6px;padding:2px 8px">${I.note('var(--warn)')} ${it.comentario}</span>`}
          </div>`)}</div>
        </button>`)}
      </div>`}

      ${tab === 'entreg' && html`<div class="stack">
        ${entregados.length === 0 && html`<p class="center muted" style="padding:30px 0">Todavía no entregaste pedidos.</p>`}
        ${entregados.map(o => html`<button key=${o.id} class="card pad" style="text-align:left;width:100%;opacity:.6"
            onClick=${() => verPedido(o)}>
          <div class="row between">
            <div class="row" style="gap:10px">
              <span class="num-badge" style="background:var(--text-mute);min-width:48px;height:34px;font-size:1.05rem">#${o.numero_orden || '—'}</span>
              <b style="font-size:1rem">Pedido</b>
            </div>
            <span class="pill-state s-entregado">${I.check('var(--ok)')} Entregado</span>
          </div>
          <div style="font-size:.85rem;margin-top:4px">${o.items.map(it => it.cantidad + '× ' + it.nombre).join(', ')}</div>
          <div class="muted" style="font-size:.8rem;margin-top:2px">${o.bar?.nombre} · entregado ${timeAr(o.delivered_at)} hs</div>
        </button>`)}
      </div>`}
    </div>

    ${scanOpen && html`<${Scanner} onCode=${resolve} onClose=${() => setScanOpen(false)} />`}
    ${detail && html`<${OrderDetailModal} data=${detail} onClose=${() => setDetail(null)} onChanged=${() => { load(); }} setDetail=${setDetail} />`}
  </div>`;
}

function estadoTxt(e) { return ({ pagado: 'En cola', listo: 'Listo', entregado: 'Entregado' })[e] || e; }

// ── Modal de detalle de pedido (bartender) ───────────────────────────────────
// El botón ENTREGAR solo aparece si el código de ESTE pedido fue verificado
// (escaneado o tipeado). El bartender NO puede revertir (eso es del admin).
function OrderDetailModal({ data, onClose, onChanged, setDetail }) {
  const { order, puede_operar, aviso, verificado } = data;
  const [busy, setBusy] = useState(false);
  const [conf, setConf] = useState('');

  async function entregar(forzar = false) {
    setBusy(true);
    try {
      const r = await api.post('/staff/orders/' + order.id + '/estado', { estado: 'entregado', forzar }, { auth: true });
      setDetail({ ...data, order: r.order });
      onChanged();
      toast('Entregado ✓'); onClose();
    } catch (e) {
      if (e.data?.error === 'YA_ENTREGADO') {
        if (confirm(e.data.mensaje + '\n\n¿Confirmar entrega igual?')) return entregar(true);
      } else toast(e.message || 'Error', 'err');
    } finally { setBusy(false); }
  }

  // Verificación contra el servidor: el código lo provee el cliente, no la pantalla.
  const confirmarCodigo = async () => {
    const c = conf.trim();
    if (!c) return;
    try {
      const r = await api.get('/staff/resolve/' + encodeURIComponent(c), { auth: true });
      if (r.order.id === order.id) { setDetail({ ...r, verificado: true }); toast('Código verificado ✓'); }
      else toast('Ese código corresponde a otro pedido', 'err');
    } catch (e) { toast('Código incorrecto o inexistente', 'err'); }
  };

  const entregado = order.estado === 'entregado';

  return html`<div class="modal-bg" onClick=${onClose}><div class="modal" onClick=${e => e.stopPropagation()}>
    <div class="row between"><h2 style="margin:0">Pedido ${order.numero_orden ? '#' + order.numero_orden : ''}</h2><button class="btn ghost sm" onClick=${onClose}>✕</button></div>
    <div class="muted" style="margin-bottom:10px">${order.bar?.nombre} · ${fmt(order.monto_total)}${order.es_regalo ? ' · 🎁 regalo' : ''}</div>
    ${verificado && !entregado && html`<div class="card pad" style="border-color:var(--ok);margin-bottom:12px">✓ Código verificado: <b style="letter-spacing:.08em">${order.codigo_retiro}</b></div>`}

    ${!puede_operar && html`<div class="card pad" style="border-color:var(--warn);margin-bottom:12px">
      ⚠️ <b>${aviso || 'Pedido de otra barra'}</b><br/><span class="muted" style="font-size:.85rem">Solo lectura: no podés entregarlo desde tu barra.</span>
    </div>`}

    ${entregado && html`<div class="card pad" style="border-color:var(--text-mute);margin-bottom:12px">
      Este pedido ya fue <b>entregado</b>${order.delivered_at ? ' a las ' + timeAr(order.delivered_at) + ' hs' : ''}.
      ${order.nota_admin ? html`<div class="muted" style="font-size:.8rem;margin-top:4px">${order.nota_admin}</div>` : ''}
    </div>`}

    <div class="card pad" style="margin-bottom:14px">
      ${order.items.map(it => html`<div key=${it.id} style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div class="row between"><div><b style="font-size:1.1rem">${it.cantidad}×</b> ${it.nombre}</div></div>
        ${it.comentario && html`<div class="note-flag" style="margin-top:6px">${I.note('var(--warn)')} <b>${it.comentario}</b></div>`}
      </div>`)}
      <div class="row between" style="padding-top:10px"><b>Total</b><b>${fmt(order.monto_total)}</b></div>
    </div>

    ${puede_operar && !entregado && (
      verificado
        ? html`<button class="btn ok block lg" style="min-height:72px;font-size:1.3rem" disabled=${busy} onClick=${() => entregar()}>${I.check('#04130d')} ENTREGAR</button>`
        : html`<div class="card pad" style="border-color:var(--warn)">
            <b>🔒 Verificá el código para entregar</b>
            <p class="muted" style="font-size:.83rem;margin:6px 0 10px">Escaneá el QR del cliente o ingresá su código de retiro para habilitar la entrega de este pedido.</p>
            <div class="row">
              <input class="grow" style="text-transform:uppercase;font-weight:800" placeholder="Código del cliente"
                value=${conf} onInput=${e => setConf(e.target.value.toUpperCase())} />
              <button class="btn primary" onClick=${confirmarCodigo}>Verificar</button>
            </div>
          </div>`
    )}
  </div></div>`;
}

// ── Escáner de QR con la cámara (jsQR) ──────────────────────────────────────
function Scanner({ onCode, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [error, setError] = useState('');
  const streamRef = useRef(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    let raf;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        streamRef.current = stream;
        const v = videoRef.current;
        v.srcObject = stream; await v.play();
        tick();
      } catch (e) { setError('No se pudo acceder a la cámara. Usá el código manual.'); }
    }
    function tick() {
      if (stoppedRef.current) return;
      const v = videoRef.current, c = canvasRef.current;
      if (v && c && v.readyState === v.HAVE_ENOUGH_DATA && window.jsQR) {
        c.width = v.videoWidth; c.height = v.videoHeight;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const code = window.jsQR(img.data, img.width, img.height);
        if (code && code.data) { stop(); onCode(code.data); return; }
      }
      raf = requestAnimationFrame(tick);
    }
    function stop() {
      stoppedRef.current = true;
      cancelAnimationFrame(raf);
      streamRef.current?.getTracks().forEach(t => t.stop());
    }
    start();
    return stop;
  }, []);

  return html`<div class="modal-bg" onClick=${onClose}><div class="modal" onClick=${e => e.stopPropagation()}>
    <div class="row between"><h2 style="margin:0">Escanear QR</h2><button class="btn ghost sm" onClick=${onClose}>✕</button></div>
    ${error
      ? html`<p style="color:var(--danger)">${error}</p>`
      : html`<p class="muted" style="font-size:.85rem">Apuntá al QR del cliente.</p>`}
    <video ref=${videoRef} class="scan-video" playsinline muted></video>
    <canvas ref=${canvasRef} style="display:none"></canvas>
    <button class="btn ghost block" style="margin-top:12px" onClick=${onClose}>Cancelar</button>
  </div></div>`;
}
