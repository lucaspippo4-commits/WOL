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

// Control del % de comisión — SOLO acá (founders).
router.put('/comision', (req, res) => {
  let pct = parseFloat(req.body?.comision_wol);
  if (isNaN(pct) || pct < 0 || pct > 0.5) return res.status(400).json({ error: 'Comisión inválida (0 a 0.5)' });
  setConfig('comision_wol', pct);
  res.json({ ok: true, comision_wol: pct });
});

export default router;
