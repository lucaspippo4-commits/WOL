// routes/demo.js — API exclusiva del MODO DEMO (DEMO_MODE=true).
// Nunca se monta en producción. Trabaja siempre sobre la base en memoria.
//   · Estado del pricing dinámico (movimientos, notificación in-app, ocupación)
//   · "Simulate demand spike" / rebalanceo
//   · Analytics por hora para el dashboard
//   · Reset de los datos de la demo
//   · Auto-autenticación del staff (la demo no tiene logins)
import { Router } from 'express';
import { db } from '../db.js';
import { issueToken } from '../auth.js';
import { barOccupancy } from '../models.js';
import { seedDemo, DEMO_GUEST_SESSION } from '../demo-seed.js';

const router = Router();

// ── Estado en memoria del relato de pricing ──────────────────────────────────
// movements: { [productId]: { dir: 'up'|'down', prev, now, reason } }
const state = {
  movements: {},
  notice: null,        // notificación in-app simulada para el consumidor
  occupancyBoost: {},  // pedidos "fantasma" por barra para contar la historia
  spikeOn: false,
  noticeSeq: 1,
};

const round100 = (n) => Math.round(n / 100) * 100;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function setPrice(productId, newPrice, dir, reason) {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!p || newPrice === p.precio_actual) return;
  db.prepare('UPDATE products SET precio_actual = ? WHERE id = ?').run(newPrice, productId);
  state.movements[productId] = { dir, prev: p.precio_actual, now: newPrice, reason };
}

// Historia inicial: la noche ya viene con un par de movimientos para que la
// sección de Dynamic Pricing (y los badges de la carta) no arranquen vacíos.
export function initPricingStory() {
  state.movements = {};
  state.spikeOn = false;
  state.occupancyBoost = {};
  const byName = (n) => db.prepare('SELECT * FROM products WHERE nombre = ?').get(n);
  const gin = byName("Gin Tonic Gordon's");
  if (gin) setPrice(gin.id, clamp(round100(gin.precio_base * 1.06), gin.precio_min, gin.precio_max),
    'up', 'Peak demand next to the dancefloor (Bar 2)');
  const speed = byName('Speed Unlimited');
  if (speed) setPrice(speed.id, clamp(round100(speed.precio_base * 0.9), speed.precio_min, speed.precio_max),
    'down', 'Idle capacity at the patio bar — nudging demand to Bar 4');
  state.notice = null;
}

// ── Estado público de la demo ────────────────────────────────────────────────
router.get('/demo/state', (req, res) => {
  res.json({
    demo: true,
    guest_session: DEMO_GUEST_SESSION,
    spike_on: state.spikeOn,
    movements: state.movements,
    notice: state.notice,
  });
});

