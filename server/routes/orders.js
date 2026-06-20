// routes/orders.js — ciclo de vida del pedido + pagos (Mercado Pago Checkout Pro).
import { Router } from 'express';
import QRCode from 'qrcode';
import { db, getConfig } from '../db.js';
import { randomCodigoRetiro, randomToken, randomCupon } from '../util.js';
import { createPreference, getPaymentStatus, findApprovedPayment, verifyWebhookSignature, mpEnabled } from '../payments.js';
import { serializeOrder, getOrderByToken, activeOffers } from '../models.js';

const router = Router();

// URL pública (para back_urls, webhook y QR). En Replit se setea APP_BASE_URL.
function baseUrl(req) {
  return (process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}
async function qrDataUrl(req, qr_token) {
  // El QR codifica la URL pública del pedido (un amigo puede escanearlo y ver el estado).
  const url = `${baseUrl(req)}/pedido/${qr_token}`;
  return QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#000000', light: '#ffffff' } });
}

function effectivePrice(product) {
  const offers = activeOffers();
  const off = offers.find(o => o.product_id === product.id && o.precio_especial != null);
  return off ? off.precio_especial : product.precio_actual;
}

// Código corto único (sin caracteres ambiguos), verificado contra la base.
function genUniqueCodigo() {
  for (let i = 0; i < 30; i++) {
    const c = randomCodigoRetiro(5);
    if (!db.prepare('SELECT 1 FROM orders WHERE codigo_retiro = ?').get(c)) return c;
  }
  return randomCodigoRetiro(8);
}
// qr_token único (hex aleatorio, robustamente único).
function genUniqueQr() {
  for (let i = 0; i < 30; i++) {
    const t = randomToken(20);
    if (!db.prepare('SELECT 1 FROM orders WHERE qr_token = ?').get(t)) return t;
  }
  return randomToken(28);
}
// Número de orden incremental y único, asignado al entrar a la cola.
function nextNumeroOrden() {
  return (db.prepare('SELECT COALESCE(MAX(numero_orden),0) AS m FROM orders').get().m) + 1;
}

// Pre-compra abierta? (toggle manual + cierre automático por fecha/hora) — B11.
export function precompraAbierta() {
  if (!getConfig('precompra_habilitada')) return false;
  const cierre = getConfig('precompra_cierre_dt');
  if (cierre) {
    const t = new Date(cierre);
    if (!isNaN(t) && new Date() >= t) return false;
  }
  return true;
}

// ── Crear pedido ─────────────────────────────────────────────────────────────
router.post('/orders', async (req, res) => {
  const { session, items, bar_id, tipo_pedido, mesa_origen, cupon, es_regalo, regalo_mensaje } = req.body || {};
  if (!session) return res.status(400).json({ error: 'Falta token de sesión' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Carrito vacío' });

  const regalo = !!es_regalo;
  // Un regalo todavía no tiene barra (la elige quien lo recibe). Un pedido normal sí.
  let bar = null;
  if (!regalo) {
    bar = db.prepare('SELECT * FROM bars WHERE id = ?').get(bar_id);
    if (!bar) return res.status(400).json({ error: 'Barra de retiro inválida' });
  }

  let tipo = regalo ? 'regalo' : (tipo_pedido === 'pre-pedido' ? 'pre-pedido' : 'normal');
  // B11 — bloquear pre-pedido si las pre-compras están cerradas.
  if (tipo === 'pre-pedido' && !precompraAbierta()) {
    return res.status(403).json({ error: 'Las pre-compras están cerradas en este momento.' });
  }

  // Construir ítems con precio del momento.
  let subtotal = 0;
  const built = [];
  for (const it of items) {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(it.product_id);
    if (!p) return res.status(400).json({ error: `Producto ${it.product_id} no existe` });
    if (!p.disponible) return res.status(400).json({ error: `${p.nombre} no está disponible` });
    const cantidad = Math.max(1, parseInt(it.cantidad) || 1);
    const precio = effectivePrice(p);
    subtotal += precio * cantidad;
    built.push({
      product_id: p.id, nombre: p.nombre, icono: p.icono, cantidad, precio_unit: precio,
      comentario: (p.permite_comentario && it.comentario) ? String(it.comentario).slice(0, 60) : ''
    });
  }

  // Cupón de fidelización (no aplica a regalos).
  let descuento = 0, cuponAplicado = null;
  if (cupon && !regalo) {
    const red = db.prepare('SELECT * FROM loyalty_redemptions WHERE cupon = ? AND session_token = ? AND usado = 0')
      .get(cupon, session);
    if (red) { descuento = Math.round(subtotal * red.descuento_pct); cuponAplicado = cupon; }
  }
  const total = Math.max(0, subtotal - descuento);

  const codigo = genUniqueCodigo();
  const qr = genUniqueQr();

  const r = db.prepare(`INSERT INTO orders
    (session_token,codigo_retiro,qr_token,bar_id,estado,tipo_pedido,en_cola,es_regalo,regalo_mensaje,monto_subtotal,descuento,monto_total,cupon,mesa_origen)
    VALUES (?,?,?,?,'creado',?,0,?,?,?,?,?,?,?)`)
    .run(session, codigo, qr, regalo ? null : bar_id, tipo, regalo ? 1 : 0,
      regalo ? String(regalo_mensaje || '').slice(0, 140) : '',
      subtotal, descuento, total, cuponAplicado, mesa_origen || null);
  const orderId = r.lastInsertRowid;

  const insItem = db.prepare(`INSERT INTO order_items
    (order_id,product_id,nombre,icono,cantidad,precio_unit,comentario) VALUES(?,?,?,?,?,?,?)`);
  for (const b of built) insItem.run(orderId, b.product_id, b.nombre, b.icono, b.cantidad, b.precio_unit, b.comentario);

  // Crear preferencia de pago (Mercado Pago real, o mock si no hay credenciales).
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  let pref;
  try {
    pref = await createPreference({ ...order, items: built }, baseUrl(req));
  } catch (e) {
    console.error('Error creando preferencia de pago:', e.message);
    return res.status(502).json({ error: 'No se pudo iniciar el pago. Reintentá en unos segundos.' });
  }
  db.prepare('UPDATE orders SET payment_pref_id = ? WHERE id = ?').run(pref.preferenceId, orderId);

  res.json({
    order: serializeOrder(order),
    payment: pref,
    mp_enabled: mpEnabled(),
    qr_data_url: await qrDataUrl(req, qr)
  });
});

// Acredita el pago: asigna número, define estado/cola y otorga puntos. Idempotente.
function markPaid(o) {
  if (o.estado !== 'creado') return db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id);

  const pesosPorPunto = getConfig('loyalty_pesos_por_punto') || 1000;
  const puntos = Math.floor(o.monto_total / pesosPorPunto); // proporcional al precio

  if (o.es_regalo) {
    // Pagado pero esperando que el receptor lo canjee (NO entra a la cola, sin número aún).
    db.prepare(`UPDATE orders SET estado='regalo_pendiente', paid_at=datetime('now'), en_cola=0, puntos_otorgados=? WHERE id=?`)
      .run(puntos, o.id);
  } else {
    const enCola = o.tipo_pedido === 'normal' ? 1 : 0; // pre-pedido espera "preparar ahora"
    const numero = nextNumeroOrden();
    db.prepare(`UPDATE orders SET estado='pagado', paid_at=datetime('now'), en_cola=?, numero_orden=?, puntos_otorgados=? WHERE id=?`)
      .run(enCola, numero, puntos, o.id);
  }

  if (o.cupon) db.prepare('UPDATE loyalty_redemptions SET usado = 1 WHERE cupon = ?').run(o.cupon);
  if (puntos > 0) {
    db.prepare(`INSERT INTO loyalty(session_token,puntos,updated_at) VALUES(?,?,datetime('now'))
                ON CONFLICT(session_token) DO UPDATE SET puntos = puntos + excluded.puntos, updated_at = datetime('now')`)
      .run(o.session_token, puntos);
    maybeUnlockReward(o.session_token);
  }
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id);
}

function maybeUnlockReward(session) {
  const umbral = getConfig('loyalty_umbral');
  const pct = getConfig('loyalty_recompensa_pct');
  const texto = getConfig('loyalty_recompensa_texto');
  const row = db.prepare('SELECT puntos FROM loyalty WHERE session_token = ?').get(session);
  if (!row || row.puntos < umbral) return;
  const existing = db.prepare('SELECT 1 FROM loyalty_redemptions WHERE session_token = ? AND usado = 0').get(session);
  if (existing) return;
  db.prepare(`INSERT INTO loyalty_redemptions(session_token,cupon,descripcion,descuento_pct) VALUES(?,?,?,?)`)
    .run(session, randomCupon(), texto, pct);
}

// Reconcilia un pedido contra Mercado Pago: si está 'creado' y MP tiene un pago
// APROBADO para ese pedido, lo marca pagado. Única vía (con el webhook) de pasar a
// 'pagado'. Devuelve la fila actualizada. Es la fuente de verdad que leen TODAS las pantallas.
async function reconcileOrder(o) {
  if (!o || o.estado !== 'creado' || !mpEnabled()) return o;
  const pay = await findApprovedPayment(o.id);
  if (pay && pay.status === 'approved') return markPaid(o);
  return o;
}

// ── Pago simulado (solo en modo mock, sin credenciales de MP) ────────────────
router.post('/orders/:token/pay-sim', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE qr_token = ? OR codigo_retiro = ?')
    .get(req.params.token, req.params.token);
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado' });
  const updated = markPaid(o);
  res.json({ ok: true, order: serializeOrder(updated) });
});

