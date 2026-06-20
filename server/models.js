// models.js — consultas y serialización reutilizables.
import { db, getConfig } from './db.js';
import { franjaActual } from './util.js';

export function serializeProduct(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    categoria: p.categoria,
    precio_base: p.precio_base,
    precio_min: p.precio_min,
    precio_max: p.precio_max,
    precio_actual: p.precio_actual,
    icono: p.icono,
    margen: p.margen,
    disponible: !!p.disponible,
    es_combo: !!p.es_combo,
    productos_incluidos: p.productos_incluidos,
    permite_comentario: !!p.permite_comentario,
    comentario_placeholder: p.comentario_placeholder,
    orden: p.orden,
    imagen_url: p.imagen_url,
    imagen_botella_url: p.imagen_botella_url
  };
}

export function allProducts() {
  return db.prepare('SELECT * FROM products ORDER BY orden, id').all().map(serializeProduct);
}

export function productById(id) {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  return p ? serializeProduct(p) : null;
}

export function activeOffers() {
  const rows = db.prepare('SELECT * FROM offers WHERE activo = 1 ORDER BY id').all();
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return rows
    .filter(o => {
      if (o.hora_inicio && o.hora_fin) return hhmm >= o.hora_inicio && hhmm <= o.hora_fin;
      return true;
    })
    .map(o => ({
      ...o,
      activo: !!o.activo,
      producto: o.product_id ? productById(o.product_id) : null
    }));
}

// Ranking en vivo: top productos por unidades vendidas en pedidos pagados.
export function liveRanking(limit = 5) {
  return db.prepare(`
    SELECT oi.product_id AS id, oi.nombre, oi.icono, SUM(oi.cantidad) AS unidades
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.estado != 'cancelado' AND o.estado != 'creado' AND oi.product_id IS NOT NULL
    GROUP BY oi.product_id
    ORDER BY unidades DESC
    LIMIT ?`).all(limit);
}

// Motor de recomendaciones por reglas (sección 5).
export function buildRecommendations(cartProductIds = []) {
  const reglas = getConfig('reglas') || {};
  const products = allProducts().filter(p => !reglas.stock || p.disponible);
  const out = { recomendados: [], mas_pedidos: [], cross_sell: [] };

  // Regla 4 — ranking en vivo
  if (reglas.ranking !== false) {
    out.mas_pedidos = liveRanking(5);
  }

  // Regla 1 + 2 — por margen y por momento de la noche
  if (reglas.margen !== false || reglas.momento !== false) {
    const franja = franjaActual(getConfig('time_slot'));
    let scored = products.map(p => {
      let score = 0;
      if (reglas.margen !== false) {
        if (p.margen === 'altisimo') score += 4;
        else if (p.margen === 'alto') score += 3;
        else if (p.margen === 'medio') score += 1;
      }
      if (reglas.momento !== false) {
        // Temprano: combos/botellas. Tarde: tragos individuales, agua, isotónicas.
        if (franja === 'temprano' && (p.es_combo || p.categoria === 'Cervezas')) score += 2;
        if (franja === 'tarde' && (p.categoria === 'Tragos' || p.categoria === 'Sin alcohol')) score += 2;
      }
      return { p, score };
    });
    scored.sort((a, b) => b.score - a.score);
    out.recomendados = scored.slice(0, 5).filter(s => s.score > 0).map(s => s.p);
    out.franja = franja;
  }

  // Regla 3 — cross-sell según contenido del carrito
  if (reglas.crosssell !== false && cartProductIds.length) {
    const placeholders = cartProductIds.map(() => '?').join(',');
    const ids = db.prepare(`
      SELECT DISTINCT suggested_product_id AS id FROM cross_sell
      WHERE trigger_product_id IN (${placeholders})`).all(...cartProductIds).map(r => r.id);
    const inCart = new Set(cartProductIds);
    out.cross_sell = ids
      .filter(id => !inCart.has(id))
      .map(id => productById(id))
      .filter(p => p && (!reglas.stock || p.disponible));
  }

  return out;
}

// Ocupación/demanda por barra: pedidos en cola (pagado/en_preparacion) recientes.
export function barOccupancy() {
  const windowMin = getConfig('occupancy_window_min') || 15;
  const bars = db.prepare('SELECT * FROM bars ORDER BY orden').all();
  return bars.map(b => {
    const row = db.prepare(`
      SELECT COUNT(*) AS n FROM orders
      WHERE bar_id = ? AND en_cola = 1 AND estado IN ('pagado','listo')
        AND created_at >= datetime('now', ?)`).get(b.id, `-${windowMin} minutes`);
    const n = row.n;
    let nivel = 'tranquila', color = 'verde';
    if (n >= 6) { nivel = 'muy demandada'; color = 'rojo'; }
    else if (n >= 3) { nivel = 'movida'; color = 'amarillo'; }
    return { id: b.id, nombre: b.nombre, ubicacion: b.ubicacion, pendientes: n, nivel, color };
  });
}

// Serializa un pedido completo con sus ítems.
export function getOrderByToken(token) {
  const o = db.prepare('SELECT * FROM orders WHERE qr_token = ? OR codigo_retiro = ?').get(token, token);
  if (!o) return null;
  return serializeOrder(o);
}

export function serializeOrder(o) {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(o.id);
  const bar = db.prepare('SELECT * FROM bars WHERE id = ?').get(o.bar_id);
  return {
    id: o.id,
    numero_orden: o.numero_orden,
    codigo_retiro: o.codigo_retiro,
    qr_token: o.qr_token,
    bar: bar ? { id: bar.id, nombre: bar.nombre, ubicacion: bar.ubicacion } : null,
    bar_id: o.bar_id,
    estado: o.estado,
    tipo_pedido: o.tipo_pedido,
    en_cola: !!o.en_cola,
    es_regalo: !!o.es_regalo,
    regalo_mensaje: o.regalo_mensaje || '',
    monto_subtotal: o.monto_subtotal,
    descuento: o.descuento,
    monto_total: o.monto_total,
    cupon: o.cupon,
    puntos_otorgados: o.puntos_otorgados,
    mesa_origen: o.mesa_origen,
    created_at: o.created_at,
    paid_at: o.paid_at,
    prep_at: o.prep_at,
    ready_at: o.ready_at,
    delivered_at: o.delivered_at,
    cancelled_at: o.cancelled_at,
    nota_admin: o.nota_admin || '',
    items: items.map(it => ({
      id: it.id, product_id: it.product_id, nombre: it.nombre, icono: it.icono,
      cantidad: it.cantidad, precio_unit: it.precio_unit, comentario: it.comentario
    }))
  };
}
