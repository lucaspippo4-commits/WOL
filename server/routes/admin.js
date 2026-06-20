// routes/admin.js — panel de encargado/admin (requiere rol encargado o admin).
import { Router } from 'express';
import QRCode from 'qrcode';
import { db, getConfig, setConfig, getAllConfig, CONFIG_DEFAULTS } from '../db.js';
import { hashPassword, requireAdmin } from '../auth.js';
import { serializeProduct, productById, serializeOrder } from '../models.js';

const router = Router();
router.use(requireAdmin);

// ── Productos ────────────────────────────────────────────────────────────────
router.get('/products', (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY orden, id').all().map(serializeProduct));
});

router.post('/products', (req, res) => {
  const b = req.body || {};
  const maxOrden = db.prepare('SELECT COALESCE(MAX(orden),0) AS m FROM products').get().m;
  const r = db.prepare(`INSERT INTO products
    (nombre,descripcion,categoria,precio_base,precio_min,precio_max,precio_actual,icono,margen,disponible,es_combo,productos_incluidos,permite_comentario,comentario_placeholder,orden,imagen_url,imagen_botella_url)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.nombre || 'Nuevo producto', b.descripcion || '', b.categoria || 'Tragos',
    b.precio_base || 0, b.precio_min || 0, b.precio_max || 0, b.precio_actual ?? b.precio_base ?? 0,
    b.icono || 'vaso', b.margen || 'medio', b.disponible ? 1 : 1, b.es_combo ? 1 : 0,
    b.productos_incluidos || '', b.permite_comentario ? 1 : 0, b.comentario_placeholder || '',
    maxOrden + 1, b.imagen_url || null, b.imagen_botella_url || null);
  res.json(productById(r.lastInsertRowid));
});

router.put('/products/:id', (req, res) => {
  const b = req.body || {};
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe' });
  // El precio se edita libre (min/max quedan en la base pero NO se aplican en esta etapa).
  let precioActual = Math.max(0, b.precio_actual ?? p.precio_actual);
  const min = b.precio_min ?? p.precio_min, max = b.precio_max ?? p.precio_max;
  db.prepare(`UPDATE products SET nombre=?,descripcion=?,categoria=?,precio_base=?,precio_min=?,precio_max=?,
    precio_actual=?,icono=?,margen=?,disponible=?,es_combo=?,productos_incluidos=?,permite_comentario=?,
    comentario_placeholder=?,imagen_url=?,imagen_botella_url=? WHERE id=?`).run(
    b.nombre ?? p.nombre, b.descripcion ?? p.descripcion, b.categoria ?? p.categoria,
    b.precio_base ?? p.precio_base, min, max, precioActual,
    b.icono ?? p.icono, b.margen ?? p.margen,
    (b.disponible ?? !!p.disponible) ? 1 : 0, (b.es_combo ?? !!p.es_combo) ? 1 : 0,
    b.productos_incluidos ?? p.productos_incluidos,
    (b.permite_comentario ?? !!p.permite_comentario) ? 1 : 0,
    b.comentario_placeholder ?? p.comentario_placeholder,
    b.imagen_url ?? p.imagen_url,
    b.imagen_botella_url ?? p.imagen_botella_url, req.params.id);
  res.json(productById(req.params.id));
});

// Ajuste rápido de precio (pricing dinámico, acotado entre min y max).
router.patch('/products/:id/precio', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe' });
  const val = Math.max(0, parseInt(req.body.precio_actual) || 0); // edición libre, sin clamp min/max
  db.prepare('UPDATE products SET precio_actual = ? WHERE id = ?').run(val, p.id);
  res.json(productById(p.id));
});

router.patch('/products/:id/disponible', (req, res) => {
  db.prepare('UPDATE products SET disponible = ? WHERE id = ?').run(req.body.disponible ? 1 : 0, req.params.id);
  res.json(productById(req.params.id));
});

router.post('/products/reorder', (req, res) => {
  const ids = req.body.ids || [];
  const upd = db.prepare('UPDATE products SET orden = ? WHERE id = ?');
  ids.forEach((id, i) => upd.run(i + 1, id));
  res.json({ ok: true });
});

router.delete('/products/:id', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Ofertas / promos ──────────────────────────────────────────────────────────
router.get('/offers', (req, res) => {
  res.json(db.prepare('SELECT * FROM offers ORDER BY id').all().map(o => ({
    ...o, activo: !!o.activo, producto: o.product_id ? productById(o.product_id) : null
  })));
});
router.post('/offers', (req, res) => {
  const b = req.body || {};
  const r = db.prepare(`INSERT INTO offers(nombre,descripcion,product_id,precio_especial,activo,hora_inicio,hora_fin)
    VALUES(?,?,?,?,?,?,?)`).run(b.nombre || 'Oferta', b.descripcion || '', b.product_id || null,
    b.precio_especial || null, b.activo ? 1 : 1, b.hora_inicio || null, b.hora_fin || null);
  res.json(db.prepare('SELECT * FROM offers WHERE id = ?').get(r.lastInsertRowid));
});
router.put('/offers/:id', (req, res) => {
  const b = req.body || {};
  const o = db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'No existe' });
  db.prepare(`UPDATE offers SET nombre=?,descripcion=?,product_id=?,precio_especial=?,activo=?,hora_inicio=?,hora_fin=? WHERE id=?`)
    .run(b.nombre ?? o.nombre, b.descripcion ?? o.descripcion, b.product_id ?? o.product_id,
      b.precio_especial ?? o.precio_especial, (b.activo ?? !!o.activo) ? 1 : 0,
      b.hora_inicio ?? o.hora_inicio, b.hora_fin ?? o.hora_fin, req.params.id);
  res.json(db.prepare('SELECT * FROM offers WHERE id = ?').get(req.params.id));
});
router.delete('/offers/:id', (req, res) => {
  db.prepare('DELETE FROM offers WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Barras ────────────────────────────────────────────────────────────────────
router.get('/bars', (req, res) => {
  const bars = db.prepare('SELECT * FROM bars ORDER BY orden').all();
  res.json(bars.map(b => ({
    ...b,
    bartenders: db.prepare(`SELECT s.id,s.nombre,s.usuario FROM staff s
      JOIN staff_bars sb ON sb.staff_id = s.id WHERE sb.bar_id = ?`).all(b.id)
  })));
});
router.put('/bars/:id', (req, res) => {
  const b = db.prepare('SELECT * FROM bars WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'No existe' });
  db.prepare('UPDATE bars SET nombre = ?, ubicacion = ? WHERE id = ?')
    .run(req.body.nombre ?? b.nombre, req.body.ubicacion ?? b.ubicacion, req.params.id);
  res.json(db.prepare('SELECT * FROM bars WHERE id = ?').get(req.params.id));
});

// ── Staff (usuarios) ──────────────────────────────────────────────────────────
// El admin/encargado SOLO gestiona bartender/encargado/admin. NUNCA founders:
// no los ve, no los crea, no los edita ni elimina. Eso es exclusivo del panel WOL.
const ROLES_ADMIN = ['bartender', 'encargado', 'admin'];

router.get('/staff', (req, res) => {
  const list = db.prepare("SELECT id,nombre,usuario,rol,activo FROM staff WHERE rol != 'founder' ORDER BY id").all();
  res.json(list.map(s => ({
    ...s, activo: !!s.activo,
    barras: db.prepare('SELECT bar_id FROM staff_bars WHERE staff_id = ?').all(s.id).map(r => r.bar_id)
  })));
});
router.post('/staff', (req, res) => {
  const b = req.body || {};
  if (!b.usuario || !b.password) return res.status(400).json({ error: 'Faltan usuario/contraseña' });
  if (!ROLES_ADMIN.includes(b.rol || 'bartender')) return res.status(403).json({ error: 'Rol no permitido' });
  if (db.prepare('SELECT 1 FROM staff WHERE usuario = ?').get(b.usuario))
    return res.status(409).json({ error: 'Usuario ya existe' });
  const r = db.prepare('INSERT INTO staff(nombre,usuario,pass_hash,rol) VALUES(?,?,?,?)')
    .run(b.nombre || b.usuario, b.usuario, hashPassword(b.password), b.rol || 'bartender');
  const id = r.lastInsertRowid;
  (b.barras || []).forEach(bar => db.prepare('INSERT OR IGNORE INTO staff_bars(staff_id,bar_id) VALUES(?,?)').run(id, bar));
  res.json({ ok: true, id });
});
router.put('/staff/:id', (req, res) => {
  const b = req.body || {};
  const s = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'No existe' });
  if (s.rol === 'founder') return res.status(403).json({ error: 'No autorizado' });          // no tocar founders
  if (b.rol && !ROLES_ADMIN.includes(b.rol)) return res.status(403).json({ error: 'Rol no permitido' }); // no promover a founder
  db.prepare('UPDATE staff SET nombre=?,rol=?,activo=? WHERE id=?')
    .run(b.nombre ?? s.nombre, b.rol ?? s.rol, (b.activo ?? !!s.activo) ? 1 : 0, req.params.id);
  if (b.password) db.prepare('UPDATE staff SET pass_hash = ? WHERE id = ?').run(hashPassword(b.password), req.params.id);
  if (Array.isArray(b.barras)) {
    db.prepare('DELETE FROM staff_bars WHERE staff_id = ?').run(req.params.id);
    b.barras.forEach(bar => db.prepare('INSERT OR IGNORE INTO staff_bars(staff_id,bar_id) VALUES(?,?)').run(req.params.id, bar));
  }
  res.json({ ok: true });
});
router.delete('/staff/:id', (req, res) => {
  const s = db.prepare('SELECT rol FROM staff WHERE id = ?').get(req.params.id);
  if (s && s.rol === 'founder') return res.status(403).json({ error: 'No autorizado' });
  db.prepare('DELETE FROM staff WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Dashboard en vivo ─────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  const pagadosFilter = "estado != 'creado' AND estado != 'cancelado'";
  const ventas = db.prepare(`SELECT COUNT(*) AS pedidos, COALESCE(SUM(monto_total),0) AS total
    FROM orders WHERE ${pagadosFilter}`).get();
  const ticket = ventas.pedidos ? Math.round(ventas.total / ventas.pedidos) : 0;
  // NOTA: la comisión de WOL NO se expone al dueño/admin. Solo vive en el panel de founders.

  const porBarra = db.prepare(`SELECT b.id, b.nombre,
      COUNT(o.id) AS pedidos, COALESCE(SUM(o.monto_total),0) AS total,
      SUM(CASE WHEN o.en_cola=1 AND o.estado IN ('pagado','listo') THEN 1 ELSE 0 END) AS pendientes
    FROM bars b LEFT JOIN orders o ON o.bar_id = b.id AND ${pagadosFilter.replace(/estado/g, 'o.estado')}
    GROUP BY b.id ORDER BY b.orden`).all();

  const topProductos = db.prepare(`SELECT oi.nombre, SUM(oi.cantidad) AS unidades, SUM(oi.cantidad*oi.precio_unit) AS recaudado
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.estado != 'creado' AND o.estado != 'cancelado'
    GROUP BY oi.nombre ORDER BY unidades DESC LIMIT 10`).all();

  const estados = db.prepare(`SELECT estado, COUNT(*) AS n FROM orders WHERE estado != 'creado' GROUP BY estado`).all();
  const pendientes = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE en_cola=1 AND estado IN ('pagado','listo')`).get().n;
  const entregados = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE estado='entregado'`).get().n;

  res.json({
    ventas_total: ventas.total, pedidos_total: ventas.pedidos, ticket_promedio: ticket,
    por_barra: porBarra, top_productos: topProductos,
    estados, pendientes, entregados
  });
});

// NOTA: los resultados de encuesta se movieron al panel de Founders (routes/founder.js).
// El admin/encargado ya NO puede verlos.

// ── Configuración (fidelización, reglas) ─────────────────────────────────────
// El admin no ve ni edita la comisión de WOL (vive solo en el panel de founders).
function adminConfigView() {
  const { comision_wol, ...rest } = getAllConfig();
  return rest;
}
router.get('/config', (req, res) => res.json(adminConfigView()));
router.put('/config', (req, res) => {
  const allowed = Object.keys(CONFIG_DEFAULTS).filter(k => k !== 'comision_wol');
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) setConfig(k, v);
  }
  res.json(adminConfigView());
});

// ── Búsqueda manual de pedidos (plan de contingencia) ────────────────────────
router.get('/orders', (req, res) => {
  const q = (req.query.q || '').trim();
  const bar = req.query.bar || '';
  const estado = req.query.estado || '';
  const where = ["estado != 'creado'"]; const params = [];
  if (bar) { where.push('bar_id = ?'); params.push(bar); }
  if (estado) { where.push('estado = ?'); params.push(estado); }
  if (q) {
    const like = '%' + q.toLowerCase() + '%';
    const ids = db.prepare(`SELECT DISTINCT o.id FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE UPPER(o.codigo_retiro) = ?
         OR CAST(o.numero_orden AS TEXT) = ?
         OR CAST(o.monto_total AS TEXT) LIKE ?
         OR LOWER(oi.nombre) LIKE ?
         OR strftime('%H:%M', o.paid_at, 'localtime') LIKE ?`)
      .all(q.toUpperCase(), q, '%' + q + '%', like, '%' + q + '%').map(r => r.id);
    if (!ids.length) return res.json([]);
    where.push('id IN (' + ids.map(() => '?').join(',') + ')'); params.push(...ids);
  }
  const rows = db.prepare(`SELECT * FROM orders WHERE ${where.join(' AND ')}
    ORDER BY COALESCE(paid_at, created_at) DESC LIMIT 60`).all(...params);
  res.json(rows.map(serializeOrder));
});

// Reobtener código + QR de un pedido (para cuando el cliente lo perdió).
router.get('/orders/:id/qr', async (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'No existe' });
  const base = (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const qr = await QRCode.toDataURL(`${base}/pedido/${o.qr_token}`, { margin: 1, width: 320 });
  res.json({ codigo_retiro: o.codigo_retiro, qr_token: o.qr_token, qr_data_url: qr, order: serializeOrder(o) });
});

// Marcar entregado manualmente (con justificación) — respaldo operativo del admin.
router.post('/orders/:id/entregar', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'No existe' });
  if (o.estado === 'creado') return res.status(409).json({ error: 'El pedido no está pago' });
  const motivo = (req.body?.motivo || '').slice(0, 200);
  db.prepare(`UPDATE orders SET estado='entregado', delivered_at=datetime('now'),
    nota_admin=? WHERE id=?`).run(`Entrega manual (${req.staff.usuario}): ${motivo || 'sin nota'}`, o.id);
  res.json({ ok: true, order: serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id)) });
});

// Revertir entrega — SOLO admin/encargado (no bartenders).
router.post('/orders/:id/revertir', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'No existe' });
  if (o.estado !== 'entregado') return res.status(400).json({ error: 'El pedido no está entregado' });
  db.prepare(`UPDATE orders SET estado='pagado', delivered_at=NULL, ready_at=NULL,
    nota_admin=? WHERE id=?`).run(`Entrega revertida por ${req.staff.usuario}`, o.id);
  res.json({ ok: true, order: serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id)) });
});

// NOTA: "Reiniciar noche" se movió al panel de Founders (routes/founder.js).
// El admin/encargado del boliche YA NO tiene acceso a borrar datos de la noche.

// ── Cross-sell (reglas producto → sugerido) ──────────────────────────────────
router.get('/cross-sell', (req, res) => {
  res.json(db.prepare(`SELECT cs.id, cs.trigger_product_id, cs.suggested_product_id,
      t.nombre AS trigger_nombre, s.nombre AS suggested_nombre
    FROM cross_sell cs JOIN products t ON t.id=cs.trigger_product_id
    JOIN products s ON s.id=cs.suggested_product_id ORDER BY cs.id`).all());
});

export default router;