// ── Webhook real de Mercado Pago ─────────────────────────────────────────────
router.post('/webhooks/mercadopago', async (req, res) => {
  // 1) Validar firma x-signature contra MP_WEBHOOK_SECRET.
  if (!verifyWebhookSignature(req)) return res.sendStatus(401);
  try {
    const type = req.body?.type || req.query.type;
    const paymentId = req.body?.data?.id || req.query['data.id'] || req.query.id;
    if (type === 'payment' && paymentId) {
      // 2) Consultar el estado REAL del pago (nunca confiar solo en el cliente).
      const info = await getPaymentStatus(paymentId);
      if (info && info.status === 'approved' && info.externalReference) {
        const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(info.externalReference);
        if (o) markPaid(o);
      }
    }
  } catch (e) { console.error('webhook MP', e.message); }
  res.sendStatus(200); // siempre 200 para que MP no reintente infinito
});

// ── Confirmar al volver del checkout (back_url de éxito) ──────────────────────
// El cliente vuelve a /pedido/:token con ?payment_id&status. Si el webhook todavía
// no llegó, confirmamos consultando el pago real. Nunca confiamos solo en el status del query.
router.post('/orders/:token/confirm-return', async (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE qr_token = ? OR codigo_retiro = ?')
    .get(req.params.token, req.params.token);
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (o.estado !== 'creado') return res.json({ ok: true, order: serializeOrder(o) });
  // Confirmación robusta: si vino el payment_id lo verificamos; si no, buscamos en MP
  // por external_reference. En ambos casos solo se marca pagado si MP dice 'approved'.
  const paymentId = req.body?.payment_id || req.query?.payment_id;
  if (mpEnabled()) {
    try {
      if (paymentId) {
        const info = await getPaymentStatus(paymentId);
        if (info && info.status === 'approved') markPaid(o);
        else await reconcileOrder(o);
      } else {
        await reconcileOrder(o);
      }
    } catch (e) { /* el webhook lo confirmará */ }
  }
  res.json({ ok: true, order: serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id)) });
});

