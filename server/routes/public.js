// routes/public.js — endpoints sin autenticación para la interfaz de consumidor.
import { Router } from 'express';
import { db, getConfig } from '../db.js';
import { allProducts, activeOffers, buildRecommendations, barOccupancy } from '../models.js';
import { precompraAbierta } from './orders.js';
import { mpEnabled } from '../payments.js';

const router = Router();

// Config pública (lo que el front necesita saber sin exponer secretos).
router.get('/config', (req, res) => {
  res.json({
    nombre_noche: getConfig('nombre_noche'),
    loyalty_pesos_por_punto: getConfig('loyalty_pesos_por_punto'),
    loyalty_umbral: getConfig('loyalty_umbral'),
    loyalty_recompensa_pct: getConfig('loyalty_recompensa_pct'),
    loyalty_recompensa_texto: getConfig('loyalty_recompensa_texto'),
    contacto_wol: getConfig('contacto_wol'),
    precompra_abierta: precompraAbierta(),
    mp_enabled: mpEnabled()
  });
});

// Catálogo: categorías + productos.
router.get('/menu', (req, res) => {
  const products = allProducts();
  const categorias = [];
  for (const p of products) if (!categorias.includes(p.categoria)) categorias.push(p.categoria);
  res.json({ categorias, products, offers: activeOffers() });
});

router.get('/offers', (req, res) => res.json(activeOffers()));

// Barras + ocupación (para el mapa).
router.get('/bars', (req, res) => {
  res.json(db.prepare('SELECT id,nombre,ubicacion,orden FROM bars ORDER BY orden').all());
});

router.get('/occupancy', (req, res) => res.json(barOccupancy()));

// Recomendaciones (acepta ?cart=1,2,3 con ids del carrito para el cross-sell).
router.get('/recommendations', (req, res) => {
  const cart = (req.query.cart || '').split(',').map(Number).filter(Boolean);
  res.json(buildRecommendations(cart));
});

// Fidelización de una sesión.
router.get('/loyalty/:session', (req, res) => {
  const session = req.params.session;
  const row = db.prepare('SELECT puntos FROM loyalty WHERE session_token = ?').get(session);
  const puntos = row ? row.puntos : 0;
  const umbral = getConfig('loyalty_umbral');
  const redenciones = db.prepare(
    'SELECT cupon,descripcion,descuento_pct,usado,created_at FROM loyalty_redemptions WHERE session_token = ? ORDER BY id DESC'
  ).all(session).map(r => ({ ...r, usado: !!r.usado }));
  res.json({
    puntos,
    umbral,
    recompensa_texto: getConfig('loyalty_recompensa_texto'),
    recompensa_pct: getConfig('loyalty_recompensa_pct'),
    pesos_por_punto: getConfig('loyalty_pesos_por_punto'),
    cupones: redenciones
  });
});

// Encuesta de fin de noche.
router.post('/survey', (req, res) => {
  const { session, rating, nps, sugerencia_trago, comentario } = req.body || {};
  if (!session) return res.status(400).json({ error: 'Falta session' });
  db.prepare(`INSERT INTO surveys(session_token,rating,nps,sugerencia_trago,comentario)
              VALUES(?,?,?,?,?)`)
    .run(session, rating || null, nps || null, sugerencia_trago || '', comentario || '');
  res.json({ ok: true });
});

export default router;
