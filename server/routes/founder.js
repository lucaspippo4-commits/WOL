// routes/founder.js — panel exclusivo del equipo WOL (rol `founder`).
// Acá vive TODA la información de comisión (no se expone al dueño ni al staff).
import { Router } from 'express';
import { db, getConfig, setConfig } from '../db.js';
import { requireFounder } from '../auth.js';

const router = Router();
router.use(requireFounder);

// Lista de boliches en la red (hoy: solo Hush Club; preparado para multi-boliche).
router.get('/boliches', (req, res) => {
  res.json([
    { id: 'hush', nombre: 'Hush Club', ciudad: 'Venado Tuerto, Santa Fe', logo: '/assets/hush-logo.jpeg', activo: true }
  ]);
});

// Métricas de negocio de WOL para un boliche.
router.get('/boliches/:id/stats', (req, res) => {
  const pct = getConfig('comision_wol');
  const FILT = "estado != 'creado' AND estado != 'cancelado' AND estado != 'regalo_pendiente'";

  const ventas = db.prepare(`SELECT COUNT(*) AS pedidos, COALESCE(SUM(monto_total),0) AS total FROM orders WHERE ${FILT}`).get();
  const ticket = ventas.pedidos ? Math.round(ventas.total / ventas.pedidos) : 0;
  const comision_total = Math.round(ventas.total * pct);

  // Adopción: sesiones (clientes) únicas que generaron al menos un pedido pago.
  const adopcion = db.prepare(`SELECT COUNT(DISTINCT session_token) AS n FROM orders WHERE ${FILT}`).get().n;

  // Top productos.
  const top = db.prepare(`SELECT oi.nombre, SUM(oi.cantidad) AS unidades, SUM(oi.cantidad*oi.precio_unit) AS recaudado
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.estado != 'creado' AND o.estado != 'cancelado' AND o.estado != 'regalo_pendiente'
    GROUP BY oi.nombre ORDER BY unidades DESC LIMIT 10`).all();

  // Ventas y comisión por barra.
  const porBarra = db.prepare(`SELECT b.nombre, COUNT(o.id) AS pedidos, COALESCE(SUM(o.monto_total),0) AS total
    FROM bars b LEFT JOIN orders o ON o.bar_id = b.id AND o.estado != 'creado' AND o.estado != 'cancelado' AND o.estado != 'regalo_pendiente'
    GROUP BY b.id ORDER BY b.orden`).all().map(b => ({ ...b, comision: Math.round(b.total * pct) }));

  // Distribución por hora (horarios pico) — hora local del pago.
  const porHora = db.prepare(`SELECT CAST(strftime('%H', paid_at, 'localtime') AS INTEGER) AS hora,
      COUNT(*) AS pedidos, COALESCE(SUM(monto_total),0) AS total
    FROM orders WHERE paid_at IS NOT NULL AND ${FILT} GROUP BY hora ORDER BY hora`).all();

  res.json({
    comision_pct: pct,
    comision_total,
    volumen_transaccionado: ventas.total,
    pedidos_total: ventas.pedidos,
    ticket_promedio: ticket,
    adopcion,
    top_productos: top,
    por_barra: porBarra,
    por_hora: porHora
  });
});

// ── Resultados de la encuesta de fin de noche (solo founders) ────────────────
router.get('/boliches/:id/surveys', (req, res) => {
  const rows = db.prepare('SELECT * FROM surveys ORDER BY id DESC').all();
  const ratings = rows.filter(r => r.rating).map(r => r.rating);
  const promedio = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : 0;
  const dist = [1, 2, 3, 4, 5].map(n => ({ estrellas: n, n: ratings.filter(r => r === n).length }));
  const nps = { si: 0, no: 0, tal_vez: 0 };
  rows.forEach(r => { if (r.nps && nps[r.nps] != null) nps[r.nps]++; });
  res.json({
    total: rows.length, promedio: Math.round(promedio * 10) / 10, distribucion: dist, nps,
    sugerencias: rows.filter(r => r.sugerencia_trago).map(r => r.sugerencia_trago),
    comentarios: rows.filter(r => r.comentario).map(r => ({ comentario: r.comentario, rating: r.rating, fecha: r.created_at }))
  });
});