// ── Activar pre-pedido ("Quiero que lo preparen ahora") ──────────────────────
router.post('/orders/:token/activate', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE qr_token = ? OR codigo_retiro = ?')
    .get(req.params.token, req.params.token);
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (o.tipo_pedido !== 'pre-pedido') return res.status(400).json({ error: 'No es un pre-pedido' });
  if (o.estado !== 'pagado') return res.status(400).json({ error: 'El pre-pedido no está pago o ya fue procesado' });
  db.prepare('UPDATE orders SET en_cola = 1 WHERE id = ?').run(o.id);
  res.json({ ok: true, order: serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id)) });
});

// ── Canjear regalo: el receptor elige barra y lo manda a la cola (B10) ────────
router.post('/orders/:token/redeem-gift', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE qr_token = ?').get(req.params.token);
  if (!o) return res.status(404).json({ error: 'Regalo no encontrado' });
  if (!o.es_regalo) return res.status(400).json({ error: 'Este pedido no es un regalo' });
  if (o.estado !== 'regalo_pendiente') return res.status(409).json({ error: 'Este regalo ya fue canjeado' });
  const bar = db.prepare('SELECT * FROM bars WHERE id = ?').get(req.body?.bar_id);
  if (!bar) return res.status(400).json({ error: 'Elegí una barra de retiro' });
  const numero = nextNumeroOrden();
  db.prepare(`UPDATE orders SET estado='pagado', bar_id=?, en_cola=1, numero_orden=? WHERE id=?`)
    .run(bar.id, numero, o.id);
  res.json({ ok: true, order: serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(o.id)) });
});

// ── Obtener un pedido (estado en vivo, read-only para consumidor) ────────────
router.get('/orders/:token', async (req, res) => {
  let row = db.prepare('SELECT * FROM orders WHERE qr_token = ? OR codigo_retiro = ?')
    .get(req.params.token, req.params.token);
  if (!row) return res.status(404).json({ error: 'Pedido no encontrado' });
  // Reconciliar contra MP si sigue 'creado' (fuente de verdad única para todas las pantallas).
  if (row.estado === 'creado') { await reconcileOrder(row); row = db.prepare('SELECT * FROM orders WHERE id = ?').get(row.id); }
  const out = serializeOrder(row);
  if (req.query.qr === '1') out.qr_data_url = await qrDataUrl(req, row.qr_token);
  res.json(out);
});

// ── Historial de pedidos de una sesión ───────────────────────────────────────
router.get('/sessions/:session/orders', async (req, res) => {
  let rows = db.prepare('SELECT * FROM orders WHERE session_token = ? ORDER BY id DESC').all(req.params.session);
  // Reconciliar contra MP los pedidos que sigan 'creado' (misma lógica que el detalle).
  if (mpEnabled()) {
    const creados = rows.filter(o => o.estado === 'creado');
    if (creados.length) {
      await Promise.all(creados.map(reconcileOrder));
      rows = db.prepare('SELECT * FROM orders WHERE session_token = ? ORDER BY id DESC').all(req.params.session);
    }
  }
  res.json(rows.map(serializeOrder));
});

export default router;
