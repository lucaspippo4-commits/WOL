// routes/staff.js — login de staff y operación de bartenders.
import { Router } from 'express';
import { db } from '../db.js';
import { verifyPassword, issueToken, requireAnyStaff } from '../auth.js';
import { serializeOrder } from '../models.js';

const router = Router();

function barsOf(staffId) {
  return db.prepare('SELECT bar_id FROM staff_bars WHERE staff_id = ?').all(staffId).map(r => r.bar_id);
}

// ── Login ────────────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { usuario, password } = req.body || {};
  const s = db.prepare('SELECT * FROM staff WHERE usuario = ? AND activo = 1').get(usuario);
  if (!s || !verifyPassword(password || '', s.pass_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  res.json({
    token: issueToken(s),
    staff: { id: s.id, nombre: s.nombre, usuario: s.usuario, rol: s.rol, barras: barsOf(s.id) }
  });
});

// ── Perfil del staff logueado ─────────────────────────────────────────────────
router.get('/me', requireAnyStaff, (req, res) => {
  const s = req.staff;
  res.json({ id: s.id, nombre: s.nombre, usuario: s.usuario, rol: s.rol, barras: barsOf(s.id) });
});

// ── Cola de pedidos de las barras asignadas al bartender ─────────────────────
router.get('/queue', requireAnyStaff, (req, res) => {
  const bars = barsOf(req.staff.id);
  // Encargados/admin pueden ver todas las barras.
  const allBars = req.staff.rol !== 'bartender';
  let rows, entregados;
  if (allBars) {
    rows = db.prepare(`SELECT * FROM orders WHERE en_cola = 1 AND estado IN ('pagado','listo')
                       ORDER BY paid_at ASC`).all();
    entregados = db.prepare(`SELECT * FROM orders WHERE estado = 'entregado'
                       ORDER BY delivered_at DESC LIMIT 50`).all();
  } else if (bars.length) {
    const ph = bars.map(() => '?').join(',');
    rows = db.prepare(`SELECT * FROM orders WHERE en_cola = 1 AND estado IN ('pagado','listo')
                       AND bar_id IN (${ph}) ORDER BY paid_at ASC`).all(...bars);
    entregados = db.prepare(`SELECT * FROM orders WHERE estado = 'entregado'
                       AND bar_id IN (${ph}) ORDER BY delivered_at DESC LIMIT 50`).all(...bars);
  } else { rows = []; entregados = []; }
  res.json({
    barras: bars, todas: allBars,
    pedidos: rows.map(serializeOrder),
    entregados: entregados.map(serializeOrder)
  });
});

// ── Resolver un código/QR escaneado o tipeado ────────────────────────────────
// Acepta el código corto, el qr_token, o una URL /pedido/<token>.
router.get('/resolve/:code', requireAnyStaff, (req, res) => {
  let code = (req.params.code || '').trim();
  const m = code.match(/\/pedido\/([^/?#]+)/);     // por si escanean la URL completa
  if (m) code = m[1];
  const o = db.prepare('SELECT * FROM orders WHERE qr_token = ? OR codigo_retiro = ? OR UPPER(codigo_retiro) = ?')
    .get(code, code, code.toUpperCase());
  if (!o) return res.status(404).json({ error: 'No se encontró ningún pedido con ese código' });

  const bars = barsOf(req.staff.id);
  const puede = req.staff.rol !== 'bartender' || bars.includes(o.bar_id);
  res.json({
    order: serializeOrder(o),
    puede_operar: puede,                   // si false → modo solo lectura
    aviso: puede ? null : `Este pedido es para ${db.prepare('SELECT nombre FROM bars WHERE id=?').get(o.bar_id)?.nombre}`
  });
});

// ── Transiciones de estado ───────────────────────────────────────────────────
// Flujo simplificado (sin "en preparación"): el bartender solo marca "entregado".
const TS = { listo: 'ready_at', entregado: 'delivered_at' };

function checkPermiso(staff, order) {
  if (staff.rol !== 'bartender') return true;
  return barsOf(staff.id).includes(order.bar_id);
}

router.post('/orders/:id/estado', requireAnyStaff, (req, res) => {
  const { estado, forzar } = req.body || {};
  const validos = ['listo', 'entregado'];
  if (!validos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (!checkPermiso(req.staff, o)) {
    return res.status(403).json({ error: 'Este pedido es de otra barra (solo lectura)' });
  }
  if (o.estado === 'creado') return res.status(409).json({ error: 'El pedido todavía no fue pagado' });

  // Anti-doble-entrega: si ya está entregado, avisar salvo que se fuerce.
  if (estado === 'entregado' && o.estado === 'entregado' && !forzar) {
    return res.status(409).json({
      error: 'YA_ENTREGADO',
      mensaje: `⚠️ Este pedido ya fue entregado a las ${(o.delivered_at || '').slice(11, 16)} hs`,
      order: serializeOrder(o)
    });
  }

  const col = TS[estado];
  db.prepare(`UPDATE orders SET estado = ?, ${col} = datetime('now') WHERE id = ?`).run(estado, o.id);
  res.json({ ok: true, order: serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id)) });
});

// ── Revertir / deshacer entrega (SOLO encargado/admin, no bartenders) ─────────
router.post('/orders/:id/revertir', requireAnyStaff, (req, res) => {
  if (req.staff.rol === 'bartender') {
    return res.status(403).json({ error: 'Solo un encargado/admin puede revertir una entrega' });
  }
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (!checkPermiso(req.staff, o)) return res.status(403).json({ error: 'Este pedido es de otra barra' });
  if (o.estado !== 'entregado') return res.status(400).json({ error: 'El pedido no está entregado' });
  // Revertir vuelve a "pagado" (sin reintroducir estados intermedios).
  db.prepare(`UPDATE orders SET estado = 'pagado', delivered_at = NULL, ready_at = NULL WHERE id = ?`).run(o.id);
  res.json({ ok: true, order: serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id)) });
});

export default router;