// ── Reiniciar noche (SOLO founders) con snapshot para deshacer ───────────────
const NIGHT_TABLES_DEL = ['order_items', 'orders', 'surveys', 'loyalty', 'loyalty_redemptions'];
const NIGHT_TABLES_INS = ['orders', 'order_items', 'surveys', 'loyalty', 'loyalty_redemptions'];

router.post('/boliches/:id/reset-noche', (req, res) => {
  // Confirmación reforzada también en el servidor.
  const confirm = (req.body?.confirm || '').trim().toUpperCase();
  if (confirm !== 'CONFIRMAR' && confirm !== 'HUSH CLUB') {
    return res.status(400).json({ error: 'Confirmación inválida' });
  }
  // 1) Snapshot de toda la data de la noche (para poder deshacer).
  const snap = {};
  for (const t of NIGHT_TABLES_INS) snap[t] = db.prepare(`SELECT * FROM ${t}`).all();
  const pedidos = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE estado NOT IN ('creado','cancelado','regalo_pendiente')").get().n;
  const ventas = db.prepare("SELECT COALESCE(SUM(monto_total),0) AS t FROM orders WHERE estado NOT IN ('creado','cancelado','regalo_pendiente')").get().t;
  const bk = db.prepare('INSERT INTO night_backups(label,pedidos,ventas,payload) VALUES(?,?,?,?)')
    .run(`Reset ${req.staff.usuario}`, pedidos, ventas, JSON.stringify(snap));

  // 2) Borrar la data de la noche (conserva carta, usuarios, config, ofertas).
  db.exec('BEGIN');
  try {
    for (const t of NIGHT_TABLES_DEL) db.exec(`DELETE FROM ${t}`);
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('orders','order_items','surveys','loyalty_redemptions')");
    // Limpiar backups viejos (>48 h), conservando el recién creado.
    db.prepare("DELETE FROM night_backups WHERE created_at < datetime('now','-2 days')").run();
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: 'Error al reiniciar', detalle: e.message }); }

  res.json({ ok: true, backup_id: bk.lastInsertRowid, respaldado: { pedidos, ventas } });
});

// Listar respaldos disponibles para deshacer.
router.get('/boliches/:id/backups', (req, res) => {
  const rows = db.prepare(`SELECT id, created_at, label, pedidos, ventas, restored_at
    FROM night_backups ORDER BY id DESC LIMIT 20`).all();
  res.json(rows);
});

// Restaurar (deshacer un reset): vuelve a cargar la data del snapshot.
router.post('/backups/:id/restore', (req, res) => {
  const bk = db.prepare('SELECT * FROM night_backups WHERE id = ?').get(req.params.id);
  if (!bk) return res.status(404).json({ error: 'Respaldo no encontrado' });
  let snap;
  try { snap = JSON.parse(bk.payload); } catch { return res.status(500).json({ error: 'Respaldo corrupto' }); }

  db.exec('BEGIN');
  try {
    for (const t of NIGHT_TABLES_DEL) db.exec(`DELETE FROM ${t}`);
    for (const t of NIGHT_TABLES_INS) {
      for (const row of (snap[t] || [])) {
        const cols = Object.keys(row);
        const ph = cols.map(() => '?').join(',');
        db.prepare(`INSERT INTO ${t} (${cols.map(c => `"${c}"`).join(',')}) VALUES (${ph})`).run(...cols.map(c => row[c]));
      }
    }
    db.prepare("UPDATE night_backups SET restored_at = datetime('now') WHERE id = ?").run(bk.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); return res.status(500).json({ error: 'Error al restaurar', detalle: e.message }); }

  res.json({ ok: true });
});

// Control del % de comisión — SOLO acá (founders).
router.put('/comision', (req, res) => {
  let pct = parseFloat(req.body?.comision_wol);
  if (isNaN(pct) || pct < 0 || pct > 0.5) return res.status(400).json({ error: 'Comisión inválida (0 a 0.5)' });
  setConfig('comision_wol', pct);
  res.json({ ok: true, comision_wol: pct });
});

export default router;
