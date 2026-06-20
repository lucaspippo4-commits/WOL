// views/founder.js — panel exclusivo del equipo WOL (rol founder).
import { useState, useEffect } from 'preact/hooks';
import { html, fmt, toast, timeAr } from '../ui.js';
import { Topbar, Spinner, nav } from '../components.js';
import { StaffLogin } from './bartender.js';
import { api, getStaffToken, setStaffToken } from '../api.js';

const A = (m, u, b) => (m === 'get' || m === 'del') ? api[m](u, { auth: true }) : api[m](u, b, { auth: true });

export function FounderApp() {
  const [me, setMe] = useState(undefined);
  useEffect(() => {
    if (!getStaffToken()) { setMe(null); return; }
    api.get('/staff/me', { auth: true }).then(setMe).catch(() => { setStaffToken(null); setMe(null); });
  }, []);
  if (me === undefined) return html`<${Spinner} />`;
  if (!me) return html`<${StaffLogin} kind="founder" onLogin=${setMe} />`;
  if (me.rol !== 'founder')
    return html`<div class="pad center" style="padding-top:60px"><p>Acceso exclusivo del equipo WOL.</p><button class="btn" onClick=${() => { setStaffToken(null); setMe(null); }}>Salir</button></div>`;
  return html`<${FounderShell} me=${me} onLogout=${() => { setStaffToken(null); nav('/acceso'); }} />`;
}

function FounderShell({ me, onLogout }) {
  const [boliches, setBoliches] = useState(null);
  const [sel, setSel] = useState(null);
  useEffect(() => { A('get', '/founder/boliches').then(setBoliches).catch(() => {}); }, []);
  const right = html`<button class="btn ghost sm" onClick=${onLogout}>⇄ Vista</button>`;

  if (!boliches) return html`<${Spinner} />`;

  if (!sel) return html`<div>
    <${Topbar} title="WOL · Founders" right=${right} />
    <div class="pad stack">
      <div class="section-title"><h2>Red de boliches</h2></div>
      <p class="muted">Panel exclusivo del equipo WOL. Nadie del boliche ve esta información.</p>
      ${boliches.map(b => html`<button key=${b.id} class="list-row" style="text-align:left;width:100%;cursor:pointer" onClick=${() => setSel(b)}>
        <img src=${b.logo} alt=${b.nombre} style="width:46px;height:46px;border-radius:10px;object-fit:cover;background:#000" />
        <span class="grow"><b>${b.nombre}</b><div class="muted" style="font-size:.8rem">${b.ciudad}</div></span>
        <span class="badge ${b.activo ? 'new' : 'out'}">${b.activo ? 'Activo' : 'Inactivo'}</span>
      </button>`)}
    </div>
  </div>`;

  return html`<${BolicheStats} boliche=${sel} onBack=${() => setSel(null)} right=${right} />`;
}