// ── Simular pico de demanda / rebalanceo ─────────────────────────────────────
// Alterna: 1º toque = pico (suben los saturados, bajan los ociosos);
// 2º toque = el sistema redistribuyó la demanda y los precios vuelven a aflojar.
router.post('/demo/spike', (req, res) => {
  const products = db.prepare('SELECT * FROM products').all();

  if (!state.spikeOn) {
    state.spikeOn = true;
    state.occupancyBoost = { barra_1: 4, barra_2: 7, barra_3: 2, barra_4: 0 };
    for (const p of products) {
      if (p.categoria === 'Drinks' || p.categoria === 'Combos') {
        const target = clamp(round100(p.precio_actual * (1.06 + Math.random() * 0.06)), p.precio_min, p.precio_max);
        if (target > p.precio_actual) setPrice(p.id, target, 'up', 'Demand spike at Bars 1–2 — capturing peak within the owner\'s limits');
      } else if (p.categoria === 'Zero proof' || p.categoria === 'Beer') {
        const target = clamp(round100(p.precio_actual * (0.85 + Math.random() * 0.05)), p.precio_min, p.precio_max);
        if (target < p.precio_actual) setPrice(p.id, target, 'down', 'Bar 4 (patio) has idle capacity — discounting to move demand there');
      }
    }
    const vodka = products.find(p => p.nombre === 'Vodka Smirnoff con Speed');
    state.notice = {
      id: state.noticeSeq++,
      emoji: '🔥',
      title: 'Price drop',
      text: `${vodka ? vodka.nombre : 'Vodka + Speed'} just dropped at Bar 4 — the quietest bar right now.`,
    };
    // El "pico" también baja el trago estrella para redistribuir hacia Bar 4.
    if (vodka) setPrice(vodka.id, clamp(round100(vodka.precio_actual * 0.92), vodka.precio_min, vodka.precio_max),
      'down', 'Rerouting demand to Bar 4 — the quietest bar right now');
  } else {
    // Rebalanceo: la demanda se repartió, los precios vuelven hacia el base.
    state.spikeOn = false;
    state.occupancyBoost = { barra_1: 1, barra_2: 2, barra_3: 1, barra_4: 2 };
    for (const p of products) {
      const target = clamp(round100(p.precio_base), p.precio_min, p.precio_max);
      if (target !== p.precio_actual) {
        setPrice(p.id, target, target > p.precio_actual ? 'up' : 'down', 'Demand rebalanced across bars — easing back to base price');
      }
    }
    state.notice = {
      id: state.noticeSeq++,
      emoji: '⚖️',
      title: 'Demand rebalanced',
      text: 'Queues evened out across the four bars — prices are easing back to base.',
    };
  }
  res.json({ ok: true, spike_on: state.spikeOn, movements: state.movements, notice: state.notice });
});

// ── Ocupación con la historia de la demo ────────────────────────────────────
// Pisa el GET /occupancy público SOLO en modo demo (este router se monta antes).
router.get('/occupancy', (req, res) => {
  const occ = barOccupancy().map(b => {
    const boost = state.occupancyBoost[b.id] || 0;
    const n = b.pendientes + boost;
    let nivel = 'quiet', color = 'verde';
    if (n >= 6) { nivel = 'slammed'; color = 'rojo'; }
    else if (n >= 3) { nivel = 'busy'; color = 'amarillo'; }
    return { ...b, pendientes: n, nivel, color };
  });
  res.json(occ);
});

// ── Analytics por hora (curva de demanda del dashboard) ──────────────────────
router.get('/demo/analytics', (req, res) => {
  const rows = db.prepare(`
    SELECT CAST((julianday('now') - julianday(paid_at)) * 24 AS INTEGER) AS hours_ago,
           COUNT(*) AS orders, COALESCE(SUM(monto_total),0) AS revenue
    FROM orders
    WHERE paid_at IS NOT NULL AND estado NOT IN ('creado','cancelado')
    GROUP BY hours_ago`).all();
  const hours = [];
  for (let h = 7; h >= 0; h--) {
    const r = rows.find(x => x.hours_ago === h);
    hours.push({ hours_ago: h, orders: r ? r.orders : 0, revenue: r ? r.revenue : 0 });
  }
  res.json({ hours });
});

// ── Reset de la demo ─────────────────────────────────────────────────────────
router.post('/demo/reset', (req, res) => {
  seedDemo();
  initPricingStory();
  res.json({ ok: true });
});

// ── Auto-autenticación del staff (sin logins en la demo) ─────────────────────
// Inyecta un token del usuario `demo` (rol admin, solo existe en la base en
// memoria) en cada request a /api/staff y /api/admin. Así las vistas de
// bartender/admin funcionan de una, y los endpoints siguen pasando por el
// middleware de auth real — no se abre ningún endpoint del modo real.
export function demoAuthInject(req, res, next) {
  if (!req.headers.authorization) {
    const s = db.prepare("SELECT * FROM staff WHERE usuario = 'demo' AND activo = 1").get();
    if (s) req.headers.authorization = 'Bearer ' + issueToken(s);
  }
  next();
}

export default router;