function BolicheStats({ boliche, onBack, right }) {
  const [d, setD] = useState(null);
  const [pct, setPct] = useState('');
  async function load() {
    try { const s = await A('get', `/founder/boliches/${boliche.id}/stats`); setD(s); setPct(String(Math.round(s.comision_pct * 100))); } catch {}
  }
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  if (!d) return html`<${Spinner} />`;

  const guardarComision = async () => {
    const v = parseFloat(pct) / 100;
    try { await A('put', '/founder/comision', { comision_wol: v }); toast('Comisión actualizada ✓'); load(); }
    catch (e) { toast(e.message || 'Error', 'err'); }
  };

  const maxHora = Math.max(1, ...d.por_hora.map(h => h.pedidos));

  return html`<div>
    <${Topbar} title=${boliche.nombre} back=${onBack} right=${right} />
    <div class="pad stack" style="padding-bottom:60px">
      <div class="row" style="gap:10px">
        <img src=${boliche.logo} style="width:40px;height:40px;border-radius:8px;object-fit:cover;background:#000" />
        <div><b>${boliche.nombre}</b><div class="muted" style="font-size:.8rem">${boliche.ciudad}</div></div>
      </div>

      <!-- Comisión: lo que nos deja -->
      <div class="card pad" style="border-color:var(--neon)">
        <div class="k" style="font-size:.78rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.04em">Comisión WOL generada</div>
        <div style="font-size:2.2rem;font-weight:900;color:var(--neon-glow)">${fmt(d.comision_total)}</div>
        <div class="muted" style="font-size:.82rem">${Math.round(d.comision_pct * 100)}% sobre ${fmt(d.volumen_transaccionado)} transaccionados</div>
      </div>

      <!-- Control del % (solo founders) -->
      <div class="card pad">
        <h3>Comisión por transacción</h3>
        <label class="field">Porcentaje que cobra WOL (%)</label>
        <div class="row">
          <input class="grow" type="number" step="0.5" min="0" max="50" value=${pct} onInput=${e => setPct(e.target.value)} />
          <button class="btn primary" onClick=${guardarComision}>Guardar</button>
        </div>
        <p class="muted" style="font-size:.8rem;margin:8px 0 0">Este control existe solo acá. El dueño del boliche no ve ni edita la comisión.</p>
      </div>

      <!-- Métricas de negocio -->
      <div class="grid2">
        <div class="kpi"><div class="k">Volumen transaccionado</div><div class="v">${fmt(d.volumen_transaccionado)}</div></div>
        <div class="kpi"><div class="k">Pedidos</div><div class="v">${d.pedidos_total}</div></div>
        <div class="kpi"><div class="k">Ticket promedio</div><div class="v">${fmt(d.ticket_promedio)}</div></div>
        <div class="kpi"><div class="k">Clientes (adopción)</div><div class="v">${d.adopcion}</div></div>
      </div>

      <div class="card pad">
        <h3>Comisión por barra</h3>
        <table class="bar-table"><thead><tr><th>Barra</th><th>Pedidos</th><th>Volumen</th><th>Comisión</th></tr></thead>
        <tbody>${d.por_barra.map(b => html`<tr key=${b.nombre}><td>${b.nombre}</td><td>${b.pedidos}</td><td>${fmt(b.total)}</td><td style="color:var(--neon-glow)">${fmt(b.comision)}</td></tr>`)}</tbody></table>
      </div>

      <div class="card pad">
        <h3>Horarios pico</h3>
        ${d.por_hora.length === 0 ? html`<p class="muted">Sin datos todavía.</p>` : d.por_hora.map(h => html`<div key=${h.hora} class="row" style="gap:8px;margin:4px 0">
          <span style="width:48px">${String(h.hora).padStart(2, '0')}:00</span>
          <div class="grow" style="height:12px;background:var(--bg-2);border-radius:999px;overflow:hidden"><div style=${`height:100%;width:${h.pedidos / maxHora * 100}%;background:linear-gradient(90deg,var(--violet),var(--neon-glow))`}></div></div>
          <span style="width:60px;text-align:right">${h.pedidos} ped.</span>
        </div>`)}
      </div>

      <div class="card pad">
        <h3>Productos más vendidos</h3>
        ${d.top_productos.length === 0 ? html`<p class="muted">Sin ventas todavía.</p>` : d.top_productos.map((p, i) => html`<div key=${p.nombre} class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)">
          <span>${i + 1}. ${p.nombre}</span><span><b>${p.unidades}</b> u · ${fmt(p.recaudado)}</span>
        </div>`)}
      </div>

      <${EncuestasFounder} boliche=${boliche} />
      <${ResetNoche} boliche=${boliche} onChanged=${load} />
    </div>
  </div>`;
}

// ── Encuestas de fin de noche (solo Founders) ────────────────────────────────
function EncuestasFounder({ boliche }) {
  const [d, setD] = useState(null);
  useEffect(() => { A('get', `/founder/boliches/${boliche.id}/surveys`).then(setD).catch(() => {}); }, []);
  if (!d) return null;
  return html`<div class="card pad">
    <h3>⭐ Encuesta de fin de noche</h3>
    <div class="grid2" style="margin:6px 0 10px">
      <div class="kpi"><div class="k">Respuestas</div><div class="v">${d.total}</div></div>
      <div class="kpi"><div class="k">Promedio</div><div class="v">${d.promedio} ⭐</div></div>
    </div>
    ${d.distribucion.slice().reverse().map(x => html`<div key=${x.estrellas} class="row" style="gap:8px;margin:4px 0">
      <span style="width:34px">${x.estrellas}⭐</span>
      <div class="grow" style="height:12px;background:var(--bg-2);border-radius:999px;overflow:hidden"><div style=${`height:100%;width:${d.total ? (x.n / d.total * 100) : 0}%;background:var(--neon-glow)`}></div></div>
      <span style="width:24px;text-align:right">${x.n}</span>
    </div>`)}
    <div style="margin-top:10px"><b>NPS:</b> 👍 ${d.nps.si} · 🤔 ${d.nps.tal_vez} · 👎 ${d.nps.no}</div>
    ${d.sugerencias.length > 0 && html`<div style="margin-top:10px"><b>Tragos sugeridos:</b>
      ${d.sugerencias.map((s, i) => html`<div key=${i} class="muted" style="font-size:.85rem">• ${s}</div>`)}</div>`}
    ${d.comentarios.length > 0 && html`<div style="margin-top:10px"><b>Comentarios:</b>
      ${d.comentarios.map((c, i) => html`<div key=${i} style="padding:6px 0;border-bottom:1px solid var(--border)">
        <div>${c.rating ? '⭐'.repeat(c.rating) : ''} <span class="muted" style="font-size:.78rem">${timeAr(c.fecha)}</span></div>${c.comentario}
      </div>`)}</div>`}
    ${d.total === 0 && html`<p class="muted" style="font-size:.85rem">Sin respuestas todavía.</p>`}
  </div>`;
}

// ── Reiniciar noche (exclusivo de Founders) con confirmación reforzada + undo ──
function ResetNoche({ boliche, onChanged }) {
  const [backups, setBackups] = useState([]);
  const [modal, setModal] = useState(false);
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadBk() { try { setBackups(await A('get', `/founder/boliches/${boliche.id}/backups`)); } catch {} }
  useEffect(() => { loadBk(); }, []);

  const reiniciar = async () => {
    setBusy(true);
    try {
      const r = await A('post', `/founder/boliches/${boliche.id}/reset-noche`, { confirm: txt });
      toast(`Noche reiniciada · respaldo de ${r.respaldado.pedidos} pedidos guardado`);
      setModal(false); setTxt(''); loadBk(); onChanged && onChanged();
    } catch (e) { toast(e.message || 'Error', 'err'); } finally { setBusy(false); }
  };
  const restaurar = async (bk) => {
    if (!confirm(`¿Restaurar el respaldo del ${timeAr(bk.created_at)}? Reemplaza los datos actuales de la noche por los de ese respaldo (${bk.pedidos} pedidos).`)) return;
    try { await A('post', `/founder/backups/${bk.id}/restore`, {}); toast('Datos restaurados ✓'); loadBk(); onChanged && onChanged(); }
    catch (e) { toast(e.message || 'Error', 'err'); }
  };

  return html`<div class="card pad" style="border-color:var(--danger)">
    <h3 style="color:var(--danger)">⚠️ Reiniciar noche</h3>
    <p class="muted" style="font-size:.85rem">Borra pedidos, ventas, encuestas y puntos de esta noche (conserva carta, usuarios y configuración). Antes de borrar se guarda un respaldo recuperable por 48 h.</p>
    <button class="btn danger block" onClick=${() => { setTxt(''); setModal(true); }}>🗑️ Reiniciar noche de ${boliche.nombre}</button>

    ${backups.length > 0 && html`<div style="margin-top:14px">
      <label class="field">Respaldos recientes (deshacer)</label>
      ${backups.map(bk => html`<div key=${bk.id} class="row between" style="padding:8px 0;border-bottom:1px solid var(--border)">
        <div><b>${timeAr(bk.created_at)}</b> <span class="muted" style="font-size:.8rem">· ${bk.pedidos} pedidos · ${fmt(bk.ventas)}${bk.restored_at ? ' · restaurado' : ''}</span></div>
        <button class="btn sm" onClick=${() => restaurar(bk)}>Restaurar</button>
      </div>`)}
    </div>`}

    ${modal && html`<div class="modal-bg" onClick=${() => setModal(false)}><div class="modal" onClick=${e => e.stopPropagation()}>
      <h2 style="color:var(--danger)">Reiniciar noche de ${boliche.nombre}</h2>
      <p>Esto borra TODOS los pedidos y ventas de la noche actual. Se guardará un respaldo para poder deshacerlo.</p>
      <label class="field">Para confirmar, escribí <b>CONFIRMAR</b></label>
      <input value=${txt} onInput=${e => setTxt(e.target.value)} placeholder="CONFIRMAR" autocapitalize="characters" />
      <div class="row" style="margin-top:14px">
        <button class="btn danger grow" disabled=${busy || txt.trim().toUpperCase() !== 'CONFIRMAR'} onClick=${reiniciar}>${busy ? 'Reiniciando…' : 'Sí, reiniciar'}</button>
        <button class="btn ghost" onClick=${() => setModal(false)}>Cancelar</button>
      </div>
    </div></div>`}
  </div>`;
}
